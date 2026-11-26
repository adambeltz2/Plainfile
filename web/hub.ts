import { fmtDate, localDateOf } from '../src/dates';
import { save } from './export';
import { quickHooks, taskPanelHtml } from './today';
import { tasksToCsv, tasksToJson } from '../src/export';
import { describeRecurrence } from '../src/recur';
import { applyBulk, planBulk, type BulkAction, type BulkPlan } from '../src/bulk';
import { STATUSES, type Status } from '../src/fields';
import {
  applyFilters,
  currentView,
  EVERYTHING_VIEWS,
  filtersForView,
  groupTasks,
  hubTasks,
  newFilters,
  QUICK_VIEWS,
  summarize,
  viewCounts,
  type Filters,
  type GroupBy,
  type HubTask,
  type QuickView,
} from '../src/hub';
import { dirname } from '../src/index';
import { applyFolderMove, planFolderMove } from '../src/folder-move';
import { deleteNote, planDelete, restoreNote } from '../src/delete';
import { priorityRank } from '../src/priority';
import {
  ALL_PROJECTS,
  listFollowUps,
  listProjects,
  openSubProjects,
  projectDashboard,
  projectNotes,
  setProjectActive,
  subProjects,
  type Project,
  type ProjectDashboard,
} from '../src/projects';
import { addDays } from '../src/query';
import { setTaskStatus } from '../src/writeback';
import { errorMessage, justDone, render, rescan, state, today, writeFailure } from './store';
import { openNote } from './notes';
import { logHtml, row, simpleRow } from './tasks';
import { quickBar } from './today';
import { esc } from './util';

/**
 * The project hub: everything about one project on one page. A rail to move between projects, tabs for
 * the tasks seen as a list, a board and a timeline (plus notes and recent activity), and a status column
 * that stays in view. Nothing here is stored: it is worked out from the notes each time you look.
 */
type Tab = 'tasks' | 'board' | 'timeline' | 'notes' | 'activity';

export const hubState = {
  project: '',
  tab: 'tasks' as Tab,
  groupBy: 'due' as GroupBy,
  filters: newFilters() as Filters,
  /** Groups the user opened or closed, against their default (finished work starts closed). */
  toggled: new Set<string>(),
  limits: new Map<string, number>(),
  /** The close-out confirmation is showing. */
  closing: false,
  /** Set while a close out or reopen is writing (the note, then the folder move), so the screen can say so. */
  busy: '',
  /** Reopen is asking whether to move the folder back. */
  reopening: false,
  closeMove: true,
  closeTo: '',
  reopenMove: true,
  reopenTo: '',
  statusOpen: false,
  /** Rows with every chip (status, added date, file) instead of the short row. Kept per device. */
  detailed: readDetailed(),
  /** The filters panel is folded away on a wide screen. */
  paneHidden: false,
  /** The filters flyout is open on a phone. */
  flyout: false,
  /** The View menu is open. */
  viewOpen: false,
  /** Filter sections the user opened. Status and Project start open. */
  secs: new Set<string>(['status', 'project']),
  /** The task note just moved to the trash, so it can be put back. */
  trashed: undefined as undefined | { title: string; trashPath: string; originalPath: string },
  selectMode: false,
  /** Task ids ticked for a bulk change. */
  selected: new Set<string>(),
  /** What the bulk bar has typed into it, kept across redraws. */
  inputs: { status: 'doing', due: '', person: '', tag: '' },
  /** A planned change waiting for Apply, shown as the exact lines that will change. */
  preview: undefined as undefined | { label: string; plan: BulkPlan; action: BulkAction },
  /** The last change made, so it can be undone. */
  last: undefined as undefined | { label: string; edits: BulkPlan['edits'] },
  error: '',
};

function readDetailed(): boolean {
  try {
    return localStorage.getItem('plainfile-detailed-rows') === '1';
  } catch {
    return false;
  }
}

const PAGE = 25;
const isNarrow = (): boolean => window.matchMedia('(max-width: 760px)').matches;
const GROUPS: [GroupBy, string][] = [
  ['due', 'Due date'],
  ['status', 'Status'],
  ['person', 'Person'],
  ['phase', 'Phase'],
  ['tag', 'Tag'],
  ['project', 'Project'],
  ['note', 'Note it lives in'],
];
const COLS: [string, string][] = [
  ['todo', 'To do'],
  ['doing', 'Doing'],
  ['waiting', 'Waiting'],
  ['done', 'Done'],
];

/** The project's tasks, worked out again only when the notes have changed. Typing in the filter box reuses them. */
let taskCache: { version: number; path: string; tasks: HubTask[] } | undefined;
function tasksOf(idx: NonNullable<typeof state.index>, path: string): HubTask[] {
  if (taskCache?.version !== idx.version || taskCache.path !== path) taskCache = { version: idx.version, path, tasks: hubTasks(idx, path) };
  return taskCache.tasks;
}

/** Start fresh for a project: the filters of one project make no sense in another. */
export function resetFor(path: string): void {
  if (hubState.project === path) return;
  Object.assign(hubState, {
    project: path,
    filters: newFilters(),
    toggled: new Set<string>(),
    limits: new Map<string, number>(),
    flyout: false,
    viewOpen: false,
    closing: false,
    busy: '',
    reopening: false,
    closeMove: true,
    closeTo: '',
    reopenMove: true,
    reopenTo: '',
    statusOpen: false,
    selectMode: false,
    selected: new Set<string>(),
    preview: undefined,
    last: undefined,
    error: '',
  });
}

const ago = (ms: number): string => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? 'yesterday' : d < 45 ? `${d} days ago` : fmtDate(localDateOf(ms));
};

function activeChips(): string {
  const f = hubState.filters;
  const chip = (kind: string, value: string, label: string): string =>
    `<span class="chip fchip">${esc(label)}<button class="plain-btn x" data-hub-filter="${kind}:${esc(value)}" aria-label="Remove filter ${esc(label)}">×</button></span>`;
  const out: string[] = [];
  for (const p of f.people) out.push(chip('people', p, `@${p}`));
  for (const g of f.tags) out.push(chip('tags', g, `#${g}`));
  for (const s of f.statuses) out.push(chip('statuses', s, s));
  for (const p of f.phases) out.push(chip('phases', p, p || 'No phase'));
  for (const p of f.priorities) out.push(chip('priorities', p, p === '-' ? 'No priority' : `Priority ${p}`));
  // A date view (Overdue, Today, Upcoming, No date) is shown by the counts and the Show list, so it is not repeated here.
  return out.length ? `<div class="chips hub-active">${out.join('')}<button class="btn small" data-hub-clear>Clear all</button></div>` : '';
}

/** What the filters panel is holding: the facets, not the date views (those are the four counts and the Show list). */
function filterCount(f: Filters): number {
  return f.people.length + f.tags.length + f.statuses.length + f.phases.length + f.priorities.length;
}

const countBy = (xs: string[]): [string, number][] =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/** One choice in the filters panel: its name and how many tasks it would leave. */
function opt(label: string, n: number, on: boolean, attrs: string, indent = false): string {
  return `<button class="opt${on ? ' on' : ''}${n === 0 && !on ? ' dim' : ''}${indent ? ' ind' : ''}" ${attrs} aria-pressed="${on}"><span>${label}</span><span class="n">${n}</span></button>`;
}

