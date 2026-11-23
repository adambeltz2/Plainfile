import { linkAt, type LinkAt } from '../src/linknote';
import { isMermaidOpen } from '../src/diagrams'; // MERMAID
import { MermaidWidget } from './mermaid-widget'; // MERMAID
import { defaultKeymap, history, historyKeymap, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { parseDueWord } from '../src/quickline';
import { acceptCompletion, autocompletion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState, Transaction, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, tooltips, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { addDays } from '../src/query';
import type { LinkTarget, SuggestKind } from '../src/vocabulary';

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

/** Where an editor gets an image's bytes from, as a URL it can show. Set per editor by createEditor. */
const imageLoaders = new WeakMap<EditorView, (rel: string) => Promise<string | undefined>>();
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

/** An image on a line of its own, shown in place of its markdown until the cursor is on that line. */
class ImageWidget extends WidgetType {
  constructor(
    readonly rel: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: ImageWidget): boolean {
    return o.rel === this.rel && o.alt === this.alt;
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-img';
    wrap.textContent = this.alt || 'Loading image…';
    const load = imageLoaders.get(view);
    if (/^(https?:|data:)/i.test(this.rel)) this.show(wrap, this.rel);
    else if (load) {
      void load(this.rel).then((url) => {
        if (url) this.show(wrap, url);
        else wrap.textContent = `Image not found: ${this.rel}`;
      });
    }
    return wrap;
  }
  private show(wrap: HTMLElement, url: string): void {
    const img = document.createElement('img');
    img.src = url;
    img.alt = this.alt;
    img.className = 'cm-img-el';
    img.addEventListener('error', () => (wrap.textContent = `Could not show ${this.rel}`));
    img.addEventListener('load', () => wrap.replaceChildren(img));
  }
  ignoreEvent(): boolean {
    return false;
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
  let diagram: string[] | undefined; // MERMAID: the lines of the diagram block being read

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const text = line.text;
    if (n <= fmEnd) {
      items.push(Decoration.line({ class: 'cm-fm' }).range(line.from));
      continue;
    }
    if (FENCE.test(text)) {
      inFence = !inFence;
      if (inFence)
        diagram = isMermaidOpen(text) ? [] : undefined; // MERMAID
      else if (diagram) items.push(Decoration.widget({ widget: new MermaidWidget(diagram.join('\n')), side: 1 }).range(line.to)); // MERMAID
      items.push(Decoration.line({ class: 'cm-code' }).range(line.from));
      continue;
    }
    if (inFence) {
      diagram?.push(text); // MERMAID
      items.push(Decoration.line({ class: 'cm-code' }).range(line.from));
      continue;
    }
    const isActive = active.has(n);
    const image = !isActive ? IMAGE_LINE.exec(text) : null;
    if (image && line.to > line.from) {
      const r = Decoration.replace({ widget: new ImageWidget(image[2] ?? '', image[1] ?? '') }).range(line.from, line.to);
      items.push(r);
      atomic.push(r);
      continue;
    }
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
  const nextMon = addDays(t, (8 - dow) % 7 || 7);
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

/* ---------- type-ahead ---------- */

/** What the editor can offer while typing. The screen supplies it from the vault. */
export interface Suggester {
  links(): LinkTarget[];
  names(kind: SuggestKind): string[];
}

function applyLink(insert: string) {
  return (view: EditorView, _c: unknown, from: number, to: number): void => {
    const after = view.state.sliceDoc(to, to + 2);
    const text = insert + (after === ']]' ? '' : ']]');
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + insert.length + 2 }, userEvent: 'input.complete' });
  };
}

const SCALAR_KEYS: Record<string, SuggestKind> = { project: 'projects', type: 'types', status: 'statuses' };
const LIST_KEYS: Record<string, SuggestKind> = { tags: 'tags', people: 'people', attendees: 'people' };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Day words offered after `due:`. Choosing one writes the real date, so the file never holds a word. */
function dueOptions(today: string): { label: string; detail: string; apply: string; type: string }[] {
  const fmt = (iso: string): string => `${WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]?.slice(0, 3)} ${iso}`;
  const words = ['today', 'tomorrow', 'next-week', ...WEEKDAYS.slice(1), 'sunday', '2w', '3d'];
  const out: { label: string; detail: string; apply: string; type: string }[] = [];
  for (const w of words) {
    const iso = parseDueWord(w, today);
    if (iso) out.push({ label: w, detail: fmt(iso), apply: iso, type: 'keyword' });
  }
  return out;
}

function suggestSource(s: Suggester, today: () => string): CompletionSource {
  const options = (kind: SuggestKind) => s.names(kind).map((n) => ({ label: n, type: 'keyword' }));
  return (ctx: CompletionContext): CompletionResult | null => {
    const doc = ctx.state.doc;
    const line = doc.line(doc.lineAt(ctx.pos).number);
    const before = line.text.slice(0, ctx.pos - line.from);
    const fmEnd = (() => {
      if (doc.lines < 2 || doc.line(1).text.replace(/\r$/, '') !== '---') return 0;
      for (let n = 2; n <= doc.lines; n++) {
        const t = doc.line(n).text.replace(/\r$/, '');
        if (t === '---' || t === '...') return n;
      }
      return 0;
    })();

    if (!(fmEnd > 0 && line.number <= fmEnd)) {
      const link = /\[\[([^\]|#\n]*)$/.exec(before);
      if (link) {
        const typed = link[1] ?? '';
        return {
          from: ctx.pos - typed.length,
          options: s.links().map((t) => ({ label: t.label, detail: t.detail, apply: applyLink(t.insert), type: 'text' })),
          validFor: /^[^\]|#]*$/,
        };
      }
      const due = /(?:^|[\s(])#?due:([A-Za-z0-9+-]*)$/i.exec(before);
      if (due) return { from: ctx.pos - (due[1] ?? '').length, options: dueOptions(today()), validFor: /^[A-Za-z0-9+-]*$/ };
      const tag = /(?:^|[\s(])#([\p{L}\p{N}_/-]*)$/u.exec(before);
      if (tag) return { from: ctx.pos - (tag[1] ?? '').length, options: options('tags'), validFor: /^[\p{L}\p{N}_/-]*$/u };
      const who = /(?:^|[\s(])@([\p{L}\p{N}_-]*)$/u.exec(before);
      if (who) return { from: ctx.pos - (who[1] ?? '').length, options: options('people'), validFor: /^[\p{L}\p{N}_-]*$/u };
      return null;
    }

    const m = /^([A-Za-z_][\w-]*)\s*:\s?(.*)$/.exec(before);
    if (!m) return null;
    const key = (m[1] ?? '').toLowerCase();
    const rest = m[2] ?? '';
    if (key === 'due' && !rest.includes('[')) return { from: ctx.pos - rest.length, options: dueOptions(today()), validFor: /^[A-Za-z0-9+-]*$/ };
    const scalar = SCALAR_KEYS[key];
    if (scalar && !rest.includes('[')) return { from: ctx.pos - rest.length, options: options(scalar), validFor: /^[^\s,\]]*$/ };
    const list = LIST_KEYS[key];
    if (list) {
      const token = /(?:\[|,)\s*([^,\]]*)$/.exec(rest);
      if (token) return { from: ctx.pos - (token[1] ?? '').length, options: options(list), validFor: /^[^,\]]*$/ };
    }
    return null;
  };
}

/* ---------- public ---------- */

export interface EditorHandle {
  host: HTMLElement;
  view: EditorView;
  getText(): string;
  /** The selected text, or an empty string. */
  getSelection(): string;
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

/** Insert pasted or dropped images at the cursor, each on its own line. The screen saves the file and says how to link it. */
async function insertImages(view: EditorView, files: File[], save: (f: File) => Promise<string | null>, at?: number): Promise<void> {
  for (const f of files) {
    const md = await save(f).catch(() => null);
    if (!md) continue;
    const pos = at ?? view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lead = pos > line.from && line.text.slice(0, pos - line.from).trim() ? '\n' : '';
    const trail = pos < line.to && line.text.slice(pos - line.from).trim() ? '\n' : '\n';
    const text = `${lead}${md}${trail}`;
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, userEvent: 'input.paste' });
    at = undefined;
  }
}

const imagesIn = (list: FileList | DataTransferItemList | null | undefined): File[] =>
  [...((list as FileList | undefined) ?? [])].filter((f): f is File => f instanceof File && f.type.startsWith('image/'));

export function createEditor(o: {
  openLink?: (link: LinkAt) => void;
  text: string;
  crlf: boolean;
  today: () => string;
  onChange(): void;
  onSave(): void;
  suggest?: Suggester;
  pasteImage?: (f: File) => Promise<string | null>;
  loadImage?: (rel: string) => Promise<string | undefined>;
}): EditorHandle {
  const mode = new Compartment();
  const host = document.createElement('div');
  host.className = 'editor-host';

  const state = EditorState.create({
    doc: o.text,
    extensions: [
      EditorState.lineSeparator.of(o.crlf ? '\r\n' : '\n'),
      history(),
      keymap.of([
        // Tab finishes the highlighted suggestion. With no list open it is left alone, so Tab still moves focus on.
        { key: 'Tab', run: acceptCompletion },
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
      EditorView.domEventHandlers({
        paste(ev, view) {
          const files = imagesIn(ev.clipboardData?.files);
          if (!files.length || !o.pasteImage) return false;
          ev.preventDefault();
          void insertImages(view, files, o.pasteImage);
          return true;
        },
        drop(ev, view) {
          const files = imagesIn(ev.dataTransfer?.files);
          if (!files.length || !o.pasteImage) return false;
          ev.preventDefault();
          void insertImages(view, files, o.pasteImage, view.posAtCoords({ x: ev.clientX, y: ev.clientY }) ?? undefined);
          return true;
        },
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Note text', spellcheck: 'true' }),
      normalizeMarkers,
      ...(o.suggest
        ? [
            autocompletion({ override: [suggestSource(o.suggest, o.today)], icons: false, maxRenderedOptions: 40 }),
            // Draw the list over the page, so a small editor or a phone screen does not clip it.
            tooltips({ parent: document.body, position: 'fixed' }),
          ]
        : []),
      mode.of(livePreview),
      EditorView.domEventHandlers({
        mousedown(e, view) {
          const el = e.target as HTMLElement;
          // A click on a link goes to the note, whether it is drawn as a link or is still raw text on the line
          // being typed. It is handled on mouse down, before the cursor lands and redraws the line.
          if (o.openLink && e.button === 0 && !e.shiftKey && !e.altKey) {
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
            if (pos !== null) {
              const line = view.state.doc.lineAt(pos);
              const link = linkAt(line.text, pos - line.from);
              if (link) {
                e.preventDefault();
                o.openLink(link);
                return true;
              }
            }
          }
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
  if (o.loadImage) imageLoaders.set(view, o.loadImage);
  const text = (): string => view.state.doc.sliceString(0, view.state.doc.length, view.state.lineBreak);

  return {
    host,
    view,
    getText: text,
    getSelection: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
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
