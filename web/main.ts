import { fmtDate, fmtDateLong, localToday } from '../src/dates';
import { FsaStorage, fsaSupported } from '../src/fsa-storage';
import { VaultIndex, type TaskItem } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { addDays, todayView } from '../src/query';
import { ConflictError, type VaultStorage } from '../src/storage';
import { StaleError, setTaskDone } from '../src/writeback';
import { hasPermission, loadHandle, saveHandle } from './handle-store';

const SAMPLE_DAY = '2026-11-21';
const app = document.getElementById('app') as HTMLElement;

interface Context {
  path: string;
  start: number;
  lines: string[];
  hi: number;
}
type Log = { path: string; line: number; before: string; after: string; written: boolean } | { message: string };

const state = {
  storage: undefined as VaultStorage | undefined,
  index: undefined as VaultIndex | undefined,
  name: '',
  demo: false,
  view: 'today' as 'today' | 'all',
  tag: undefined as string | undefined,
  selected: undefined as string | undefined,
  context: undefined as Context | undefined,
  log: undefined as Log | undefined,
  scanMs: 0,
  saved: undefined as FileSystemDirectoryHandle | undefined,
  savedAllowed: false,
  busy: '',
  error: '',
};
const justDone = new Set<string>();

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const today = (): string => (state.demo ? SAMPLE_DAY : localToday());

/* ---------- theme ---------- */

function isDark(): boolean {
  const set = document.documentElement.getAttribute('data-theme');
  return set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function toggleTheme(): void {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('plainfile-theme', next);
  } catch {
    /* private window: the choice just lasts for this visit */
  }
  render();
}

/* ---------- vault ---------- */

async function loadVault(storage: VaultStorage, name: string, demo: boolean): Promise<void> {
  state.busy = 'Reading your folder…';
  state.error = '';
  render();
  try {
    const index = new VaultIndex(storage);
    const r = await index.scan();
    state.storage = storage;
    state.index = index;
    state.name = name;
    state.demo = demo;
    state.scanMs = r.ms;
    state.selected = undefined;
    state.context = undefined;
    state.log = undefined;
    state.tag = undefined;
    justDone.clear();
  } catch (e) {
    state.error = `Could not read that folder. ${e instanceof Error ? e.message : ''}`.trim();
  }
  state.busy = '';
  render();
}

async function openFolder(): Promise<void> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(handle);
    state.saved = handle;
    await loadVault(new FsaStorage(handle), handle.name, false);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      state.error = `Could not open that folder. ${e instanceof Error ? e.message : ''}`.trim();
      render();
    }
  }
}

async function reopenSaved(): Promise<void> {
  const h = state.saved;
  if (!h) return;
  if (await hasPermission(h, true)) await loadVault(new FsaStorage(h), h.name, false);
  else {
    state.error = 'Permission to open that folder was not granted.';
    render();
  }
}

async function rescan(): Promise<boolean> {
  if (!state.index) return false;
  const r = await state.index.scan();
  state.scanMs = r.ms;
  const changed = r.added.length + r.changed.length + r.removed.length > 0;
  if (changed && state.selected && !state.index.getTask(state.selected)) {
    state.selected = undefined;
    state.context = undefined;
  }
  return changed;
}

/* ---------- tasks ---------- */

function noteTags(t: TaskItem): Set<string> {
  return new Set([...t.tags, ...(state.index?.notes.get(t.path)?.tags ?? [])]);
}

function visibleTasks(): TaskItem[] {
  const all = state.index?.tasks() ?? [];
  return state.tag ? all.filter((t) => noteTags(t).has(state.tag as string)) : all;
}

const byDue = (a: TaskItem, b: TaskItem): number =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.path.localeCompare(b.path) || a.line - b.line;

interface Group {
  title: string;
  late?: boolean;
  items: TaskItem[];
}

function groups(): Group[] {
  const tasks = visibleTasks();
  const v = todayView(tasks, today(), justDone);
  const base: Group[] = [
    { title: 'Overdue', late: true, items: v.overdue },
    { title: 'Due today', items: v.today },
    { title: 'This week', items: v.thisWeek },
  ];
  if (state.view === 'today') return base.filter((g) => g.items.length);
  const week = addDays(today(), 7);
  const open = tasks.filter((t) => !t.done || justDone.has(t.id));
  base.push({ title: 'Later', items: open.filter((t) => t.due && t.due > week).sort(byDue) });
  base.push({ title: 'No date', items: open.filter((t) => !t.due).sort(byDue) });
  return base.filter((g) => g.items.length);
}

async function loadContext(id: string): Promise<void> {
  const t = state.index?.getTask(id);
  if (!t || !state.storage) {
    state.context = undefined;
    return;
  }
  const text = (await state.storage.read(t.path)).split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const start = Math.max(1, t.line - 3);
  const end = Math.min(text.length, t.line + 3);
  state.context = { path: t.path, start, lines: text.slice(start - 1, end), hi: t.line };
}

async function select(id: string): Promise<void> {
  state.selected = id;
  await loadContext(id);
  render();
}