/** The filters, in one panel: docked on the left of a wide screen, a flyout on a phone. */
function filtersPane(all: HubTask[], path: string, shown: number): string {
  const idx = state.index;
  if (!idx) return '';
  const f = hubState.filters;
  const everything = path === ALL_PROJECTS;
  const counts = viewCounts(all, today(), listFollowUps(idx).length);
  const cur = currentView(f);
  const tasksTab = hubState.tab === 'tasks';
  const sec = (name: string, title: string, body: string, force = false): string =>
    body ? `<details class="fsec" data-sec="${name}"${hubState.secs.has(name) || force ? ' open' : ''}><summary>${title}</summary>${body}</details>` : '';
  const show = QUICK_VIEWS.filter(([v]) => v !== 'waiting' && (everything || !EVERYTHING_VIEWS.includes(v)))
    .map(([v, l]) => opt(l, counts[v], cur === v, `data-hub-view="${v}"`))
    .join('');
  const facet = (kind: 'statuses' | 'people' | 'tags' | 'phases' | 'priorities', items: [string, string, number][]): string =>
    items.map(([v, l, n]) => opt(esc(l), n, (f[kind] as string[]).includes(v), `data-hub-filter="${kind}:${esc(v)}"`)).join('');
  const statuses = countBy(all.filter((t) => !f.hideDone || t.status !== 'done').map((t) => t.status)).map(([v, n]): [string, string, number] => [v, v, n]);
  const people = countBy(all.flatMap((t) => t.people)).map(([v, n]): [string, string, number] => [v, `@${v}`, n]);
  const tags = countBy(all.flatMap((t) => t.tags)).map(([v, n]): [string, string, number] => [v, `#${v}`, n]);
  const phases = countBy(all.map((t) => t.phase ?? '')).map(([v, n]): [string, string, number] => [v, v || 'No phase', n]);
  const priorities = countBy(all.map((t) => t.item.priority ?? '-'))
    .sort((a, b) => priorityRank(a[0] === '-' ? undefined : a[0]) - priorityRank(b[0] === '-' ? undefined : b[0]))
    .map(([v, n]): [string, string, number] => [v, v === '-' ? 'No priority' : `Priority ${v}`, n]);
  const projects = listProjects(idx);
  const proj = (p: Project): string =>
    opt(`${p.parent ? '↳ ' : ''}${esc(p.title)}`, p.openTasks, p.path === path, `data-open-project="${esc(p.path)}"`, !!p.parent);
  const allOpen = tasksOf(idx, ALL_PROJECTS).filter((t) => t.status !== 'done').length;
  const projectBody =
    opt('All tasks', allOpen, everything, `data-open-project="${ALL_PROJECTS}"`) +
    projects
      .filter((p) => p.active)
      .map(proj)
      .join('') +
    (projects.some((p) => !p.active)
      ? `<div class="fsub">Archived</div>${projects
          .filter((p) => !p.active)
          .map(proj)
          .join('')}`
      : '') +
    '<button class="btn small" data-act="proj-back">All projects</button>';
  const tools = tasksTab
    ? `<div class="tools"><button class="btn small" data-hub-selectmode aria-pressed="${hubState.selectMode}">${hubState.selectMode ? 'Stop selecting' : 'Select tasks'}</button><button class="btn small" data-hub-selectall title="Select every task that matches the filters">Select all shown</button><button class="btn small" data-hub-export="csv" title="Download the tasks shown as a spreadsheet file">Export CSV</button><button class="btn small" data-hub-export="json" title="Download the tasks shown as JSON">Export JSON</button></div>`
    : '';
  const done = all.filter((t) => t.status === 'done').length;
  return (
    `<aside class="fpane${hubState.flyout ? ' fly' : ''}" id="hub-fpane" aria-label="Filters"><div class="fh"><h3>Filters</h3>` +
    '<button class="plain-btn hide-wide" data-hub-pane aria-label="Hide the filters panel">« Hide</button><button class="plain-btn x f-narrow" data-hub-pane aria-label="Close the filters">✕</button></div>' +
    '<button class="btn wide" data-hub-clear>Clear filters</button>' +
    `<label class="sw top"><input type="checkbox" id="hub-showdone"${f.hideDone ? '' : ' checked'}><span>Show done</span><span class="n">${done} done</span></label>` +
    '<div class="fscroll">' +
    `<h4>Show</h4><div class="opts" role="group" aria-label="Show">${show}</div>` +
    sec('status', 'Status', `<div class="opts">${facet('statuses', statuses)}</div>`, f.statuses.length > 0) +
    sec('project', 'Project', `<div class="opts">${projectBody}</div>`) +
    sec('people', 'People', `<div class="opts">${facet('people', people)}</div>`, f.people.length > 0) +
    sec('tags', 'Tags', `<div class="opts">${facet('tags', tags)}</div>`, f.tags.length > 0) +
    sec(
      'priority',
      'Priority',
      priorities.length > 1 || f.priorities.length ? `<div class="opts">${facet('priorities', priorities)}</div>` : '',
      f.priorities.length > 0,
    ) +
    sec('phase', 'Phase', phases.length > 1 || f.phases.length ? `<div class="opts">${facet('phases', phases)}</div>` : '', f.phases.length > 0) +
    (tools ? `<h4>Tools</h4>${tools}` : '') +
    '</div>' +
    `<div class="ff f-narrow"><button class="btn primary wide" data-hub-pane>Show ${shown} task${shown === 1 ? '' : 's'}</button></div></aside>`
  );
}

