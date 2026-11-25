import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { EditorState, Facet, StateField, type Range } from '@codemirror/state';
import type { LinkAt } from '../src/linknote';
import { cellHtml } from '../src/render';
import {
  deleteCol,
  deleteRow,
  findTables,
  insertCol,
  insertRow,
  parseTable,
  setAlign,
  setCell,
  writeTable,
  type Align,
  type TableBlock,
  type TableModel,
} from '../src/tables';

/**
 * A markdown table drawn as a table, and edited as one. Click a cell and type: the cell shows its plain markdown while you
 * are in it and its formatted text (bold, links and so on) when you leave. Only the lines of that table are rewritten, and
 * a row you did not change keeps its own text. A table that cannot be edited without losing something (a row with more
 * cells than the header) is left as text, and clicking it shows the markdown.
 */
export const tableOptions = Facet.define<{ openLink?: (link: LinkAt) => void }, { openLink?: (link: LinkAt) => void }>({ combine: (v) => v[0] ?? {} });

interface Focus {
  start: number;
  r: number;
  c: number;
  select?: 'all' | 'end' | 'start';
}

/** Where to put the caret once a change to a table has redrawn it. */
let pending: Focus | undefined;

interface Ctl {
  view: EditorView;
  wrap: HTMLElement;
  t: TableBlock;
  active?: { r: number; c: number; ta: HTMLTextAreaElement };
  timer?: number;
  activate: (r: number, c: number, select?: Focus['select']) => void;
  refresh: (t: TableBlock) => void;
}
const ctls = new WeakMap<HTMLElement, Ctl>();

const sig = (t: TableBlock): string => `${t.start}:${t.head.length}:${t.rows.length}:${t.align.join(',')}`;
const same = (a: TableBlock, b: TableBlock): boolean =>
  JSON.stringify([a.start, a.head, a.align, a.rows]) === JSON.stringify([b.start, b.head, b.align, b.rows]);

function docLines(state: EditorState): string[] {
  const out: string[] = [];
  for (let n = 1; n <= state.doc.lines; n++) out.push(state.doc.line(n).text);
  return out;
}

/** Write a changed table back as the smallest change to the note: only the lines that differ. Returns false when nothing changed. */
function write(ctl: Ctl, edit: (m: TableModel) => TableModel, focus?: { r: number; c: number; select?: Focus['select'] }): boolean {
  const { view } = ctl;
  const lines = docLines(view.state);
  const block = findTables(lines).find((b) => b.start === ctl.t.start);
  const model = block && parseTable(block);
  if (!block || !model) return false;
  let m = model;
  if (ctl.active) m = setCell(m, ctl.active.r, ctl.active.c, ctl.active.ta.value);
  m = edit(m);
  const old = lines.slice(block.start, block.end + 1);
  const next = writeTable(m, old);
  let a = 0;
  while (a < old.length && a < next.length && old[a] === next[a]) a++;
  let b = 0;
  while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
  const oldMid = old.slice(a, old.length - b);
  const newMid = next.slice(a, next.length - b);
  if (!oldMid.length && !newMid.length) return false;
  const doc = view.state.doc;
  const from = (i: number): number => doc.line(block.start + 1 + i).from;
  const to = (i: number): number => doc.line(block.start + 1 + i).to;
  let change: { from: number; to: number; insert: string };
  if (oldMid.length && newMid.length) change = { from: from(a), to: to(a + oldMid.length - 1), insert: newMid.join('\n') };
  else if (!oldMid.length)
    change =
      a < old.length
        ? { from: from(a), to: from(a), insert: `${newMid.join('\n')}\n` }
        : { from: to(old.length - 1), to: to(old.length - 1), insert: `\n${newMid.join('\n')}` };
  else
    change =
      a + oldMid.length < old.length
        ? { from: from(a), to: from(a + oldMid.length), insert: '' }
        : { from: to(a - 1), to: to(a + oldMid.length - 1), insert: '' };
  if (focus) pending = { start: block.start, ...focus };
  view.dispatch({ changes: change, userEvent: 'input.table' });
  // The table was redrawn in place (same shape), so nothing built the new cell for the caret: do it now.
  if (pending && ctl.wrap.isConnected && ctls.get(ctl.wrap) === ctl) {
    const p = pending;
    pending = undefined;
    ctl.activate(p.r, p.c, p.select);
  }
  return true;
}

