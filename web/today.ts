import { fmtDate, fmtDateLong } from '../src/dates';
import { dirname, type TaskItem } from '../src/index';
import { listFollowUps, listProjects } from '../src/projects';
import { addDays, todayView } from '../src/query';
import { setTaskDone } from '../src/writeback';
import { loadContext, justDone, quickAdd, render, state, today, writeFailure, errorMessage, rescan, type TodayViewId } from './store';
import { esc } from './util';

export const quick = { text: '', due: '', error: '' };

const VIEWS: { id: TodayViewId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'waiting', label: 'Waiting on' },
  { id: 'all', label: 'All open' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'projects', label: 'Projects' },
];

let showInactive = false;

function noteTags(t: TaskItem): Set<string> {
  return new Set([...t.tags, ...(state.index?.notes.get(t.path)?.tags ?? [])]);
}

function visible(): TaskItem[] {
  const all = state.index?.tasks() ?? [];
  return state.tag ? all.filter((t) => noteTags(t).has(state.tag as string)) : all;
}

const keep = (t: TaskItem): boolean => !t.done || justDone.has(t.id);
const byDue = (a: TaskItem, b: TaskItem): number =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.path.localeCompare(b.path) || a.line - b.line;

interface Group {
  title: string;
  late?: boolean;
  items: TaskItem[];
}

function groupsFor(view: TodayViewId, tasks: TaskItem[]): Group[] {
  const d = today();
  const week = addDays(d, 7);
  const open = tasks.filter(keep);
  const v = todayView(tasks, d, justDone);
  const dated: Group[] = [
    { title: 'Overdue', late: true, items: v.overdue },
    { title: 'Due today', items: v.today },
    { title: 'This week', items: v.thisWeek },
  ];
  let gs: Group[];
  switch (view) {
    case 'today':
      gs = dated;
      break;
    case 'upcoming':
      gs = [
        { title: 'This week', items: open.filter((t) => t.due && t.due > d && t.due <= week).sort(byDue) },
        { title: 'Later', items: open.filter((t) => t.due && t.due > week).sort(byDue) },
      ];
      break;
    case 'inbox':
      gs = [{ title: 'Inbox', items: open.filter((t) => t.path.startsWith('inbox/')).sort(byDue) }];
      break;
    case 'waiting':
      gs = [{ title: 'Waiting on', items: open.filter((t) => t.status === 'waiting' || t.tags.includes('waiting')).sort(byDue) }];
      break;
    default:
      gs = [...dated, { title: 'Later', items: open.filter((t) => t.due && t.due > week).sort(byDue) }, { title: 'No date', items: open.filter((t) => !t.due).sort(byDue) }];
  }
  return gs.filter((g) => g.items.length);
}

function count(view: TodayViewId, tasks: TaskItem[]): number {
  if (view === 'followups') return state.index ? listFollowUps(state.index).length : 0;
  if (view === 'projects') return state.index ? listProjects(state.index).filter((p) => p.active).length : 0;
  return groupsFor(view, tasks.filter((t) => !t.done)).reduce((n, g) => n + g.items.length, 0);
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
  out.push(
    `<button class="chip src mono" data-open="${esc(t.path)}" data-line="${t.line}" title="Open this note" aria-label="Open ${esc(t.path)}">${esc(t.path.split('/').slice(-2).join('/'))}</button>`,
  );
  return out.join('');
}

function row(t: TaskItem): string {
  return (
    `<li class="task${t.done ? ' done' : ''}${t.id === state.selected ? ' sel' : ''}" data-id="${esc(t.id)}" tabindex="0">` +
    `<button class="cb" data-toggle="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${t.done ? '✓' : ''}</button>` +
    `<div class="body"><div class="t">${esc(t.title)}</div><div class="chips">${chips(t)}</div></div></li>`
  );
}

function source(): string {
  const c = state.context;
  let h = '<h2>Source on disk</h2>';
  if (!c) h += '<p class="muted small" style="margin:0">Select a task to see the exact lines in its file. Tick the box and the change shows here.</p>';
  else {
    h += `<div class="path">${esc(c.path)}</div><div class="lines">`;
    c.lines.forEach((l, i) => {
      const n = c.start + i;
      h += `<div class="ln${n === c.hi ? ' hi' : ''}"><span class="n">${n}</span><span>${esc(l) || ' '}</span></div>`;
    });
    h += `</div><div class="row-gap"><button class="btn small" data-open="${esc(c.path)}" data-line="${c.hi}">Open note</button></div>`;
  }
  const log = state.log;
  if (log) {
    if ('message' in log) h += `<div class="diff plain"><div class="cap">Not saved</div>${esc(log.message)}</div>`;
    else if (!log.written) h += '<div class="diff plain"><div class="cap">What changed on disk</div>Nothing. It was already in that state.</div>';
    else {
      h +=
        `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(log.path)}:${log.line}</div>` +
        (log.before ? `<div class="del"><span class="sg">−</span><span>${esc(log.before)}</span></div>` : '') +
        `<div class="add"><span class="sg">+</span><span>${esc(log.after)}</span></div></div>`;
    }
  }
  return h;
}

function followupsHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const list = listFollowUps(idx);
  let h = `<p class="meta">${list.length} line${list.length === 1 ? '' : 's'} tagged <span class="mono">#followup</span>, from every note</p>`;
  if (!list.length) {
    return `${h}<div class="empty">No follow-ups. Add <code>#followup</code> to any line, like <code>- Ask Dana about the logo files #followup</code>, and it shows up here.</div>`;
  }
  h += '<ul class="tasks">';
  for (const f of list) {
    h +=
      `<li class="task" tabindex="-1"><div class="body"><div class="t">${esc(f.title)}</div><div class="chips">` +
      `<button class="chip src mono" data-open="${esc(f.path)}" data-line="${f.line}" aria-label="Open ${esc(f.path)}">${esc(f.from)} · line ${f.line}</button></div></div></li>`;
  }
  return `${h}</ul>`;
}

function projectsHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = listProjects(idx);
  const active = all.filter((p) => p.active);
  const inactive = all.filter((p) => !p.active);
  const card = (p: (typeof all)[number]): string =>
    `<li class="pcard${p.active ? '' : ' off'}"><button class="pbtn" data-open="${esc(p.path)}">` +
    `<span class="pnum" aria-hidden="true">${p.number ?? '–'}</span>` +
    `<span class="ptitle">${esc(p.title)}</span><span class="pprev">${esc(p.preview) || '&nbsp;'}</span>` +
    `<span class="chips">${p.openTasks ? `<span class="chip">${p.openTasks} task${p.openTasks === 1 ? '' : 's'}</span>` : ''}` +
    `${p.followups ? `<span class="chip">${p.followups} follow-up${p.followups === 1 ? '' : 's'}</span>` : ''}</span></button></li>`;
  let h = `<p class="meta">${active.length} active project${active.length === 1 ? '' : 's'}, numbered in sort order</p>`;
  if (!all.length) {
    return `${h}<div class="empty">No projects yet. A project is a note with <code>active: true</code> or <code>sortOrder: 1</code> in its frontmatter, or <code>type: project</code>. Active projects are numbered in sort order. A folder's <code>index.md</code> covers every note in that folder.</div>`;
  }
  h += `<ul class="pgrid">${active.map(card).join('')}</ul>`;
  if (inactive.length) {
    h += `<div class="row-gap"><button class="btn" data-act="toggle-inactive" aria-expanded="${showInactive}">${showInactive ? 'Hide' : 'Show'} ${inactive.length} inactive project${inactive.length === 1 ? '' : 's'}</button></div>`;
    if (showInactive) h += `<ul class="pgrid">${inactive.map(card).join('')}</ul>`;
  }
  return h;
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = visible();
  const gs = groupsFor(state.view, all);
  const shown = gs.reduce((n, g) => n + g.items.length, 0);

  const tagCounts = new Map<string, number>();
  for (const t of all) if (!t.done) for (const g of noteTags(t)) tagCounts.set(g, (tagCounts.get(g) ?? 0) + 1);
  const tags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  const folders = new Map<string, number>();
  for (const n of idx.notes.values()) {
    const f = dirname(n.path).split('/')[0] || '';
    if (f) folders.set(f, (folders.get(f) ?? 0) + 1);
  }

  let h = '<div class="frame"><aside class="side"><div><h2>Views</h2><ul>';
  for (const v of VIEWS) {
    h += `<li><button class="item" data-view="${v.id}" aria-current="${state.view === v.id}">${v.label} <span class="n">${count(v.id, all)}</span></button></li>`;
  }
  h += '</ul></div>';
  if (folders.size) {
    h += '<div><h2>Folders</h2><ul>';
    for (const [f, n] of [...folders].sort((a, b) => a[0].localeCompare(b[0]))) {
      h += `<li><button class="item mono" data-folder="${esc(f)}">${esc(f)}/ <span class="n">${n}</span></button></li>`;
    }
    h += '</ul></div>';
  }
  if (tags.length) {
    h += '<div><h2>Tags</h2><ul>';
    for (const [g, n] of tags) h += `<li><button class="item mono" data-tag="${esc(g)}" aria-current="${state.tag === g}">#${esc(g)} <span class="n">${n}</span></button></li>`;
    h += '</ul></div>';
  }
  h += `<div class="stat">${idx.notes.size} notes<br>scanned in ${state.scanMs} ms${state.demo ? '<br>sample date 21 Nov 2026' : ''}</div></aside>`;

  const label = VIEWS.find((v) => v.id === state.view)?.label ?? 'Today';
  h += '<section class="main">';
  h += `<form class="quick" data-quick><label class="sr" for="quick-text">Add a task</label>` +
    `<input id="quick-text" class="inp" type="text" autocomplete="off" placeholder="Add a task and press Enter. It goes to your Inbox." value="${esc(quick.text)}">` +
    `<label class="sr" for="quick-due">Due date</label><input id="quick-due" class="inp date" type="date" value="${esc(quick.due)}">` +
    `<button class="btn primary" type="submit">Add</button></form>`;
  if (quick.error) h += `<div class="notice err small">${esc(quick.error)}</div>`;
  h += `<h2 class="title">${esc(label)}</h2>`;
  if (state.view === 'followups') h += followupsHtml();
  else if (state.view === 'projects') h += projectsHtml();
  else {
    h += `<p class="meta">${esc(fmtDateLong(today()))} · ${shown} ${state.view === 'today' ? 'need attention' : shown === 1 ? 'task' : 'tasks'}</p>`;
    if (state.tag) h += `<div class="filter"><span class="chip mono">#${esc(state.tag)}</span><button class="btn small" data-act="clear-tag">Clear filter</button></div>`;
    if (!shown) {
      h +=
        state.view === 'today'
          ? '<div class="empty">Nothing is due. Tasks with a due date appear here. Add one above, or in any note, like <code>- [ ] Call Dana due:2026-11-24</code>.</div>'
          : '<div class="empty">No tasks here yet.</div>';
    }
    for (const g of gs) {
      h += `<div class="grp${g.late ? ' late' : ''}">${esc(g.title)} <span>${g.items.length}</span></div><ul class="tasks">${g.items.map(row).join('')}</ul>`;
    }
  }
  h += `</section><aside class="source" aria-live="polite">${source()}</aside></div>`;
  return h;
}