/** The View menu: which view, how to group, and whether rows are short or detailed. */
function viewMenu(tabs: [Tab, string][]): string {
  const tasksTab = hubState.tab === 'tasks';
  const names: Record<Tab, string> = { tasks: 'List', board: 'Board', timeline: 'Timeline', notes: 'Notes', activity: 'Activity' };
  return (
    `<details class="hub-viewmenu"${hubState.viewOpen ? ' open' : ''}><summary class="btn pill${tasksTab && hubState.detailed ? ' on' : ''}" aria-label="View options">View ▾${tasksTab && hubState.detailed ? ' · Detailed rows' : ''}</summary>` +
    '<div class="hub-viewbox"><div role="group" aria-label="View">' +
    tabs
      .map(
        ([id]) => `<button class="vm-item${hubState.tab === id ? ' on' : ''}" data-hub-tab="${id}" aria-pressed="${hubState.tab === id}">${names[id]}</button>`,
      )
      .join('') +
    '<button class="vm-item" data-nav="calendar">Calendar →</button></div>' +
    (tasksTab
      ? `<label class="vm-row"><span>Group by</span><select id="hub-group" class="inp" aria-label="Group by">${GROUPS.map(([v, l]) => `<option value="${v}"${v === hubState.groupBy ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
        `<label class="vm-row check"><input type="checkbox" id="hub-detailed"${hubState.detailed ? ' checked' : ''}> Detailed rows</label>`
      : '') +
    '</div></details>'
  );
}

/** Search and View on one line, the four date counts under them, and the filters in use as removable chips. */
function toolbar(all: HubTask[], tabs: [Tab, string][]): string {
  const f = hubState.filters;
  const counts = viewCounts(all, today(), state.index ? listFollowUps(state.index).length : 0);
  const cur = currentView(f);
  const n = filterCount(f);
  const dash: [QuickView, string][] = [
    ['late', 'Overdue'],
    ['today', 'Today'],
    ['upcoming', 'Upcoming'],
    ['none', 'No date'],
  ];
  return (
    `<div class="hub-find"><button class="btn pill hub-filterbtn" data-hub-pane aria-label="Filters${n ? `, ${n} on` : ''}">Filters${n ? ` · ${n} on` : ''}</button>` +
    `<input id="hub-q" class="inp hub-q" type="search" autocomplete="off" spellcheck="false" placeholder="${hubState.project === ALL_PROJECTS ? 'Search all tasks…' : 'Search this project…'}" aria-label="Filter tasks in this project" value="${esc(f.text)}">` +
    `${viewMenu(tabs)}</div>` +
    (hubState.tab === 'tasks' || hubState.tab === 'board'
      ? `<div class="hub-dash" role="group" aria-label="Dates">${dash
          .map(
            ([v, l]) =>
              `<button class="cell${cur === v ? ' on' : ''}" data-hub-view="${v}" aria-pressed="${cur === v}" aria-label="${l} ${counts[v]}"><b>${counts[v]}</b><i>${l}</i></button>`,
          )
          .join('')}</div>`
      : '') +
    activeChips()
  );
}

/** Close out, or Reopen, for the project's header. */
function statusButton(d: ProjectDashboard, blocked: Project[] = []): string {
  if (!d.active) return '<button class="btn" data-hub-reopen>Reopen</button>';
  return blocked.length
    ? `<button class="btn" disabled title="Close out its sub-project${blocked.length === 1 ? '' : 's'} first: ${esc(blocked.map((p) => p.title).join(', '))}">Close out</button>`
    : '<button class="btn" data-hub-close>Close out</button>';
}

/** The project's entry in the project list, which says whether it is a sub-project. */
function projectInfo(path: string): Project | undefined {
  return state.index ? listProjects(state.index).find((p) => p.path === path) : undefined;
}

/** The sub-projects of a project: each opens its own page. A project with open sub-projects cannot be closed out. */
function subsHtml(path: string, folder: string, active: boolean): string {
  const idx = state.index;
  if (!idx) return '';
  const subs = subProjects(idx, path);
  if (!subs.length) return '';
  const blocked = openSubProjects(idx, path);
  return (
    `<div class="hub-subs"><h3 class="grp">Sub-projects <span>${subs.length}</span></h3><ul class="plain">` +
    subs
      .map(
        (p) =>
          `<li><button class="link" data-open-project="${esc(p.path)}"><b>${esc(p.title)}</b></button> <span class="muted small">${p.openTasks} open task${p.openTasks === 1 ? '' : 's'}${p.active ? '' : ' · closed out'}</span></li>`,
      )
      .join('') +
    '</ul>' +
    (folder && active ? `<button class="btn small" data-act="proj-sub" data-path="${esc(path)}">+ Sub-project</button>` : '') +
    (active && blocked.length
      ? `<p class="small muted" role="status" style="margin:6px 0 0">Close out ${blocked.length === 1 ? 'the open sub-project' : 'every open sub-project'} before closing this project.</p>`
      : '') +
    '</div>'
  );
}

/** A project that is a folder with an index.md can move as a folder. Returns that folder, or '' for a single-file project. */
function projectFolder(path: string): string {
  const n = state.index?.notes.get(path);
  return n && n.name.toLowerCase() === 'index' ? dirname(n.path) : '';
}
const folderName = (dir: string): string => dir.split('/').pop() ?? dir;
const archiveDir = (dir: string): string => `archive/${folderName(dir)}`;
const restoreDir = (dir: string): string => `projects/${folderName(dir)}`;

/** What moving the folder would do, in words, or why it cannot. */
function movePreview(dir: string, to: string): { html: string; ok: boolean } {
  const idx = state.index;
  if (!idx) return { html: '', ok: false };
  try {
    const plan = planFolderMove(idx, dir, to);
    const warn = plan.warnings.map((w) => `<div class="small">${esc(w)}</div>`).join('');
    return {
      ok: true,
      html: `${plan.files.length} file${plan.files.length === 1 ? '' : 's'} will move to <b>${esc(plan.to)}</b>${plan.edits.length ? `; ${plan.edits.length} link line${plan.edits.length === 1 ? '' : 's'} in ${new Set(plan.edits.map((e) => e.path)).size} note${new Set(plan.edits.map((e) => e.path)).size === 1 ? '' : 's'} will be updated so nothing breaks` : ''}. Nothing is deleted.${warn}`,
    };
  } catch (e) {
    return { ok: false, html: `<span class="err-text">${esc(errorMessage(e))}</span>` };
  }
}

/** The move-the-folder option, shared by the close-out and reopen confirmations. */
function moveOption(kind: 'close' | 'reopen', dir: string): string {
  const on = kind === 'close' ? hubState.closeMove : hubState.reopenMove;
  const to = (kind === 'close' ? hubState.closeTo : hubState.reopenTo) || (kind === 'close' ? archiveDir(dir) : restoreDir(dir));
  const prev = on ? movePreview(dir, to) : { html: '', ok: true };
  return (
    `<div class="mv-opt"><label class="check"><input type="checkbox" id="${kind}-move"${on ? ' checked' : ''}><span>Also move the project folder (<code>${esc(dir)}</code>) to</span></label> ` +
    `<input id="${kind}-to" class="inp" type="text" value="${esc(to)}" aria-label="Folder to move the project to" autocomplete="off"${on ? '' : ' disabled'}>` +
    `<div id="${kind}-preview" class="small muted" aria-live="polite">${prev.html}</div></div>`
  );
}

/** The close-out confirmation, a nudge when every task is done, or a note that the project is archived. */
function projectBanner(d: ProjectDashboard, open: number, total: number): string {
  const dir = d.note && !projectInfo(d.note.path)?.parent ? projectFolder(d.note.path) : ''; // a sub-project stays inside its parent's folder
  const blocked = state.index && d.note ? openSubProjects(state.index, d.note.path) : [];
  if (hubState.busy)
    return `<div class="notice loading" role="status" aria-live="polite"><b>${esc(hubState.busy)}</b><span class="small muted">Files are being changed one at a time. This can take a little while on Dropbox or a phone. Keep this page open.</span></div>`;
  if (!d.active) {
    if (hubState.reopening) {
      return (
        `<div class="notice" role="group" aria-label="Reopen this project"><b>Reopen “${esc(d.title)}”?</b> It goes back on Home and the Tasks tab. Only the project note changes (<code>active: true</code>, <code>completed:</code> removed).` +
        (dir ? moveOption('reopen', dir) : '') +
        ' <button class="btn primary small" data-hub-reopen-go>Reopen</button> <button class="btn small" data-hub-close-cancel>Cancel</button></div>'
      );
    }
    return `<div class="notice small" role="status"><b>Archived.</b> This project is closed out${d.completed ? ` (${esc(fmtDate(d.completed))})` : ''}. Its open tasks still show in Tasks and Home. <button class="btn small" data-hub-reopen>Reopen</button></div>`;
  }
  if (hubState.closing) {
    return (
      `<div class="notice" role="group" aria-label="Close out this project"><b>Close out “${esc(d.title)}”?</b> It moves to the Archive: ${open ? `its ${open} open task${open === 1 ? '' : 's'} stay in Tasks and Home until you finish them. ` : ''}` +
      'The project note gets <code>active: false</code> and <code>completed:</code>. You can reopen it any time.' +
      (dir ? moveOption('close', dir) : '') +
      ' <button class="btn primary small" data-hub-close-go>Close out</button> <button class="btn small" data-hub-close-cancel>Cancel</button></div>'
    );
  }
  if (total > 0 && open === 0 && !blocked.length) {
    return '<div class="notice small" role="status">Every task here is done. <button class="btn small primary" data-hub-close>Close out this project</button></div>';
  }
  return '';
}

/** The lines tagged #followup in any note: they are not tasks, so they are listed on their own. */
function followupsHtml(): string {
  const list = state.index ? listFollowUps(state.index) : [];
  if (!list.length)
    return '<div class="empty">No follow-ups. Add <code>#followup</code> to any line, like <code>- Ask Dana about the logo files #followup</code>, and it shows up here.</div>';
  return `<p class="meta">${list.length} line${list.length === 1 ? '' : 's'} tagged <span class="mono">#followup</span>, from every note</p><ul class="tasks">${list
    .map(
      (f) =>
        `<li class="task" tabindex="-1"><div class="body"><div class="t">${esc(f.title)}</div><div class="chips"><button class="chip src mono" data-open="${esc(f.path)}" data-line="${f.line}" aria-label="Open ${esc(f.path)}">${esc(f.from)} · line ${f.line}</button></div></div></li>`,
    )
    .join('')}</ul>`;
}

/** The one line under a short row: date, people, tags, the project on All tasks, and a status that says something. */
function metaOf(t: HubTask): string {
  const bits: string[] = [];
  if (t.due) bits.push(fmtDate(t.due));
  for (const w of t.people) bits.push(`@${w}`);
  for (const g of t.tags) bits.push(`#${g}`);
  if (hubState.project === ALL_PROJECTS && t.projects?.length) bits.push(t.projects[0] as string);
  if (t.status !== 'todo' && t.status !== 'done') bits.push(t.status);
  if (t.item.sub?.total) bits.push(`${t.item.sub.done} of ${t.item.sub.total}`);
  if (t.item.recur) bits.push(`↻ ${describeRecurrence(t.item.recur)}`);
  return bits.map(esc).join(' · ');
}

/** "2d late" for an open task whose date has passed. */
function ageOf(t: HubTask): { text: string; late: boolean } | undefined {
  if (!t.due || t.status === 'done' || t.due >= today()) return undefined;
  const days = Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${t.due}T00:00:00Z`)) / 86400000);
  return { text: `${days}d late`, late: true };
}

function groupsHtml(visible: HubTask[]): string {
  if (hubState.filters.followups) return followupsHtml();
  const groups = groupTasks(visible, hubState.groupBy, today(), justDone);
  if (!groups.length) return '<div class="empty">No tasks match. Clear a filter, or add one with <b>+ Task</b>.</div>';
  return groups
    .map((g) => {
      const key = `${hubState.groupBy}:${g.key}`;
      const collapsed = (g.key === 'done') !== hubState.toggled.has(key);
      const limit = hubState.limits.get(key) ?? PAGE;
      const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
      let h = `<section class="hub-group"><button class="grp${g.late ? ' late' : ''}" data-hub-collapse="${esc(key)}" aria-expanded="${!collapsed}"><span>${collapsed ? '▸' : '▾'} ${esc(g.title)} <span class="n">${g.items.length}</span></span><span class="gprog" title="${g.done} of ${g.total} done"><i style="width:${pct}%"></i></span></button>`;
      if (!collapsed) {
        h += `<ul class="tasks">${g.items
          .slice(0, limit)
          .map((t) =>
            hubState.detailed
              ? row(t.item, { on: hubState.selected.has(t.item.id) })
              : simpleRow(t.item, metaOf(t), ageOf(t), { on: hubState.selected.has(t.item.id) }),
          )
          .join('')}</ul>`;
        if (g.items.length > limit)
          h += `<button class="btn small" data-hub-more="${esc(key)}">Show ${Math.min(PAGE, g.items.length - limit)} more of ${g.items.length - limit}</button>`;
      }
      return `${h}</section>`;
    })
    .join('');
}

function bulkHtml(): string {
  const n = hubState.selected.size;
  const p = hubState.preview;
  let h = '';
  if (hubState.last && !p)
    h += `<div class="notice ok small" role="status">${esc(hubState.last.label)} <button class="btn small" data-hub-undo>Undo</button></div>`;
  if (hubState.trashed)
    h += `<div class="notice ok small" role="status">Moved “${esc(hubState.trashed.title)}” to the trash. <button class="btn small" data-hub-untrash>Undo</button></div>`;
  if (hubState.error) h += `<div class="notice err small">${esc(hubState.error)}</div>`;
  if (p) {
    const e = p.plan.edits;
    h +=
      `<div class="hub-preview card" role="dialog" aria-label="Review the change"><b>${esc(p.label)}</b><p class="small muted" style="margin:2px 0 6px">${e.length ? `${e.length} note${e.length === 1 ? '' : 's'} will change. Nothing is written until you press Apply.` : 'Nothing would change.'}${p.plan.skipped ? ` ${p.plan.skipped} selected task${p.plan.skipped === 1 ? '' : 's'} cannot take this change and ${p.plan.skipped === 1 ? 'is' : 'are'} left alone.` : ''}</p>` +
      `<ul class="plain small">${e
        .slice(0, 8)
        .map(
          (x) =>
            `<li><div class="mono muted">${esc(x.path)}:${x.line}</div><div class="diff"><div class="del"><span class="sg">−</span><span>${esc(x.was) || ' '}</span></div><div class="add"><span class="sg">+</span><span>${esc(x.now) || ' '}</span></div></div></li>`,
        )
        .join('')}${e.length > 8 ? `<li class="muted">and ${e.length - 8} more notes</li>` : ''}</ul>` +
      `<div class="row-gap"><button class="btn primary" data-hub-apply${e.length ? '' : ' disabled'}>Apply</button><button class="btn" data-hub-cancel>Cancel</button></div></div>`;
  }
  if (n && !p) {
    const i = hubState.inputs;
    h +=
      `<div class="hub-bulk" role="toolbar" aria-label="Change the selected tasks"><b>${n} selected</b>` +
      '<button class="btn small" data-hub-bulk="done">Done</button><button class="btn small" data-hub-bulk="reopen">Reopen</button>' +
      `<select id="bulk-status" class="inp" aria-label="Status">${STATUSES.map((s) => `<option${s === i.status ? ' selected' : ''}>${s}</option>`).join('')}</select><button class="btn small" data-hub-bulk="status">Set status</button>` +
      `<input id="bulk-due" class="inp date" type="date" aria-label="Due date" value="${esc(i.due)}"><button class="btn small" data-hub-bulk="due">Set due</button><button class="btn small" data-hub-bulk="nodue">Clear due</button>` +
      `<span class="small muted">Priority</span>${['A', 'B', 'C'].map((l) => `<button class="btn small" data-hub-bulk="pri-${l}" aria-label="Set priority ${l}">${l}</button>`).join('')}<button class="btn small" data-hub-bulk="pri-none">None</button>` +
      `<input id="bulk-person" class="inp" autocomplete="off" data-suggest="people" placeholder="@person" aria-label="Person" value="${esc(i.person)}"><button class="btn small" data-hub-bulk="person">Assign</button>` +
      `<input id="bulk-tag" class="inp" autocomplete="off" data-suggest="tags" placeholder="#tag" aria-label="Tag" value="${esc(i.tag)}"><button class="btn small" data-hub-bulk="tag">Tag</button>` +
      '<button class="btn small" data-hub-bulk-clear>Clear selection</button></div>';
  }
  return h;
}

function boardHtml(all: HubTask[]): string {
  const f = { ...hubState.filters, hideDone: false };
  const open = applyFilters(all, f, justDone, today());
  // The Done column ignores the date view (Overdue, Today, Upcoming, No date): a finished task is not due any more, so a date view would empty it.
  const finished = applyFilters(all, { ...f, due: undefined }, justDone, today()).filter((t) => t.status === 'done');
  const vis = [...open.filter((t) => t.status !== 'done'), ...finished];
  // Columns that hold cards share the room; an empty one stays slim, so three cards do not sit in a narrow strip.
  const sizes = COLS.map(([key]) => (vis.some((t) => t.status === key) ? '1fr' : '0.45fr'));
  return (
    `<div class="hub-cols" style="--cols:${sizes.map((x) => `minmax(0,${x})`).join(' ')}">` +
    COLS.map(([key, label], ci) => {
      const cards = vis
        .filter((t) => t.status === key)
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.item.title.localeCompare(b.item.title));
      return (
        `<div class="hub-col" data-col="${key}"><h3>${label} <span class="n">${cards.length}</span></h3>` +
        cards
          .slice(0, 60)
          .map((t) => {
            const file = t.item.kind === 'file';
            const prev = COLS[ci - 1]?.[0];
            const next = COLS[ci + 1]?.[0];
            return (
              `<div class="hub-card" data-card-open="${esc(t.item.path)}" data-line="${t.item.line}"><div class="t">${esc(t.item.title)}</div><div class="chips">${t.due ? `<span class="chip${t.due < today() && t.status !== 'done' ? ' late' : ''}">${esc(fmtDate(t.due))}</span>` : ''}${t.people.map((p) => `<span class="chip mono">@${esc(p)}</span>`).join('')}${t.phase ? `<span class="chip quiet">${esc(t.phase)}</span>` : ''}</div>` +
              `<div class="hub-move">${prev ? `<button class="btn small" data-hub-move="${esc(t.item.id)}|${prev}" aria-label="Move to ${prev}">←</button>` : ''}<button class="btn small" data-open="${esc(t.item.path)}" data-line="${t.item.line}">Open</button>${next ? `<button class="btn small" data-hub-move="${esc(t.item.id)}|${next}" aria-label="Move to ${next}">→</button>` : ''}${!file ? `<button class="cb" data-toggle="${esc(t.item.id)}" aria-pressed="${t.status === 'done'}" aria-label="${t.status === 'done' ? 'Mark not done' : 'Mark done'}: ${esc(t.item.title)}">${t.status === 'done' ? '✓' : ''}</button>` : ''}</div></div>`
            );
          })
          .join('') +
        (cards.length === 0 ? '<p class="muted small">Nothing here.</p>' : '') +
        '</div>'
      );
    }).join('') +
    '</div>'
  );
}

/** Monday of the week a date falls in. */
function monday(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

function timelineHtml(all: HubTask[]): string {
  const vis = applyFilters(all, hubState.filters, justDone, today());
  const t0 = monday(today());
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(t0, i * 7));
  const bucket = (t: HubTask): number =>
    !t.due
      ? 9
      : t.due < t0
        ? 0
        : t.due >= addDays(t0, 56)
          ? 10
          : 1 + Math.floor((Date.parse(`${t.due}T00:00:00Z`) - Date.parse(`${t0}T00:00:00Z`)) / (7 * 86400000));
  const phases = [...new Set(vis.map((t) => t.phase ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const heads = ['Overdue', ...weeks.map((w) => fmtDate(w).replace(/^\w+ /, '')), 'No date', 'Later'];
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let h = `<div class="hub-tl" style="grid-template-columns:7rem repeat(${heads.length}, minmax(5.5rem, 1fr))"><div class="h"></div>${heads.map((x) => `<div class="h">${esc(x)}</div>`).join('')}`;
  for (const p of phases) {
    h += `<div class="rowh">${esc(p || 'No phase')}</div>`;
    for (const b of order) {
      const cell = vis.filter((t) => (t.phase ?? '') === p && bucket(t) === b).sort((a, c) => (a.due ?? '').localeCompare(c.due ?? ''));
      h += `<div class="cell${b === 0 && cell.length ? ' late' : ''}">${cell
        .slice(0, 4)
        .map(
          (t) =>
            `<button class="tlitem${t.status === 'done' ? ' done' : ''}" data-open="${esc(t.item.path)}" data-line="${t.item.line}" title="${esc(t.item.title)}${t.due ? ` · ${esc(fmtDate(t.due))}` : ''}">${esc(t.item.title)}</button>`,
        )
        .join('')}${cell.length > 4 ? `<span class="muted small">+${cell.length - 4} more</span>` : ''}</div>`;
    }
  }
  return `${h}</div>${phases.length ? '' : '<div class="empty">No tasks match.</div>'}`;
}

function statusColumn(all: HubTask[]): string {
  const s = summarize(all, today(), Date.now());
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const f = hubState.filters;
  const spark = Math.max(1, ...s.weekly);
  const panel =
    hubState.tab === 'tasks' && state.selected && state.index?.getTask(state.selected)
      ? `<div class="hub-taskpanel" aria-live="polite"><button class="btn small hub-sheet-x" data-hub-sheet-close aria-label="Close task details">✕</button>${taskPanelHtml()}</div>`
      : '';
  // A selected task fills the column with its detail; with none selected it shows the project's progress.
  if (panel) return `<aside class="hub-status has-task" aria-label="Task details">${panel}</aside>`;
  return (
    '<aside class="hub-status" aria-label="Project status">' +
    `<details class="hub-status-d"${isNarrow() && !hubState.statusOpen ? '' : ' open'}><summary class="small">Status: ${s.done} of ${s.total} done${s.overdue ? `, ${s.overdue} overdue` : ''}</summary>` +
    `<h3>Progress</h3><div class="prog"><i style="width:${pct}%"></i></div><p class="small muted" style="margin:4px 0 8px">${s.done} of ${s.total} done${s.total ? ` (${pct}%)` : ''} · ${s.overdue} overdue</p>` +
    (s.phases.length
      ? `<h3>Phases</h3>${s.phases.map((p) => `<button class="hub-phase${f.phases.includes(p.name === 'No phase' ? '' : p.name) ? ' on' : ''}" data-hub-filter="phases:${esc(p.name === 'No phase' ? '' : p.name)}"><span>${esc(p.name)}</span><b>${p.done}/${p.total}</b><span class="prog"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></i></span></button>`).join('')}`
      : '') +
    (s.people.length
      ? `<h3>Who has what</h3><div class="chips">${s.people
          .slice(0, 10)
          .map(
            (p) =>
              `<button class="chip mono${p.name && f.people.includes(p.name) ? ' on' : ''}" ${p.name ? `data-hub-filter="people:${esc(p.name)}"` : 'disabled'}>${p.name ? `@${esc(p.name)}` : 'nobody'} ${p.open}</button>`,
          )
          .join('')}</div>`
      : '') +
    (s.next.length
      ? `<h3>Next up</h3><ol class="small hub-next">${s.next.map((t) => `<li><button class="link" data-open="${esc(t.item.path)}" data-line="${t.item.line}">${esc(t.item.title)}</button>${t.due ? ` <span class="muted">${esc(fmtDate(t.due))}</span>` : ''}</li>`).join('')}</ol>`
      : '') +
    `<h3>Done per week <span class="muted" title="From the day a task was finished where it says so, otherwise from when its note was last changed">(estimate)</span></h3><div class="spark" aria-label="Tasks finished in each of the last six weeks">${s.weekly.map((n) => `<i style="height:${Math.max(6, Math.round((n / spark) * 100))}%" title="${n} done"></i>`).join('')}</div>` +
    '</details></aside>'
  );
}

export function html(path: string): string {
  const idx = state.index;
  const everything = path === ALL_PROJECTS;
  const d = idx ? (everything ? allDashboard(idx) : projectDashboard(idx, path, today(), justDone)) : undefined;
  if (!idx || !d) return '<div class="empty">That project is no longer there. <button class="btn" data-act="proj-back">All projects</button></div>';
  resetFor(path);
  const all = tasksOf(idx, path);
  const covered = projectNotes(idx, path);
  const visible = applyFilters(all, hubState.filters, justDone, today());
  const dir = !d.note ? '' : d.note.name.toLowerCase() === 'index' ? dirname(d.note.path) : '';
  const me = everything ? undefined : projectInfo(path);
  const blocked = d.note ? openSubProjects(idx, d.note.path) : [];
  const subBtn = dir && d.active && !me?.parent ? `<button class="btn" data-act="proj-sub" data-path="${esc(path)}">+ Sub-project</button>` : '';
  const name = !d.note ? '' : dir ? (dir.split('/').pop() as string) : d.note.name;
  const openCount = all.filter((t) => t.status !== 'done').length;
  const tabs: [Tab, string][] = [
    ['tasks', `Tasks ${openCount}`],
    ['board', 'Board'],
    ['timeline', 'Timeline'],
    ['notes', `Notes ${d.notes.length}`],
    ['activity', 'Activity'],
  ];
  const showPane = (hubState.tab === 'tasks' || hubState.tab === 'board' || hubState.tab === 'timeline') && !(hubState.paneHidden && !isNarrow());
  let body = '';
  if (hubState.tab === 'tasks') body = `${toolbar(all, tabs)}<div id="hub-body">${groupsHtml(visible)}</div>`;
  else if (hubState.tab === 'board') body = `${toolbar(all, tabs)}<div id="hub-body">${boardHtml(all)}</div>`;
  else if (hubState.tab === 'timeline') body = `${toolbar(all, tabs)}<div id="hub-body" class="hub-scroll">${timelineHtml(all)}</div>`;
  else if (hubState.tab === 'notes')
    body = d.notes.length
      ? `<ul class="plain pnotes">${d.notes
          .slice(0, 80)
          .map(
            (n) =>
              `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(fmtDate(localDateOf(n.mtime)))}</span>${n.type ? `<span class="chip">${esc(n.type)}</span>` : ''}<span class="chip src mono">${esc(n.path)}</span></span></button></li>`,
          )
          .join(
            '',
          )}</ul>${d.followups.length ? `<h3 class="grp">Follow-ups <span>${d.followups.length}</span></h3><ul class="tasks">${d.followups.map((f) => `<li class="task" tabindex="-1"><div class="body"><div class="t">${esc(f.title)}</div><div class="chips"><button class="chip src mono" data-open="${esc(f.path)}" data-line="${f.line}">${esc(f.from)} · line ${f.line}</button></div></div></li>`).join('')}</ul>` : ''}`
      : '<div class="empty">No notes yet. Add one with <b>+ Note</b> or <b>+ Meeting</b>.</div>';
  else {
    const recent = [...covered].sort((a, b) => b.mtime - a.mtime).slice(0, 30);
    body = `<p class="small muted">Taken from when each note was last changed.</p><ul class="plain pnotes">${recent.map((n) => `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(ago(n.mtime))}</span><span class="chip src mono">${esc(n.path)}</span></span></button></li>`).join('')}</ul>`;
  }
  const log = logHtml();
  return (
    `<div class="hubwrap${hubState.selectMode || hubState.selected.size ? ' sel-on' : ''}${showPane ? '' : ' nopane'}">${showPane ? filtersPane(all, path, visible.length) : ''}${hubState.flyout && showPane ? '<div class="fly-back" data-hub-pane></div>' : ''}<div class="hub-main">` +
    `<div class="ed-head${everything ? ' all' : ''}"><div style="min-width:0"><h2 class="title">${esc(d.title)}</h2><div class="meta">${me?.parent ? `Part of <button class="link" data-open-project="${esc(me.parent)}">${esc(idx.notes.get(me.parent)?.title ?? 'its project')}</button> · ` : ''}${everything ? 'Every project' : d.active ? 'Active' : `Archived${d.completed ? ` · closed ${esc(fmtDate(d.completed))}` : ''}`}${d.created ? ` · started ${esc(fmtDate(d.created))}` : ''}${d.lastChange ? ` · last change ${esc(localDateOf(d.lastChange) === today() ? 'today' : fmtDate(localDateOf(d.lastChange)))}` : ''}</div></div>` +
    (everything
      ? '</div>'
      : `<div class="ed-actions"><button class="btn primary" data-act="proj-task" data-path="${esc(path)}">+ Task</button>` +
        `<span class="hub-wide-actions"><button class="btn" data-act="proj-note" data-path="${esc(path)}">+ Note</button><button class="btn" data-act="proj-meeting" data-name="${esc(name)}">+ Meeting</button>${subBtn}<button class="btn" data-report-open="${esc(path)}">Report</button><button class="btn" data-report-open="${esc(path)}" data-report-kind="book" title="Every note in this project as one document">Export notes</button>${statusButton(d, blocked)}<button class="btn" data-open="${esc(path)}">Open note</button></span>` +
        `<details class="hub-more"><summary class="btn" aria-label="More: new note, new meeting, open the project note">⋯</summary><div class="hub-more-box"><button class="btn" data-act="proj-note" data-path="${esc(path)}">+ Note</button><button class="btn" data-act="proj-meeting" data-name="${esc(name)}">+ Meeting</button>${subBtn}<button class="btn" data-report-open="${esc(path)}">Report</button><button class="btn" data-report-open="${esc(path)}" data-report-kind="book" title="Every note in this project as one document">Export notes</button>${statusButton(d, blocked)}<button class="btn" data-open="${esc(path)}">Open note</button></div></details></div></div>`) +
    (everything ? '' : projectBanner(d, openCount, all.length) + subsHtml(path, dir, d.active)) +
    (everything ? `${quickBar('hub-quick').form}${quickBar('', true).below}` : '') +
    (d.summary && !everything ? `<p class="psummary">${esc(d.summary)}</p>` : '') +
    '<div class="tabsrow">' +
    `<div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" class="tab${hubState.tab === id ? ' on' : ''}" data-hub-tab="${id}" aria-selected="${hubState.tab === id}">${esc(l)}</button>`).join('')}</div>` +
    '<button class="tab-link" data-nav="calendar" title="Tasks and dated notes by day">Calendar →</button></div>' +
    `<div class="hub-content">${hubState.tab === 'tasks' || hubState.tab === 'board' ? `<div id="hub-bulk">${bulkHtml()}</div>` : ''}${body}</div>${log ? `<div class="plog" aria-live="polite">${log}</div>` : ''}</div>${statusColumn(all)}</div>`
  );
}

