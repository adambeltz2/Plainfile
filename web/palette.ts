import { isPinned, KEYS, run, type NoteAction } from './menu';
import { notes } from './notes';
import { render, state } from './store';
import { esc } from './util';
import { fmtDate } from '../src/dates';
import { looksLikeTask, parseQuickLine } from '../src/quickline';
import { today } from './store';

/**
 * The command palette: one box to open a note by name, create one, jump to a screen, or run an action
 * on the open note (or on a note you name: "move kick" offers to move the note matching "kick").
 */
export const pal = { open: false, q: '', sel: 0 };

export type PaletteItem =
  | { kind: 'note'; label: string; hint: string; path: string }
  | { kind: 'create'; label: string; hint: string; title: string }
  | { kind: 'screen'; label: string; hint: string; screen: string }
  | { kind: 'new-task'; label: string; hint: string }
  | { kind: 'add-task'; label: string; hint: string; line: string }
  | { kind: 'quick-note'; label: string; hint: string }
  | { kind: 'action'; label: string; hint: string; action: NoteAction; path: string };

const SCREENS: [string, string][] = [
  ['home', 'Home'],
  ['today', 'Today'],
  ['tasks-all', 'All tasks'],
  ['calendar', 'Calendar'],
  ['people', 'People'],
  ['review', 'Weekly review'],
  ['insight', 'Insight'],
  ['projects', 'Projects'],
  ['notes', 'Notes'],
  ['explore', 'Explore'],
  ['search', 'Search'],
  ['health', 'Vault health'],
  ['guide', 'Cheat sheet'],
];

const VERBS: Record<string, NoteAction> = {
  move: 'move',
  rename: 'rename',
  duplicate: 'duplicate',
  delete: 'delete',
  pin: 'pin',
  open: 'open',
  explore: 'explore',
};

/** How well a note matches what was typed: lower is better, undefined is no match. Letters in order also count. */
function score(title: string, path: string, q: string): number | undefined {
  const t = title.toLowerCase();
  const p = path.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.split(/\W+/).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 3;
  if (p.includes(q)) return 4;
  let i = 0;
  for (const c of t) if (c === q[i] && ++i === q.length) return 5;
  return undefined;
}

function matchNotes(q: string, limit: number): { title: string; path: string }[] {
  const idx = state.index;
  if (!idx) return [];
  const all = [...idx.notes.values()];
  if (!q)
    return all
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((n) => ({ title: n.title, path: n.path }));
  return all
    .map((n) => ({ n, s: score(n.title, n.path, q) }))
    .filter((x): x is { n: (typeof all)[number]; s: number } => x.s !== undefined)
    .sort((a, b) => a.s - b.s || b.n.mtime - a.n.mtime)
    .slice(0, limit)
    .map(({ n }) => ({ title: n.title, path: n.path }));
}

/** The "Add task" row: what the typed line would make, in a few words. */
function addTaskItem(raw: string): PaletteItem {
  const p = parseQuickLine(raw, today());
  const bits = [p.project ? `in ${p.project}` : 'in Inbox'];
  if (p.priority) bits.push(`priority ${p.priority}`);
  if (p.due) bits.push(`due ${fmtDate(p.due)}`);
  if (p.rec) bits.push('repeats');
  for (const w of p.people) bits.push(`@${w}`);
  for (const g of p.tags) bits.push(`#${g}`);
  return { kind: 'add-task', label: `Add task: ${p.title || p.text}`, hint: bits.join(' · '), line: raw };
}

