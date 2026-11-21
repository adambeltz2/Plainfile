import { matchSuggestions, suggestionsFor, type SuggestKind } from '../src/vocabulary';
import { state } from './store';
import { esc } from './util';

/**
 * A small dropdown for text fields: tags, people, projects and so on that already exist. A field opts
 * in with data-suggest="people|tags|projects|types|statuses". It offers matches for the word being
 * typed, leaves out ones already in the field, and never takes over Enter unless you have moved onto
 * a suggestion, so Enter still submits a form.
 */
interface Open {
  input: HTMLInputElement;
  items: string[];
  active: number;
  start: number;
  end: number;
  prefix: string;
  sep: string;
}

const DUE_WORDS = ['today', 'tomorrow', 'next-week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

let popup: HTMLDivElement | undefined;
let cur: Open | undefined;
let quiet = false;

function tokenAt(input: HTMLInputElement): { start: number; end: number; token: string } {
  const v = input.value;
  const pos = input.selectionStart ?? v.length;
  let s = pos;
  while (s > 0 && !/[\s,]/.test(v[s - 1] ?? '')) s--;
  let e = pos;
  while (e < v.length && !/[\s,]/.test(v[e] ?? '')) e++;
  return { start: s, end: e, token: v.slice(s, e) };
}

export function close(): void {
  popup?.remove();
  popup = undefined;
  cur = undefined;
}

function draw(): void {
  if (!cur) return;
  if (!popup) {
    popup = document.createElement('div');
    popup.className = 'suggest';
    popup.setAttribute('role', 'listbox');
    popup.addEventListener('mousedown', (e) => {
      // Keep the focus in the field while a suggestion is chosen.
      e.preventDefault();
      const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
      if (i !== undefined) choose(Number(i));
    });
    document.body.appendChild(popup);
  }
  popup.innerHTML = cur.items
    .map((it, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === cur?.active}">${esc(it)}</button>`)
    .join('');
  const r = cur.input.getBoundingClientRect();
  popup.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - Math.min(r.width, 260) - 8))}px`;
  popup.style.top = `${r.bottom + 2}px`;
  popup.style.minWidth = `${Math.min(r.width, window.innerWidth - 16)}px`;
}

export function show(input: HTMLInputElement): void {
  let kind = input.dataset.suggest as SuggestKind | 'line' | undefined;
  const idx = state.index;
  if (!kind || !idx) return close();
  const { start, end, token } = tokenAt(input);
  let prefix = /^[#@]/.exec(token)?.[0] ?? '';
  let word = token;
  if (kind === 'line' && /^due:/i.test(token)) {
    // Day words for the one-line quick add. The line parser reads them, so the word itself is written.
    const typed = token.slice(4).toLowerCase();
    const items = DUE_WORDS.filter((w) => w.startsWith(typed) && w !== typed);
    if (!items.length) return close();
    cur = { input, items, active: -1, start, end, prefix: 'due:', sep: ' ' };
    return draw();
  }
  if (kind === 'line') {
    // A whole sentence: only the word being typed matters, and its first character says what it is.
    const lead = token[0];
    kind = lead === '@' ? 'people' : lead === '#' ? 'tags' : lead === '+' ? 'projects' : undefined;
    if (!kind) return close();
    prefix = lead as string;
    word = token.slice(1);
  }
  const others = (input.value.slice(0, start) + ' ' + input.value.slice(end)).split(/[\s,]+/).filter(Boolean);
  const items = matchSuggestions(suggestionsFor(idx, kind), word, others);
  if (!items.length) return close();
  cur = { input, items, active: -1, start, end, prefix, sep: input.dataset.suggestSep ?? ' ' };
  draw();
}

function choose(i: number): void {
  if (!cur) return;
  const { input, items, start, end, prefix, sep } = cur;
  const name = items[i];
  if (name === undefined) return;
  const v = input.value;
  const insert = `${prefix}${prefix === '+' ? name.replace(/\s+/g, '-') : name}${sep}`;
  input.value = v.slice(0, start) + insert + v.slice(end).replace(/^[\s,]+/, '');
  const caret = start + insert.length;
  input.setSelectionRange(caret, caret);
  close();
  quiet = true;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  quiet = false;
  input.focus();
}

export function onInput(e: Event): void {
  const t = e.target as HTMLInputElement;
  if (quiet || !t.dataset?.suggest) return;
  show(t);
}

export function onFocus(e: FocusEvent): void {
  const t = e.target as HTMLInputElement;
  if (t.dataset?.suggest && !quiet) show(t);
}

export function onBlur(e: FocusEvent): void {
  if ((e.target as HTMLElement).dataset?.suggest) window.setTimeout(() => (cur && document.activeElement !== cur.input ? close() : undefined), 120);
}

/** Returns true if the key was used by the dropdown. */
export function onKeydown(e: KeyboardEvent): boolean {
  if (!cur || e.target !== cur.input) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const n = cur.items.length;
    cur.active = e.key === 'ArrowDown' ? (cur.active + 1) % n : (cur.active - 1 + n) % n;
    draw();
    e.preventDefault();
    return true;
  }
  if (e.key === 'Enter' && cur.active >= 0) {
    choose(cur.active);
    e.preventDefault();
    return true;
  }
  if (e.key === 'Tab' && !e.shiftKey) {
    choose(cur.active >= 0 ? cur.active : 0);
    e.preventDefault();
    return true;
  }
  if (e.key === 'Escape') {
    close();
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  return false;
}