/** The numbers for "All tasks": the same shape as one project's dashboard, worked out over every note. */
function allDashboard(idx: NonNullable<typeof state.index>): ProjectDashboard {
  const notes = [...idx.notes.values()];
  const tasks = hubTasks(idx, ALL_PROJECTS);
  return {
    note: undefined,
    title: 'All tasks',
    active: true,
    summary: 'Every task from every project, and from notes that belong to none. Group by Project to see them side by side.',
    created: undefined,
    open: [],
    overdue: tasks.filter((t) => t.status !== 'done' && t.due && t.due < today()).length,
    done: tasks.filter((t) => t.status === 'done').length,
    total: tasks.length,
    notes: notes.filter((n) => !n.fileTask).sort((a, b) => b.mtime - a.mtime),
    followups: notes.flatMap((n) => n.followups.map((f) => ({ path: n.path, line: f.line, title: f.title, from: n.title }))),
    people: [],
    tags: [],
    lastChange: notes.reduce((m, n) => Math.max(m, n.mtime), 0),
  };
}

function refreshBody(): void {
  const idx = state.index;
  const el = document.getElementById('hub-body');
  if (!idx || !el) return render();
  const all = tasksOf(idx, hubState.project);
  el.innerHTML =
    hubState.tab === 'board'
      ? boardHtml(all)
      : hubState.tab === 'timeline'
        ? timelineHtml(all)
        : groupsHtml(applyFilters(all, hubState.filters, justDone, today()));
}