/* ---------- events ---------- */

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
    const friendly = writeFailure(e);
    if (friendly) {
      await rescan();
      state.log = { message: friendly };
      if (state.selected) await loadContext(state.selected).catch(() => undefined);
    } else {
      state.log = { message: `Could not save that change. ${errorMessage(e)}` };
    }
  }
  render();
}

export async function submitQuick(): Promise<void> {
  const err = await quickAdd(quick.text, quick.due);
  quick.error = err ?? '';
  if (!err) {
    quick.text = '';
    quick.due = '';
    state.view = state.view === 'today' || state.view === 'all' || state.view === 'inbox' ? state.view : 'inbox';
    if (state.selected) await loadContext(state.selected).catch(() => undefined);
  }
  render();
  if (!err) document.getElementById('quick-text')?.focus();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const tg = target.closest<HTMLElement>('[data-toggle]');
  if (tg?.dataset.toggle) {
    await toggle(tg.dataset.toggle);
    return true;
  }
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'toggle-inactive') {
    showInactive = !showInactive;
    render();
    return true;
  }
  if (act === 'clear-tag') {
    state.tag = undefined;
    render();
    return true;
  }
  const view = target.closest<HTMLElement>('[data-view]')?.dataset.view as TodayViewId | undefined;
  if (view) {
    state.view = view;
    render();
    return true;
  }
  const tag = target.closest<HTMLElement>('[data-tag]')?.dataset.tag;
  if (tag) {
    state.tag = state.tag === tag ? undefined : tag;
    render();
    return true;
  }
  const row = target.closest<HTMLElement>('[data-id]');
  if (row?.dataset.id) {
    await select(row.dataset.id);
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'quick-text') {
    quick.text = t.value;
    return true;
  }
  if (t.id === 'quick-due') {
    quick.due = t.value;
    return true;
  }
  return false;
}

export function keydown(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  if ((e.key === 'Enter' || e.key === ' ') && t.dataset.id && t.classList.contains('task')) {
    e.preventDefault();
    void select(t.dataset.id);
    return true;
  }
  return false;
}