async function toggle(id: string): Promise<void> {
  const { index, storage } = state;
  const t = index?.getTask(id);
  if (!index || !storage || !t) return;
  try {
    const r = await setTaskDone(storage, index, id, !t.done);
    if (!t.done) justDone.add(id);
    else justDone.delete(id);
    state.log = r;
    state.selected = id;
    await loadContext(id);
  } catch (e) {
    if (e instanceof StaleError || e instanceof ConflictError) {
      await rescan();
      state.log = { message: 'That file changed on disk, so nothing was written. The list has been refreshed. Try again.' };
      if (state.selected) await loadContext(state.selected).catch(() => undefined);
    } else {
      state.log = { message: `Could not save that change. ${e instanceof Error ? e.message : ''}`.trim() };
    }
  }
  render();
}

/* ---------- rendering ---------- */

function chips(t: TaskItem): string {
  const out: string[] = [];
  if (t.due) {
    const late = t.due < today() && !t.done;
    out.push(`<span class="chip${late ? ' late' : ''}">${late ? 'Overdue · ' : ''}${esc(fmtDate(t.due))}</span>`);
  }
  if (t.status) out.push(`<span class="chip">${esc(t.status)}</span>`);
  for (const w of t.who) out.push(`<span class="chip mono">${esc(w)}</span>`);
  for (const g of t.tags) out.push(`<span class="chip mono">#${esc(g)}</span>`);
  out.push(`<span class="chip src mono">${esc(t.path.split('/').slice(-2).join('/'))}</span>`);
  return out.join('');
}

function taskRow(t: TaskItem): string {
  const done = t.done;
  return (
    `<li class="task${done ? ' done' : ''}${t.id === state.selected ? ' sel' : ''}" data-id="${esc(t.id)}" tabindex="0">` +
    `<button class="cb" data-toggle="${esc(t.id)}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${done ? '✓' : ''}</button>` +
    `<div class="body"><div class="t">${esc(t.title)}</div><div class="chips">${chips(t)}</div></div></li>`
  );
}

function renderSource(): string {
  const c = state.context;
  let h = '<h2>Source on disk</h2>';
  if (!c) h += '<p class="muted" style="margin:0">Select a task to see the exact lines in its file. Tick the box and the change shows here.</p>';
  else {
    h += `<div class="path">${esc(c.path)}</div><div class="lines">`;
    c.lines.forEach((l, i) => {
      const n = c.start + i;
      h += `<div class="ln${n === c.hi ? ' hi' : ''}"><span class="n">${n}</span><span>${esc(l) || ' '}</span></div>`;
    });
    h += '</div>';
  }
  const log = state.log;
  if (log) {
    if ('message' in log) h += `<div class="diff plain"><div class="cap">Not saved</div>${esc(log.message)}</div>`;
    else if (!log.written) h += '<div class="diff plain"><div class="cap">What changed on disk</div>Nothing. It was already in that state.</div>';
    else
      h +=
        `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(log.path)}:${log.line}</div>` +
        `<div class="del"><span class="sg">−</span><span>${esc(log.before)}</span></div>` +
        `<div class="add"><span class="sg">+</span><span>${esc(log.after)}</span></div></div>`;
  }
  return h;
}

function renderLanding(): string {
  const supported = fsaSupported();
  let h = '<main class="landing"><h1>Plainfile</h1>';
  h += '<p>One place for the tasks and notes in a folder of plain markdown files. Your files stay yours. Nothing is uploaded.</p>';
  if (state.busy) h += `<div class="notice">${esc(state.busy)}</div>`;
  if (state.error) h += `<div class="notice err">${esc(state.error)}</div>`;
  h += '<div class="row">';
  if (supported && state.saved) {
    h += `<button class="btn primary" data-act="reopen">Reopen ${esc(state.saved.name)}</button>`;
    h += '<button class="btn" data-act="open">Open a different folder</button>';
  } else if (supported) {
    h += '<button class="btn primary" data-act="open">Open a folder</button>';
  }
  h += `<button class="btn${supported ? '' : ' primary'}" data-act="demo">Try the sample vault</button></div>`;
  if (!supported) {
    h +=
      '<div class="notice">Opening a folder needs Chrome, Edge, Brave or Opera on a desktop computer. ' +
      'Other browsers can still try the sample vault. Support for them is planned.</div>';
  }
  return h + '</main>';
}