function toggleFilter(kind: string, value: string): void {
  const f = hubState.filters;
  const list = f[kind as 'people' | 'tags' | 'statuses' | 'phases' | 'priorities'] as string[] | undefined;
  if (!list) return;
  const at = list.indexOf(value);
  if (at >= 0) list.splice(at, 1);
  else list.push(value);
  hubState.limits.clear();
}

/** Work out a bulk change for the ticked tasks and show it, without writing anything. */
async function planFor(kind: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  const i = hubState.inputs;
  const map: Record<string, [BulkAction, string]> = {
    done: [{ kind: 'done', done: true, on: today() }, 'Mark done'],
    reopen: [{ kind: 'done', done: false, on: today() }, 'Reopen'],
    status: [{ kind: 'status', status: i.status as Status, on: today() }, `Set status to ${i.status}`],
    due: [{ kind: 'due', date: i.due || '' }, `Set due date to ${i.due}`],
    nodue: [{ kind: 'due', date: null }, 'Clear the due date'],
    person: [{ kind: 'person', name: i.person }, `Assign ${i.person.startsWith('@') ? i.person : `@${i.person}`}`],
    tag: [{ kind: 'tag', tag: i.tag }, `Add tag ${i.tag.startsWith('#') ? i.tag : `#${i.tag}`}`],
  };
  const pri = /^pri-([A-Z]|none)$/.exec(kind);
  if (pri)
    map[kind] = [
      { kind: 'priority', letter: pri[1] === 'none' ? null : (pri[1] as string) },
      pri[1] === 'none' ? 'Clear the priority' : `Set priority ${pri[1]}`,
    ];
  const pick = map[kind];
  if (!pick) return;
  hubState.error = '';
  try {
    const plan = await planBulk(storage, index, [...hubState.selected], pick[0]);
    hubState.preview = { label: `${pick[1]} · ${hubState.selected.size} task${hubState.selected.size === 1 ? '' : 's'}`, plan, action: pick[0] };
  } catch (e) {
    hubState.error = errorMessage(e);
  }
  render();
}

async function applyPreview(): Promise<void> {
  const { storage, index } = state;
  const p = hubState.preview;
  if (!storage || !index || !p) return;
  try {
    const changes = await applyBulk(storage, index, p.plan.edits);
    hubState.last = { label: `${p.label}: changed ${changes.length} note${changes.length === 1 ? '' : 's'}.`, edits: p.plan.edits };
    state.log = changes[changes.length - 1] ?? state.log;
    hubState.selected.clear();
    hubState.preview = undefined;
    hubState.error = '';
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    hubState.error = friendly ?? `Could not apply that. ${errorMessage(e)}`;
    hubState.preview = undefined;
  }
  render();
}

async function undoLast(): Promise<void> {
  const { storage, index } = state;
  const l = hubState.last;
  if (!storage || !index || !l) return;
  try {
    await applyBulk(storage, index, l.edits, 'back');
    hubState.last = undefined;
    hubState.error = '';
  } catch (e) {
    hubState.error = `Could not undo, a note has changed since. ${errorMessage(e)}`;
    hubState.last = undefined;
  }
  render();
}

// After a quick add on the Tasks screen, show a view that includes the new task (its date decides which).
quickHooks.added = (due) => {
  if (state.screen !== 'projects' || hubState.tab !== 'tasks') return;
  const cur = currentView(hubState.filters);
  if (cur === 'all') return;
  const t = today();
  const next: QuickView = !due ? 'all' : due <= addDays(t, 7) ? 'today' : 'upcoming';
  if (cur !== next) hubState.filters = filtersForView(hubState.filters, next);
};

/** Hooks the project screen sets, so it follows the project when its folder moves. */
export const hubHooks: { moved?: (newPath: string) => void } = {};

/**
 * Close out the open project, or reopen it, then (if asked) move its folder. The note is written first, so if the
 * move fails the project is still correctly closed or reopened, and the message says what did not happen.
 */
async function setActive(active: boolean): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index || !hubState.project || hubState.busy) return;
  hubState.closing = false;
  hubState.reopening = false;
  const dir = projectInfo(hubState.project)?.parent ? '' : projectFolder(hubState.project); // a sub-project stays in its parent's folder
  const wantMove = dir && (active ? hubState.reopenMove : hubState.closeMove);
  const to = (active ? hubState.reopenTo || restoreDir(dir) : hubState.closeTo || archiveDir(dir)).trim();
  hubState.busy = active ? 'Reopening the project…' : 'Closing out the project…';
  render();
  await new Promise((r) => setTimeout(r, 0)); // let the browser paint the working state before the slow part
  try {
    state.log = await setProjectActive(storage, index, hubState.project, active, today());
    hubState.error = '';
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    hubState.error = friendly ?? `Could not save that change. ${errorMessage(e)}`;
    hubState.busy = '';
    render();
    return;
  }
  if (wantMove) {
    hubState.busy = `${active ? 'Reopened' : 'Closed out'}. Moving the folder to ${to}…`;
    render();
    await new Promise((r) => setTimeout(r, 0));
    try {
      const r = await applyFolderMove(storage, index, planFolderMove(index, dir, to));
      const links = new Set(r.changes.map((c) => c.path)).size;
      hubState.project = `${r.to}/${hubState.project.split('/').pop() as string}`;
      hubHooks.moved?.(hubState.project);
      state.log = {
        message: `Moved ${r.moved} file${r.moved === 1 ? '' : 's'} to ${r.to}${r.changes.length ? ` and updated ${r.changes.length} link line${r.changes.length === 1 ? '' : 's'} in ${links} note${links === 1 ? '' : 's'}` : ''}.`,
      };
    } catch (e) {
      const friendly = writeFailure(e);
      if (friendly) await rescan();
      hubState.error = `The project is ${active ? 'reopened' : 'closed out'}, but its folder was not moved. ${friendly ?? errorMessage(e)}`;
    }
  }
  hubState.busy = '';
  render();
}

