import { defaultKeymap, history, historyKeymap, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState, Transaction, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { addDays } from '../src/query';

/**
 * The live editor. The text in the editor is the markdown file, character for character.
 * Nothing is converted into a hidden model, so what you see is only ever a styled view of
 * the file. Block markers (`- [ ]`, `#`, `-`) show as a checkbox, a heading and a bullet as
 * soon as they are typed. Inline pieces (**bold**, [[links]], @people, #tags, due dates)
 * render when the cursor leaves the line. X-ray turns all of that off and shows the raw text.
 */

const TASK = /^(\s*)([-*+]) \[( |x|X)\](?= |$)/;
const BULLET = /^(\s*)([-*+]) (?!\[[ xX]\](?: |$))/;
const HEAD = /^(#{1,6}) /;
const FENCE = /^\s*(```|~~~)/;
const DUE = /#?\bdue:(\d{4}-\d{2}-\d{2})/g;

class Checkbox extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(o: Checkbox): boolean {
    return o.checked === this.checked;
  }
  toDOM(view: EditorView): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cm-cb${this.checked ? ' on' : ''}`;
    b.textContent = this.checked ? '✓' : '';
    b.setAttribute('aria-label', this.checked ? 'Mark not done' : 'Mark done');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const from = view.posAtDOM(b);
      const ch = view.state.doc.sliceString(from + 3, from + 4);
      view.dispatch({ changes: { from: from + 3, to: from + 4, insert: ch === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
    });
    return b;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class Bullet extends WidgetType {
  toDOM(): HTMLElement {
    const s = document.createElement('span');
    s.className = 'cm-bullet';
    s.textContent = '•';
    return s;
  }
}

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });

/** Which lines are frontmatter, and the line number where it ends (0 if none). */
function frontmatterEnd(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text.replace(/\r$/, '') !== '---') return 0;
  for (let n = 2; n <= doc.lines; n++) {
    const t = doc.line(n).text.replace(/\r$/, '');
    if (t === '---' || t === '...') return n;
  }
  return 0;
}

function inline(text: string, base: number, start: number, items: Range<Decoration>[], atomic: Range<Decoration>[]): void {
  const taken: boolean[] = new Array(text.length).fill(false);
  const claim = (a: number, b: number): boolean => {
    for (let i = a; i < b; i++) if (taken[i]) return false;
    for (let i = a; i < b; i++) taken[i] = true;
    return true;
  };
  const hideRange = (a: number, b: number): void => {
    if (b <= a) return;
    const r = hide.range(base + a, base + b);
    items.push(r);
    atomic.push(r);
  };
  const scan = (re: RegExp, fn: (m: RegExpExecArray, s: number, e: number) => void): void => {
    re.lastIndex = start;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const s = m.index + (m[1] !== undefined && re.source.startsWith('(^|\\s)') ? (m[1] ?? '').length : 0);
      const e = m.index + m[0].length;
      if (s >= start && claim(s, e)) fn(m, s, e);
    }
  };

  scan(/`([^`\n]+)`/g, (_m, s, e) => {
    hideRange(s, s + 1);
    items.push(mark('cm-icode').range(base + s + 1, base + e - 1));
    hideRange(e - 1, e);
  });
  scan(/\[\[([^\]\n]+)\]\]/g, (m, s, e) => {
    const inner = m[1] ?? '';
    const bar = inner.indexOf('|');
    const from = bar >= 0 ? s + 2 + bar + 1 : s + 2;
    hideRange(s, from);
    items.push(mark('cm-link').range(base + from, base + e - 2));
    hideRange(e - 2, e);
  });
  scan(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, s, e) => {
    if (text[s - 1] === '!') return;
    const label = m[1] ?? '';
    hideRange(s, s + 1);
    items.push(mark('cm-link').range(base + s + 1, base + s + 1 + label.length));
    hideRange(s + 1 + label.length, e);
  });
  scan(/\*\*([^*\n]+)\*\*/g, (_m, s, e) => {
    hideRange(s, s + 2);
    items.push(mark('cm-bold').range(base + s + 2, base + e - 2));
    hideRange(e - 2, e);
  });
  scan(new RegExp(DUE.source, 'g'), (_m, s, e) => {
    items.push(mark('cm-chip cm-due').range(base + s, base + e));
  });
  scan(/(^|\s)(@[\w-]+)/g, (_m, s, e) => {
    items.push(mark('cm-chip').range(base + s, base + e));
  });
  scan(/(^|\s)(#[\w/-]*[A-Za-z_][\w/-]*)(?![\w/-]|:\d)/g, (_m, s, e) => {
    items.push(mark('cm-chip').range(base + s, base + e));
  });
}

function build(view: EditorView): { all: DecorationSet; atomic: DecorationSet } {
  const doc = view.state.doc;
  const active = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) active.add(n);
  }
  const fmEnd = frontmatterEnd(view);
  const items: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  let inFence = false;

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    if (n <= fmEnd) {
      items.push(Decoration.line({ class: 'cm-fm' }).range(line.from));
      continue;
    }
    if (FENCE.test(text)) {
      inFence = !inFence;
      items.push(Decoration.line({ class: 'cm-code' }).range(line.from));
      continue;
    }
    if (inFence) {
      items.push(Decoration.line({ class: 'cm-code' }).range(line.from));
      continue;
    }
    const isActive = active.has(n);
    let inlineFrom = 0;

    const h = HEAD.exec(text);
    const t = TASK.exec(text);
    const b = t ? null : BULLET.exec(text);
    if (h) {
      const level = (h[1] ?? '#').length;
      items.push(Decoration.line({ class: `cm-h cm-h${Math.min(level, 3)}` }).range(line.from));
      if (isActive) items.push(mark('cm-mk').range(line.from, line.from + level + 1));
      else {
        const r = hide.range(line.from, line.from + level + 1);
        items.push(r);
        atomic.push(r);
        inlineFrom = level + 1;
      }
    } else if (t) {
      const indent = (t[1] ?? '').length;
      const checked = (t[3] ?? ' ') !== ' ';
      items.push(Decoration.line({ class: `cm-task${checked ? ' cm-done' : ''}` }).range(line.from));
      const r = Decoration.replace({ widget: new Checkbox(checked) }).range(line.from + indent, line.from + indent + 5);
      items.push(r);
      atomic.push(r);
      inlineFrom = indent + 5;
    } else if (b) {
      const indent = (b[1] ?? '').length;
      items.push(Decoration.line({ class: 'cm-li' }).range(line.from));
      if (isActive) items.push(mark('cm-mk').range(line.from + indent, line.from + indent + 1));
      else {
        const r = Decoration.replace({ widget: new Bullet() }).range(line.from + indent, line.from + indent + 1);
        items.push(r);
        atomic.push(r);
        inlineFrom = indent + 2;
      }
    }
    if (!isActive) inline(text, line.from, inlineFrom, items, atomic);
  }
  return { all: Decoration.set(items, true), atomic: Decoration.set(atomic, true) };
}

const livePreview = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    atomic: DecorationSet;
    constructor(view: EditorView) {
      const b = build(view);
      this.deco = b.all;
      this.atomic = b.atomic;
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
        const b = build(u.view);
        this.deco = b.all;
        this.atomic = b.atomic;
      }
    }
  },
  {
    decorations: (v) => v.deco,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atomic ?? Decoration.none),
  },
);

function inCode(doc: EditorState['doc'], lineNo: number): boolean {
  let fence = false;
  for (let n = 1; n < lineNo; n++) if (FENCE.test(doc.line(n).text)) fence = !fence;
  return fence;
}

/** A typed `*` or `+` list marker is saved as `-`. Only lines you type on are touched. */
const normalizeMarkers = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  if (!(tr.isUserEvent('input.type') || tr.annotation(Transaction.userEvent) === 'input')) return tr;
  const doc = tr.newDoc;
  const fixes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  tr.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
    const a = doc.lineAt(fromB).number;
    const b = doc.lineAt(Math.min(toB, doc.length)).number;
    for (let n = a; n <= b; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = doc.line(n);
      const m = /^(\s*)([*+]) /.exec(line.text);
      if (m && !inCode(doc, n)) fixes.push({ from: line.from + (m[1] ?? '').length, to: line.from + (m[1] ?? '').length + 1, insert: '-' });
    }
  });
  return fixes.length ? [tr, { changes: fixes, sequential: true }] : tr;
});

/* ---------- date chip menu ---------- */

function openDateMenu(view: EditorView, chip: HTMLElement, today: () => string): void {
  document.querySelector('.date-menu')?.remove();
  const pos = view.posAtDOM(chip);
  const line = view.state.doc.lineAt(pos);
  DUE.lastIndex = 0;
  let found: { from: number; to: number } | undefined;
  for (let m = DUE.exec(line.text); m; m = DUE.exec(line.text)) {
    const from = line.from + m.index + m[0].length - 10;
    if (pos >= line.from + m.index - 1 && pos <= from + 10) found = { from, to: from + 10 };
  }
  if (!found) return;
  const range = found;
  const t = today();
  const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
  const nextMon = addDays(t, ((8 - dow) % 7) || 7);
  const options: [string, string][] = [
    ['Today', t],
    ['Tomorrow', addDays(t, 1)],
    ['Next Monday', nextMon],
    ['In a week', addDays(t, 7)],
  ];
  const menu = document.createElement('div');
  menu.className = 'date-menu';
  menu.setAttribute('role', 'menu');
  const pick = (iso: string): void => {
    view.dispatch({ changes: { from: range.from, to: range.to, insert: iso }, userEvent: 'input.date' });
    menu.remove();
    view.focus();
  };
  for (const [label, iso] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = `${label} · ${iso.slice(5)}`;
    b.addEventListener('click', () => pick(iso));
    menu.appendChild(b);
  }
  const input = document.createElement('input');
  input.type = 'date';
  input.setAttribute('aria-label', 'Pick a date');
  input.value = view.state.doc.sliceString(range.from, range.to);
  input.addEventListener('change', () => input.value && pick(input.value));
  menu.appendChild(input);
  const rect = chip.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);
  const close = (e: Event): void => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', close, true);
    }
  };
  document.addEventListener('mousedown', close, true);
  menu.querySelector('button')?.focus();
}

/* ---------- public ---------- */

export interface EditorHandle {
  host: HTMLElement;
  view: EditorView;
  getText(): string;
  setText(text: string): void;
  setXray(on: boolean): void;
  focus(): void;
  hasFocus(): boolean;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  goToLine(line: number): void;
  goToOffset(offset: number): void;
  /** Replace the whole text with `next` using the smallest change, so undo and the cursor survive. */
  applyText(next: string): void;
  destroy(): void;
}

export function createEditor(o: { text: string; crlf: boolean; today: () => string; onChange(): void; onSave(): void }): EditorHandle {
  const mode = new Compartment();
  const host = document.createElement('div');
  host.className = 'editor-host';

  const state = EditorState.create({
    doc: o.text,
    extensions: [
      EditorState.lineSeparator.of(o.crlf ? '\r\n' : '\n'),
      history(),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            o.onSave();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Note text', spellcheck: 'true' }),
      normalizeMarkers,
      mode.of(livePreview),
      EditorView.domEventHandlers({
        mousedown(e, view) {
          const el = e.target as HTMLElement;
          if (el.classList?.contains('cm-due')) {
            e.preventDefault();
            openDateMenu(view, el, o.today);
            return true;
          }
          return false;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) o.onChange();
      }),
    ],
  });
  const view = new EditorView({ state, parent: host });
  const text = (): string => view.state.doc.sliceString(0, view.state.doc.length, view.state.lineBreak);

  return {
    host,
    view,
    getText: text,
    setText(t) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
    },
    setXray(on) {
      view.dispatch({ effects: mode.reconfigure(on ? EditorView.contentAttributes.of({ class: 'cm-xray' }) : livePreview) });
    },
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    undo() {
      undo(view);
      view.focus();
    },
    redo() {
      redo(view);
      view.focus();
    },
    canUndo: () => undoDepth(view.state) > 0,
    canRedo: () => redoDepth(view.state) > 0,
    goToLine(n) {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
      view.focus();
    },
    goToOffset(offset) {
      const at = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
      view.focus();
    },
    applyText(next) {
      const cur = text();
      if (cur === next) return;
      let s = 0;
      while (s < cur.length && s < next.length && cur[s] === next[s]) s++;
      let ec = cur.length;
      let en = next.length;
      while (ec > s && en > s && cur[ec - 1] === next[en - 1]) {
        ec--;
        en--;
      }
      view.dispatch({ changes: { from: s, to: ec, insert: next.slice(s, en) }, userEvent: 'input.properties' });
    },
    destroy: () => view.destroy(),
  };
}