function renderVault(): string {
  const { index } = state;
  if (!index) return '';
  const gs = groups();
  const shown = gs.reduce((n, g) => n + g.items.length, 0);
  const all = visibleTasks();
  const openCount = all.filter((t) => !t.done).length;
  const tagCounts = new Map<string, number>();
  for (const t of all) if (!t.done) for (const g of noteTags(t)) tagCounts.set(g, (tagCounts.get(g) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);

  let h = '<div class="wrap">';
  h += `<header class="bar"><h1>Plainfile</h1><span class="tag-pill${state.demo ? '' : ' inv'}" title="${esc(state.name)}">${esc(state.name)}</span><span class="grow"></span>`;
  h += `<button class="btn" data-act="rescan">Rescan</button>`;
  if (fsaSupported()) h += `<button class="btn" data-act="open">Open folder</button>`;
  h += `<button class="btn" data-act="theme" aria-label="Switch to ${isDark() ? 'light' : 'dark'} mode">${isDark() ? 'Light' : 'Dark'}</button></header>`;

  h += '<div class="frame"><aside class="side"><div><h2>Views</h2><ul>';
  const tv = todayView(all, today(), justDone);
  const todayCount = tv.overdue.length + tv.today.length + tv.thisWeek.length;
  h += `<li><button class="item" data-view="today" aria-current="${state.view === 'today'}">Today <span class="n">${todayCount}</span></button></li>`;
  h += `<li><button class="item" data-view="all" aria-current="${state.view === 'all'}">All open <span class="n">${openCount}</span></button></li></ul></div>`;
  if (tags.length) {
    h += '<div><h2>Tags</h2><ul>';
    for (const [g, n] of tags) h += `<li><button class="item mono" data-tag="${esc(g)}" aria-current="${state.tag === g}">#${esc(g)} <span class="n">${n}</span></button></li>`;
    h += '</ul></div>';
  }
  h += `<div class="stat">${index.notes.size} notes<br>scanned in ${state.scanMs} ms${state.demo ? '<br>sample date 21 Nov 2026' : ''}</div></aside>`;

  h += '<section class="main">';
  h += `<h2 class="title">${state.view === 'today' ? 'Today' : 'All open tasks'}</h2>`;
  h += `<p class="meta">${esc(fmtDateLong(today()))} · ${shown} ${state.view === 'today' ? 'need attention' : 'tasks'}</p>`;
  if (state.tag) h += `<div class="filter"><span class="chip mono">#${esc(state.tag)}</span><button class="btn" data-act="clear-tag">Clear filter</button></div>`;
  if (!shown) {
    h +=
      '<div class="empty">Nothing is due. Tasks with a due date appear here. Add one to any note, like ' +
      '<code>- [ ] Call Dana due:2026-11-24</code>.</div>';
  }
  for (const g of gs) {
    h += `<div class="grp${g.late ? ' late' : ''}">${esc(g.title)} <span>${g.items.length}</span></div><ul class="tasks">${g.items.map(taskRow).join('')}</ul>`;
  }
  h += '</section>';
  h += `<aside class="source" aria-live="polite">${renderSource()}</aside></div></div>`;
  return h;
}

function render(): void {
  const focus = document.activeElement as HTMLElement | null;
  const key = focus?.dataset.toggle ? `[data-toggle="${CSS.escape(focus.dataset.toggle)}"]` : focus?.dataset.id ? `[data-id="${CSS.escape(focus.dataset.id)}"]` : '';
  app.innerHTML = state.index && !state.busy ? renderVault() : renderLanding();
  if (key) app.querySelector<HTMLElement>(key)?.focus();
}

/* ---------- events ---------- */

app.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const tg = target.closest<HTMLElement>('[data-toggle]');
  if (tg?.dataset.toggle) return void toggle(tg.dataset.toggle);
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'open') return void openFolder();
  if (act === 'reopen') return void reopenSaved();
  if (act === 'demo') return void loadVault(new MemoryStorage(__SAMPLE_VAULT__), 'Sample vault', true);
  if (act === 'theme') return toggleTheme();
  if (act === 'clear-tag') {
    state.tag = undefined;
    return render();
  }
  if (act === 'rescan') {
    return void rescan().then(async () => {
      if (state.selected) await loadContext(state.selected).catch(() => undefined);
      render();
    });
  }
  const view = target.closest<HTMLElement>('[data-view]')?.dataset.view;
  if (view === 'today' || view === 'all') {
    state.view = view;
    return render();
  }
  const tag = target.closest<HTMLElement>('[data-tag]')?.dataset.tag;
  if (tag) {
    state.tag = state.tag === tag ? undefined : tag;
    return render();
  }
  const row = target.closest<HTMLElement>('[data-id]');
  if (row?.dataset.id) void select(row.dataset.id);
});

app.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if ((e.key === 'Enter' || e.key === ' ') && t.dataset.id && t.classList.contains('task')) {
    e.preventDefault();
    void select(t.dataset.id);
  }
});

// Another editor or a sync tool may have changed files while this tab was in the background.
window.addEventListener('focus', () => {
  if (!state.index || state.demo || state.busy) return;
  void rescan().then(async (changed) => {
    if (!changed) return;
    if (state.selected) await loadContext(state.selected).catch(() => undefined);
    render();
  });
});

window.__plainfile = {
  openHandle: (h, name) => loadVault(new FsaStorage(h), name ?? h.name, false),
};

async function boot(): Promise<void> {
  render();
  if (!fsaSupported()) return;
  const h = await loadHandle();
  if (!h) return;
  state.saved = h;
  // Reopen straight away only if the browser still remembers permission. Otherwise offer a button.
  if (await hasPermission(h, false)) {
    state.savedAllowed = true;
    await loadVault(new FsaStorage(h), h.name, false);
  } else {
    render();
  }
}

void boot();