async function move(id: string, status: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  try {
    state.log = await setTaskStatus(storage, index, id, status, { completedOn: today() });
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    state.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
  }
  render();
}

/** Move a task that is its own note to the trash, with Undo. A task line inside a note has no file of its own, so it has no such button. */
async function trashTask(path: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  try {
    const plan = planDelete(index, path, new Date().toISOString().slice(0, 19).replace(/:/g, '-'));
    const r = await deleteNote(storage, index, plan, { trash: true });
    hubState.trashed = r.trashedTo ? { title: plan.title, trashPath: r.trashedTo, originalPath: path } : undefined;
    state.selected = undefined;
    state.context = undefined;
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    hubState.error = friendly ?? `Could not move it to the trash. ${errorMessage(e)}`;
  }
  render();
}

async function untrash(): Promise<void> {
  const { storage, index } = state;
  const t = hubState.trashed;
  if (!storage || !index || !t) return;
  try {
    await restoreNote(storage, index, { trashPath: t.trashPath, originalPath: t.originalPath, stamp: '', size: 0 });
    hubState.trashed = undefined;
  } catch (e) {
    hubState.error = `Could not put it back. ${errorMessage(e)}`;
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const q = <T extends string>(attr: string): T | undefined => (target.closest(`[${attr}]`) as HTMLElement | null)?.getAttribute(attr) as T | undefined;
  // A click anywhere but the View menu closes it.
  if (hubState.viewOpen && !target.closest('.hub-viewmenu')) {
    hubState.viewOpen = false;
    document.querySelector('.hub-viewmenu')?.removeAttribute('open');
  }
  const cardOpen = target.closest<HTMLElement>('[data-card-open]');
  if (cardOpen?.dataset.cardOpen && !target.closest('button')) {
    await openNote(cardOpen.dataset.cardOpen, { line: Number(cardOpen.dataset.line) });
    return true;
  }
  const statusSum = target.closest<HTMLElement>('.hub-status-d > summary');
  if (statusSum) {
    hubState.statusOpen = !(statusSum.parentElement as HTMLDetailsElement).open;
    return false;
  }
  if (target.closest('[data-hub-selectmode]')) {
    hubState.selectMode = !hubState.selectMode;
    if (!hubState.selectMode) {
      hubState.selected.clear();
      hubState.preview = undefined;
    }
    render();
    return true;
  }
  const secSum = target.closest<HTMLElement>('.fsec > summary');
  if (secSum) {
    const d = secSum.parentElement as HTMLDetailsElement;
    if (d.open) hubState.secs.delete(d.dataset.sec ?? '');
    else hubState.secs.add(d.dataset.sec ?? ''); // the click is about to toggle it
    return false;
  }
  const viewSum = target.closest<HTMLElement>('.hub-viewmenu > summary');
  if (viewSum) {
    hubState.viewOpen = !(viewSum.parentElement as HTMLDetailsElement).open;
    return false;
  }
  if (target.closest('[data-hub-pane]')) {
    if (isNarrow()) hubState.flyout = !hubState.flyout;
    else hubState.paneHidden = !hubState.paneHidden;
    render();
    return true;
  }
  if (target.closest('[data-hub-sheet-close]')) {
    state.selected = undefined;
    state.context = undefined;
    render();
    return true;
  }
  const trash = q('data-task-trash');
  if (trash) {
    await trashTask(trash);
    return true;
  }
  if (target.closest('[data-hub-untrash]')) {
    await untrash();
    return true;
  }
  const sel = target.closest<HTMLInputElement>('[data-hub-select]');
  if (sel) {
    const id = sel.getAttribute('data-hub-select') as string;
    if (hubState.selected.has(id)) hubState.selected.delete(id);
    else hubState.selected.add(id);
    hubState.preview = undefined;
    render();
    return true;
  }
  if (q('data-hub-close') !== undefined) {
    hubState.closing = true;
    hubState.closeTo = '';
    render();
    return true;
  }
  if (q('data-hub-reopen') !== undefined) {
    // A folder under archive/ may be moved back, so ask; any other project just reopens.
    if (projectFolder(hubState.project).startsWith('archive/')) {
      hubState.reopening = true;
      hubState.reopenTo = '';
      render();
    } else await setActive(true);
    return true;
  }
  if (q('data-hub-close-cancel') !== undefined) {
    hubState.closing = false;
    hubState.reopening = false;
    render();
    return true;
  }
  if (q('data-hub-close-go') !== undefined || q('data-hub-reopen-go') !== undefined) {
    await setActive(q('data-hub-reopen-go') !== undefined);
    return true;
  }
  const exp = q('data-hub-export');
  if (exp) {
    const idx = state.index;
    if (idx) {
      const shown = applyFilters(tasksOf(idx, hubState.project), hubState.filters, justDone, today());
      const base = `tasks-${hubState.project === ALL_PROJECTS ? 'all' : (idx.notes.get(hubState.project)?.name ?? 'project')}-${today()}`.replace(
        /[^\w.-]+/g,
        '-',
      );
      if (exp === 'csv') save('\ufeff' + tasksToCsv(shown), `${base}.csv`, 'text/csv;charset=utf-8');
      else save(tasksToJson(shown), `${base}.json`, 'application/json');
    }
    return true;
  }
  if (target.closest('[data-hub-selectall]')) {
    const idx = state.index;
    if (idx) for (const t of applyFilters(tasksOf(idx, hubState.project), hubState.filters, justDone, today())) hubState.selected.add(t.item.id);
    render();
    return true;
  }
  if (target.closest('[data-hub-bulk-clear]')) {
    hubState.selected.clear();
    hubState.preview = undefined;
    render();
    return true;
  }
  const bulk = q('data-hub-bulk');
  if (bulk) {
    await planFor(bulk);
    return true;
  }
  if (target.closest('[data-hub-cancel]')) {
    hubState.preview = undefined;
    render();
    return true;
  }
  if (target.closest('[data-hub-apply]')) {
    await applyPreview();
    return true;
  }
  if (target.closest('[data-hub-undo]')) {
    await undoLast();
    return true;
  }
  const tab = q<Tab>('data-hub-tab');
  if (tab) {
    state.log = undefined;
    hubState.tab = tab;
    hubState.viewOpen = false;
    render();
    return true;
  }
  const filter = q('data-hub-filter');
  if (filter) {
    state.log = undefined; // the readout of the last change goes when you look at something else
    const i = filter.indexOf(':');
    toggleFilter(filter.slice(0, i), filter.slice(i + 1));
    render();
    return true;
  }
  const view = q<QuickView>('data-hub-view');
  if (view) {
    state.log = undefined;
    hubState.filters = filtersForView(hubState.filters, currentView(hubState.filters) === view && view !== 'all' ? 'all' : view);
    hubState.limits.clear();
    render();
    return true;
  }
  const due = q<NonNullable<Filters['due']>>('data-hub-due');
  if (due) {
    state.log = undefined;
    hubState.filters.due = hubState.filters.due === due ? undefined : due;
    render();
    return true;
  }
  if (target.closest('[data-hub-clear]')) {
    state.log = undefined;
    hubState.filters = newFilters(hubState.filters.hideDone);
    render();
    return true;
  }
  const col = q('data-hub-collapse');
  if (col) {
    if (hubState.toggled.has(col)) hubState.toggled.delete(col);
    else hubState.toggled.add(col);
    refreshBody();
    return true;
  }
  const more = q('data-hub-more');
  if (more) {
    hubState.limits.set(more, (hubState.limits.get(more) ?? PAGE) + PAGE);
    refreshBody();
    return true;
  }
  const mv = q('data-hub-move');
  if (mv) {
    const [id, status] = mv.split('|');
    if (id && status) await move(id, status);
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'close-to' || t.id === 'reopen-to') {
    const close = t.id === 'close-to';
    if (close) hubState.closeTo = t.value;
    else hubState.reopenTo = t.value;
    const dir = projectFolder(hubState.project);
    const prev = document.getElementById(close ? 'close-preview' : 'reopen-preview');
    if (prev && dir) prev.innerHTML = movePreview(dir, t.value.trim() || (close ? archiveDir(dir) : restoreDir(dir))).html;
    return true;
  }
  const field: Record<string, 'due' | 'person' | 'tag'> = { 'bulk-due': 'due', 'bulk-person': 'person', 'bulk-tag': 'tag' };
  if (field[t.id]) {
    hubState.inputs[field[t.id] as 'due' | 'person' | 'tag'] = t.value;
    return true;
  }
  if (t.id === 'hub-q') {
    hubState.filters.text = t.value;
    hubState.limits.clear();
    refreshBody();
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === 'close-move' || t.id === 'reopen-move') {
    if (t.id === 'close-move') hubState.closeMove = (t as HTMLInputElement).checked;
    else hubState.reopenMove = (t as HTMLInputElement).checked;
    render();
    return true;
  }
  if (t.id === 'bulk-status') {
    hubState.inputs.status = t.value;
    return true;
  }
  if (t.id === 'bulk-due') {
    hubState.inputs.due = t.value;
    return true;
  }
  if (t.id === 'hub-group') {
    state.log = undefined;
    hubState.viewOpen = false;
    document.querySelector('.hub-viewmenu')?.removeAttribute('open');
    hubState.groupBy = t.value as GroupBy;
    hubState.limits.clear();
    hubState.toggled.clear();
    refreshBody();
    return true;
  }
  if (t.id === 'hub-showdone') {
    state.log = undefined;
    hubState.filters.hideDone = !(t as HTMLInputElement).checked;
    render();
    return true;
  }
  if (t.id === 'hub-detailed') {
    hubState.detailed = (t as HTMLInputElement).checked;
    try {
      localStorage.setItem('plainfile-detailed-rows', hubState.detailed ? '1' : '0');
    } catch {
      /* a remembered choice is a convenience */
    }
    render();
    return true;
  }
  return false;
}