const ALIGNS: [Align, string][] = [
  ['left', 'Left'],
  ['center', 'Center'],
  ['right', 'Right'],
];

class TableWidget extends WidgetType {
  constructor(readonly t: TableBlock) {
    super();
  }
  eq(o: TableWidget): boolean {
    return same(o.t, this.t);
  }
  updateDOM(dom: HTMLElement): boolean {
    const ctl = ctls.get(dom);
    if (!ctl || sig(ctl.t) !== sig(this.t)) return false;
    ctl.refresh(this.t);
    return true;
  }
  ignoreEvent(): boolean {
    return true;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table';
    wrap.setAttribute('role', 'group');
    const editable = !!parseTable(this.t);
    wrap.setAttribute('aria-label', editable ? 'Table. Click a cell to edit it.' : 'Table. Press Enter to edit its markdown.');
    const ctl: Ctl = { view, wrap, t: this.t, activate: () => undefined, refresh: () => undefined };
    ctls.set(wrap, ctl);
    if (!editable) return this.readOnly(wrap, view);

    const tb = document.createElement('div');
    tb.className = 'tb';
    tb.setAttribute('role', 'toolbar');
    tb.setAttribute('aria-label', 'Table tools');
    const scroll = document.createElement('div');
    scroll.className = 'tscroll';
    const table = document.createElement('table');
    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.className = 'tadd';
    addRow.textContent = '+ Add a row';
    wrap.append(tb, scroll, addRow);
    scroll.appendChild(table);

    const cellEl = (r: number, c: number): HTMLElement | null => table.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    const textOf = (r: number, c: number): string => (r < 0 ? ctl.t.head[c] : ctl.t.rows[r]?.[c]) ?? '';

    const showView = (r: number, c: number): void => {
      const td = cellEl(r, c);
      if (!td) return;
      const cv = document.createElement('div');
      cv.className = 'cv';
      cv.tabIndex = r === -1 && c === 0 ? 0 : -1;
      cv.setAttribute('role', 'textbox');
      cv.setAttribute('aria-readonly', 'true');
      cv.setAttribute('aria-label', `${r < 0 ? 'Heading' : `Row ${r + 1}`}, column ${c + 1}. Press Enter to edit.`);
      const html = cellHtml(textOf(r, c));
      cv.innerHTML = html || '&nbsp;';
      td.replaceChildren(cv);
    };

    const build = (): void => {
      const n = ctl.t.head.length;
      table.replaceChildren();
      const head = document.createElement('thead');
      const hr = document.createElement('tr');
      const body = document.createElement('tbody');
      const mk = (tag: 'th' | 'td', r: number, c: number): HTMLElement => {
        const el = document.createElement(tag);
        el.dataset.r = String(r);
        el.dataset.c = String(c);
        el.className = 'c';
        const a = ctl.t.align[c];
        if (a) el.style.textAlign = a;
        return el;
      };
      for (let c = 0; c < n; c++) hr.appendChild(mk('th', -1, c));
      const addCol = document.createElement('th');
      addCol.className = 'tcol';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tadd tadd-col';
      b.setAttribute('aria-label', 'Add a column');
      b.textContent = '+';
      addCol.appendChild(b);
      hr.appendChild(addCol);
      head.appendChild(hr);
      for (let r = 0; r < ctl.t.rows.length; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < n; c++) tr.appendChild(mk('td', r, c));
        body.appendChild(tr);
      }
      table.append(head, body);
      for (let c = 0; c < n; c++) showView(-1, c);
      for (let r = 0; r < ctl.t.rows.length; r++) for (let c = 0; c < n; c++) showView(r, c);
    };

    const deactivate = (): void => {
      const a = ctl.active;
      if (!a) return;
      ctl.active = undefined;
      window.clearTimeout(ctl.timer);
      showView(a.r, a.c);
    };

    const commit = (): void => {
      window.clearTimeout(ctl.timer);
      if (ctl.active) write(ctl, (m) => m);
    };