export function items(): PaletteItem[] {
  const idx = state.index;
  if (!idx) return [];
  const raw = pal.q.trim();
  const q = raw.toLowerCase();
  const out: PaletteItem[] = [];
  const verb = /^(\w+)\s+(.+)$/.exec(q);
  const verbAction = verb ? VERBS[verb[1] as string] : undefined;
  const label = (a: NoteAction, title: string): string =>
    (
      ({
        move: `Move “${title}” to a folder…`,
        rename: `Rename “${title}”`,
        duplicate: `Duplicate “${title}”`,
        delete: `Delete “${title}”…`,
        pin: `${'Pin or unpin'} “${title}”`,
        open: `Open “${title}”`,
        explore: `Explore “${title}”`,
      }) as Record<string, string>
    )[a] ?? title;
  if (verbAction && verb) {
    for (const n of matchNotes(verb[2] as string, 3))
      out.push({ kind: 'action', action: verbAction, path: n.path, label: label(verbAction, n.title), hint: n.path });
  }
  const cur = notes.path;
  if (cur && q) {
    const t = idx.notes.get(cur)?.title ?? cur;
    const acts: [NoteAction, string][] = [
      ['move', 'Move this note to a folder…'],
      ['rename', 'Rename this note'],
      ['duplicate', 'Duplicate this note'],
      ['pin', isPinned(cur) ? 'Unpin this note' : 'Pin this note to top'],
      ['xray', 'Toggle X-ray'],
      ['explore', 'Explore related notes'],
      ['copylink', 'Copy a link to this note'],
      ['copyrich', 'Copy as formatted text (for Word or email)'],
      ['docx', 'Download this note as Word (.docx)'],
      ['print', 'Print this note or save it as PDF'],
      ['delete', 'Delete this note…'],
    ];
    for (const [a, l] of acts)
      if (l.toLowerCase().includes(q) || a.includes(q)) out.push({ kind: 'action', action: a, path: cur, label: l, hint: KEYS[a] ?? t });
  }
  for (const n of matchNotes(q, q ? 8 : 6)) out.push({ kind: 'note', label: n.title, hint: n.path, path: n.path });
  if (!q || 'quick note'.includes(q) || (q.length > 1 && 'quick note'.startsWith(q))) out.push({ kind: 'quick-note', label: 'Quick note', hint: 'Alt+N' });
  if (!q || 'new task'.includes(q) || 'task'.includes(q)) out.push({ kind: 'new-task', label: 'New task…', hint: 'Quick add' });
  for (const [id, name] of SCREENS)
    if (!q || `go to ${name}`.toLowerCase().includes(q)) out.push({ kind: 'screen', screen: id, label: `Go to ${name}`, hint: '' });
  const made = raw && !idx.notes.has(raw) && ![...idx.notes.values()].some((n) => n.title.toLowerCase() === q);
  if (made) out.push({ kind: 'create', label: `New note “${raw}”`, hint: 'Create it', title: raw });
  // A sentence is most likely a task, so "Add task" leads; a short word is most likely a note, so it comes last.
  // But not when it names a screen, an action or a note: "go to search" must go there, not add a task.
  if (raw && !verbAction) {
    const named = out.some((i) => i.kind === 'screen' || i.kind === 'action' || (i.kind === 'note' && i.label.toLowerCase().includes(q)));
    if (looksLikeTask(raw) && !named) out.unshift(addTaskItem(raw));
    else out.push(addTaskItem(raw));
  }
  return out.slice(0, 14);
}

export function html(): string {
  if (!pal.open) return '';
  const list = items();
  pal.sel = Math.min(pal.sel, Math.max(0, list.length - 1));
  return (
    '<div class="modal-back pal-back" data-pal-backdrop><div class="modal pal" role="dialog" aria-modal="true" aria-label="Go to">' +
    `<input id="pal-q" class="inp" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pal-list" placeholder="Open a note, or type a task: Call Dana @dana due:friday" value="${esc(pal.q)}">` +
    `<ul id="pal-list" class="plain pal-list" role="listbox">${list
      .map(
        (it, i) =>
          `<li><button role="option" class="pal-item" data-pal="${i}" aria-selected="${i === pal.sel}"><b>${esc(it.label)}</b><span class="mono small">${esc(it.hint)}</span></button></li>`,
      )
      .join('')}${list.length ? '' : '<li class="muted small" style="padding:8px">Nothing matches.</li>'}</ul>` +
    '<p class="muted small" style="margin:8px 0 0">↑ ↓ to choose, Enter to run, Esc to close.</p></div></div>'
  );
}

export function openPalette(): void {
  if (!state.index) return;
  pal.open = true;
  pal.q = '';
  pal.sel = 0;
  render();
  document.getElementById('pal-q')?.focus();
}

export function closePalette(): void {
  if (!pal.open) return;
  pal.open = false;
  render();
}

export type Runner = (item: PaletteItem) => Promise<void>;
let runner: Runner | undefined;
export function setRunner(r: Runner): void {
  runner = r;
}

async function activate(i: number): Promise<void> {
  const item = items()[i];
  if (!item) return;
  pal.open = false;
  if (item.kind === 'action') await run(item.action, item.path);
  else await runner?.(item);
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  if (!pal.open) return false;
  if (target.matches('[data-pal-backdrop]')) {
    closePalette();
    return true;
  }
  const i = target.closest<HTMLElement>('[data-pal]')?.dataset.pal;
  if (i !== undefined) {
    await activate(Number(i));
    return true;
  }
  return target.closest('.pal') !== null;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'pal-q') return false;
  pal.q = t.value;
  pal.sel = 0;
  render();
  return true;
}

export function keydown(e: KeyboardEvent): boolean {
  if (!pal.open) return false;
  const n = items().length;
  if (e.key === 'Escape') {
    closePalette();
    return true;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    pal.sel = n ? (pal.sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n : 0;
    e.preventDefault();
    render();
    document.querySelector('.pal-item[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    void activate(pal.sel);
    return true;
  }
  return false;
}