    /** Put the caret in a cell (the cell becomes a text box), after saving the one you were in. */
    ctl.activate = (r, c, select = 'end'): void => {
      const n = ctl.t.head.length;
      if (c < 0 || c >= n || r < -1 || r >= ctl.t.rows.length) return;
      const td = cellEl(r, c);
      if (!td) return;
      deactivate();
      const ta = document.createElement('textarea');
      ta.className = 'ci';
      ta.rows = 1;
      ta.value = textOf(r, c);
      ta.setAttribute('aria-label', `${r < 0 ? 'Heading' : `Row ${r + 1}`}, column ${c + 1}`);
      ta.spellcheck = true;
      const fit = (): void => {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      };
      ta.addEventListener('input', () => {
        fit();
        window.clearTimeout(ctl.timer);
        ctl.timer = window.setTimeout(commit, 700);
      });
      ta.addEventListener('keydown', (e) => keydown(e, ta, r, c));
      ta.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text/plain');
        if (text === undefined || !/\r|\n/.test(text)) return;
        e.preventDefault();
        ta.setRangeText(text.replace(/\r?\n/g, ' ').trim(), ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      });
      td.replaceChildren(ta);
      ctl.active = { r, c, ta };
      wrap.classList.add('editing');
      fit();
      ta.focus();
      if (select === 'all') ta.select();
      else if (select === 'start') ta.setSelectionRange(0, 0);
      else ta.setSelectionRange(ta.value.length, ta.value.length);
      syncTools();
    };

    ctl.refresh = (t: TableBlock): void => {
      ctl.t = t;
      const a = ctl.active;
      for (let r = -1; r < t.rows.length; r++) for (let c = 0; c < t.head.length; c++) if (!(a && a.r === r && a.c === c)) showView(r, c);
    };

    /** Go to a cell, saving this one first. Past the last cell, a row is added. */
    const go = (r: number, c: number, select: Focus['select'] = 'all'): void => {
      const n = ctl.t.head.length;
      const m = ctl.t.rows.length;
      if (r >= m && c >= 0) {
        write(ctl, (x) => insertRow(x, m), { r: m, c: Math.min(c, n - 1), select });
        return;
      }
      if (!write(ctl, (x) => x, { r, c, select })) ctl.activate(r, c, select);
    };

    const keydown = (e: KeyboardEvent, ta: HTMLTextAreaElement, r: number, c: number): void => {
      const n = ctl.t.head.length;
      const m = ctl.t.rows.length;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'b' || e.key === 'B' || e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        mark(ta, e.key.toLowerCase() === 'b' ? '**' : '*');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (c > 0) go(r, c - 1);
          else if (r > -1) go(r - 1, n - 1);
        } else if (c + 1 < n) go(r, c + 1);
        else go(r + 1, 0);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        ta.setRangeText('<br>', ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(r + 1, c);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commit();
        exit();
      } else if (e.key === 'ArrowUp' && r > -1 && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault();
        go(r - 1, c, 'end');
      } else if (e.key === 'ArrowDown' && r + 1 < m && ta.selectionStart === ta.value.length) {
        e.preventDefault();
        go(r + 1, c, 'start');
      } else if (e.key === 'ArrowLeft' && ta.selectionStart === 0 && ta.selectionEnd === 0 && (c > 0 || r > -1)) {
        e.preventDefault();
        if (c > 0) go(r, c - 1, 'end');
        else go(r - 1, n - 1, 'end');
      } else if (e.key === 'ArrowRight' && ta.selectionStart === ta.value.length && (c + 1 < n || r + 1 < m)) {
        e.preventDefault();
        if (c + 1 < n) go(r, c + 1, 'start');
        else go(r + 1, 0, 'start');
      }
    };

    const exit = (): void => {
      deactivate();
      wrap.classList.remove('editing');
      view.focus();
    };

    /** Wrap the selected text in a mark (or take it off again). */
    const mark = (ta: HTMLTextAreaElement, m: string): void => {
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      if (v.slice(Math.max(0, s - m.length), s) === m && v.slice(e, e + m.length) === m) {
        ta.setRangeText(v.slice(s, e), s - m.length, e + m.length, 'end');
        ta.setSelectionRange(s - m.length, e - m.length);
      } else {
        ta.setRangeText(`${m}${v.slice(s, e)}${m}`, s, e, 'end');
        ta.setSelectionRange(s + m.length, e + m.length);
      }
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    };

    const tools: { label: string; title: string; run: () => void; key?: string }[] = [];
    const act = (edit: (x: TableModel, r: number, c: number) => TableModel, focus: (r: number, c: number) => { r: number; c: number }): void => {
      const a = ctl.active;
      const r = a?.r ?? -1;
      const c = a?.c ?? 0;
      write(ctl, (x) => edit(x, r, c), { ...focus(r, c), select: 'end' });
    };
    const btn = (label: string, title: string, run: () => void, cls = ''): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tbtn ${cls}`.trim();
      b.innerHTML = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret in the cell
      b.addEventListener('click', run);
      tb.appendChild(b);
      tools.push({ label, title, run });
    };
    const sep = (): void => {
      const s = document.createElement('span');
      s.className = 'tsep';
      tb.appendChild(s);
    };
    const fmt =
      (m: string): (() => void) =>
      () =>
        ctl.active && mark(ctl.active.ta, m);
    btn('+ Row', 'Add a row below', () =>
      act(
        (x, r) => insertRow(x, r + 1),
        (r, c) => ({ r: r + 1, c }),
      ),
    );
    btn('+ Column', 'Add a column to the right', () =>
      act(
        (x, _r, c) => insertCol(x, c + 1),
        (r, c) => ({ r, c: c + 1 }),
      ),
    );
    btn(
      'Delete row',
      'Delete this row',
      () =>
        act(
          (x, r) => deleteRow(x, r),
          (r, c) => ({ r: Math.max(-1, Math.min(r, ctl.t.rows.length - 2)), c }),
        ),
      'tdel',
    );
    btn(
      'Delete column',
      'Delete this column',
      () =>
        act(
          (x, _r, c) => deleteCol(x, c),
          (r, c) => ({ r, c: Math.max(0, Math.min(c, ctl.t.head.length - 2)) }),
        ),
      'tdel',
    );
    sep();
    for (const [a, name] of ALIGNS)
      btn(
        name,
        `Align this column ${name.toLowerCase()}`,
        () =>
          act(
            (x, _r, c) => setAlign(x, c, x.align[c] === a ? null : a),
            (r, c) => ({ r, c }),
          ),
        `talign talign-${a}`,
      );
    sep();
    btn('<b>B</b>', 'Bold (Ctrl or Cmd+B)', fmt('**'));
    btn('<i>I</i>', 'Italic (Ctrl or Cmd+I)', fmt('*'));
    btn('<code>`</code>', 'Code', fmt('`'));
    btn('Link', 'Link', () => {
      const a = ctl.active;
      if (!a) return;
      const ta = a.ta;
      const { selectionStart: s, selectionEnd: e, value: v } = ta;
      const label = v.slice(s, e) || 'link';
      ta.setRangeText(`[${label}](https://)`, s, e, 'end');
      ta.setSelectionRange(s + label.length + 3, s + label.length + 11);
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    });
    sep();
    btn('Show markdown', 'Show this table as markdown', () => {
      commit();
      deactivate();
      view.dispatch({ selection: { anchor: view.state.doc.line(ctl.t.start + 1).from }, scrollIntoView: true });
      view.focus();
    });

    /** The toolbar shows the column's alignment, and the header row cannot be deleted. */
    const syncTools = (): void => {
      const a = ctl.active;
      const col = a ? ctl.t.align[a.c] : null;
      tb.querySelectorAll<HTMLButtonElement>('.talign').forEach((b) => {
        const mine = b.classList.contains(`talign-${col}`);
        b.setAttribute('aria-pressed', String(mine));
      });
      const del = tb.querySelector<HTMLButtonElement>('button[title="Delete this row"]');
      if (del) del.disabled = !a || a.r < 0;
      const delc = tb.querySelector<HTMLButtonElement>('button[title="Delete this column"]');
      if (delc) delc.disabled = ctl.t.head.length < 2;
    };

    build();
    const orig = ctl.refresh;
    ctl.refresh = (t) => {
      orig(t);
      table.querySelectorAll<HTMLElement>('th.c, td.c').forEach((el) => {
        const a = t.align[Number(el.dataset.c)];
        el.style.textAlign = a ?? '';
      });
      syncTools();
    };

    // Events.
    table.addEventListener('mousedown', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.tadd-col')) {
        e.preventDefault();
        write(ctl, (x) => insertCol(x, x.head.cells.length), { r: -1, c: ctl.t.head.length, select: 'all' });
        return;
      }
      if (el.closest('a')) return; // links work as links
      const td = el.closest<HTMLElement>('td.c, th.c');
      if (td && !td.querySelector('textarea')) {
        e.preventDefault();
        ctl.activate(Number(td.dataset.r), Number(td.dataset.c), 'end');
      }
    });
    table.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.wl');
      if (a) {
        e.preventDefault();
        view.state.facet(tableOptions).openLink?.({ kind: 'wiki', target: a.dataset.wiki ?? '' });
      }
    });
    table.addEventListener('keydown', (e) => {
      const cv = (e.target as HTMLElement).closest<HTMLElement>('.cv');
      if (!cv) return;
      const td = cv.parentElement as HTMLElement;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const focusCv = (rr: number, cc: number): void => {
        const next = cellEl(rr, cc)?.querySelector<HTMLElement>('.cv');
        if (!next) return;
        table.querySelectorAll<HTMLElement>('.cv[tabindex="0"]').forEach((x) => (x.tabIndex = -1));
        next.tabIndex = 0;
        next.focus();
      };
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        ctl.activate(r, c, 'end');
      } else if (e.key === 'ArrowDown') (e.preventDefault(), focusCv(r + 1, c));
      else if (e.key === 'ArrowUp') (e.preventDefault(), focusCv(r - 1, c));
      else if (e.key === 'ArrowRight') (e.preventDefault(), focusCv(r, c + 1));
      else if (e.key === 'ArrowLeft') (e.preventDefault(), focusCv(r, c - 1));
    });
    addRow.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const m = ctl.t.rows.length;
      write(ctl, (x) => insertRow(x, x.rows.length), { r: m, c: 0, select: 'start' });
    });
    // Leaving the table (not just moving between its cells) saves the cell and hides the tools.
    wrap.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!wrap.isConnected || wrap.contains(document.activeElement)) return;
        commit();
        deactivate();
        wrap.classList.remove('editing');
      }, 0);
    });

    if (pending && pending.start === this.t.start) {
      const p = pending;
      pending = undefined;
      queueMicrotask(() => ctl.activate(p.r, p.c, p.select));
    }
    return wrap;
  }

  /** A table that cannot be edited cell by cell is drawn plainly; clicking it shows the markdown. */
  private readOnly(wrap: HTMLElement, view: EditorView): HTMLElement {
    wrap.tabIndex = 0;
    const table = document.createElement('table');
    const row = (tag: 'th' | 'td', cells: string[]): HTMLElement => {
      const tr = document.createElement('tr');
      this.t.head.forEach((_, c) => {
        const el = document.createElement(tag);
        el.innerHTML = cellHtml(cells[c] ?? '');
        const a = this.t.align[c];
        if (a) el.style.textAlign = a;
        tr.appendChild(el);
      });
      return tr;
    };
    const thead = document.createElement('thead');
    thead.appendChild(row('th', this.t.head));
    const tbody = document.createElement('tbody');
    for (const r of this.t.rows) tbody.appendChild(row('td', r));
    table.append(thead, tbody);
    wrap.appendChild(table);
    const edit = (): void => {
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) }, scrollIntoView: true });
      view.focus();
    };
    wrap.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('a')) return;
      e.preventDefault();
      edit();
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        edit();
      }
    });
    return wrap;
  }
}

function tableDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const items: Range<Decoration>[] = [];
  for (const t of findTables(docLines(state))) {
    const from = doc.line(t.start + 1).from;
    const to = doc.line(t.end + 1).to;
    if (state.selection.ranges.some((r) => r.from <= to && r.to >= from)) continue; // the caret is in its markdown: show that
    items.push(Decoration.replace({ widget: new TableWidget(t), block: true }).range(from, to));
  }
  return Decoration.set(items, true);
}

/** Tables drawn as tables. A block decoration has to come from a state field, not from a plugin. */
export const tableView = StateField.define<DecorationSet>({
  create: tableDecorations,
  update: (v, tr) => (tr.docChanged || tr.selection ? tableDecorations(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});

/** Ask for the caret to go into a cell of the table that starts on a line of the note (0-based), as soon as it is drawn. */
export function requestTableFocus(startLine: number, r: number, c: number, select: Focus['select'] = 'all'): void {
  pending = { start: startLine, r, c, select };
}
