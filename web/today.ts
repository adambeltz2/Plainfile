import { fmtDate, fmtDateLong } from '../src/dates';
import { dirname, type TaskItem } from '../src/index';
import { listFollowUps, listProjects } from '../src/projects';
import { addDays, todayView } from '../src/query';
import { loadContext, justDone, planQuickLine, quickAddLine, render, state, today, type TodayViewId } from './store';
import { logHtml, row, toggleTask } from './tasks';
import { esc } from './util';

export const quick = { text: '', error: '' };

/**
 * The one-line quick add used on Home and on the Tasks tab: the form (with a Quick note button), a live preview of
 * how the line will be filed, and the last error. Home puts the form beside the date, so the parts come separately.
 */
export function quickBar(cls = '', compact = false): { form: string; below: string } {
  return {
    form: `<form class="quick ${cls}" data-quick><label class="sr" for="quick-text">Add a task</label><input id="quick-text" class="inp" type="text" autocomplete="off" data-suggest="line" placeholder="Quick add: Call Dana +Website @dana #launch due:friday" value="${esc(quick.text)}"><button class="btn primary" type="submit">Add</button><button class="btn" type="button" data-quick-note>Quick note</button></form>`,
    below: `<div id="quick-preview" class="qprev small muted" aria-live="polite">${compact && !quick.text.trim() ? '' : quickPreview(quick.text)}</div>${quick.error ? `<div class="notice err small">${esc(quick.error)}</div>` : ''}`,
  };
}

/** One line under the box saying how the typed text will be filed: where it goes, who, what tags, which day. */
export function quickPreview(line: string): string {
  if (!line.trim())
    return '<span class="qhint">One line is enough: <code>Email Sam +Project @sam #tag due:tomorrow</code>. It becomes a task note, shown in your Inbox (or filed in the project), dated today.</span>';
  const { parsed, project, error } = planQuickLine(line);
  if (error) return `<span class="err-text">${esc(error)}</span>`;
  const bits = [`Task note "${esc(parsed.title || parsed.text)}" in <b>${esc(project ? project.title : 'Inbox')}</b>`];
  if (parsed.due) bits.push(`due <b>${esc(fmtDate(parsed.due))}</b>`);
  if (parsed.people.length) bits.push(`with ${parsed.people.map((p) => `<b>@${esc(p)}</b>`).join(' ')}`);
  if (parsed.tags.length) bits.push(`tagged ${parsed.tags.map((x) => `<b>#${esc(x)}</b>`).join(' ')}`);
  return bits.join(' · ');
}

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
const byDue = (a: TaskItem, b: TaskItem): number => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.path.localeCompare(b.path) || a.line - b.line;

interface Group {
  title: string;
  late?: boolean;
  items: TaskItem[];
}

/** The Inbox: lines in inbox/ and task notes that are not filed in a project (tasks/ at the top level). */
const inInbox = (t: TaskItem): boolean => t.path.startsWith('inbox/') || (t.kind === 'file' && /^tasks\//.test(t.path));

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
      gs = [{ title: 'Inbox', items: open.filter(inInbox).sort(byDue) }];
      break;
    case 'waiting':
      gs = [{ title: 'Waiting on', items: open.filter((t) => t.status === 'waiting' || t.tags.includes('waiting')).sort(byDue) }];
      break;
    default:
      gs = [
        ...dated,
        { title: 'Later', items: open.filter((t) => t.due && t.due > week).sort(byDue) },
        { title: 'No date', items: open.filter((t) => !t.due).sort(byDue) },
      ];
  }
  return gs.filter((g) => g.items.length);
}

function count(view: TodayViewId, tasks: TaskItem[]): number {
  if (view === 'followups') return state.index ? listFollowUps(state.index).length : 0;
  if (view === 'projects') return state.index ? listProjects(state.index).filter((p) => p.active).length : 0;
  return groupsFor(
    view,
    tasks.filter((t) => !t.done),
  ).reduce((n, g) => n + g.items.length, 0);
}

/* ---------- rendering ---------- */

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
  h += logHtml();
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
    `${p.followups ? `<span class="chip">${p.followups} follow-up${p.followups === 1 ? '' : 's'}</span>` : ''}</span></button>` +
    `<div class="pacts"><button class="btn small" data-open-project="${esc(p.path)}">Dashboard</button><button class="btn small" data-act="proj-task" data-path="${esc(p.path)}">+ Task</button><button class="btn small" data-act="proj-note" data-path="${esc(p.path)}">+ Note</button></div></li>`;
  let h = `<p class="meta">${active.length} active project${active.length === 1 ? '' : 's'}, numbered in sort order</p>`;
  if (!all.length) {
    return `${h}<div class="empty">No projects yet. Make one with <b>+ New</b> then <b>Project</b>. A project is a note with <code>active: true</code> or <code>sortOrder: 1</code> in its frontmatter, or <code>type: project</code>. Active projects are numbered in sort order. A folder's <code>index.md</code> covers every note in that folder.</div>`;
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
    for (const [g, n] of tags)
      h += `<li><button class="item mono" data-tag="${esc(g)}" aria-current="${state.tag === g}">#${esc(g)} <span class="n">${n}</span></button></li>`;
    h += '</ul></div>';
  }
  h += `<div class="stat">${idx.notes.size} notes<br>scanned in ${state.scanMs} ms${idx.fromCache ? ` (${idx.fromCache} from the saved copy)` : ''}${state.demo ? '<br>sample date 21 Nov 2026' : ''}</div></aside>`;

  const label = VIEWS.find((v) => v.id === state.view)?.label ?? 'Today';
  h += '<section class="main">';
  h +=
    `<form class="quick" data-quick><label class="sr" for="quick-text">Add a task</label>` +
    `<input id="quick-text" class="inp" type="text" autocomplete="off" data-suggest="line" placeholder="Call Dana +Website @dana #launch due:friday" value="${esc(quick.text)}">` +
    `<button class="btn primary" type="submit">Add</button>` +
    `<div id="quick-preview" class="qprev small muted" aria-live="polite">${quickPreview(quick.text)}</div></form>`;
  if (quick.error) h += `<div class="notice err small">${esc(quick.error)}</div>`;
  h += `<h2 class="title">${esc(label)}</h2>`;
  if (state.view === 'followups') h += followupsHtml();
  else if (state.view === 'projects') h += projectsHtml();
  else {
    h += `<p class="meta">${esc(fmtDateLong(today()))} · ${shown} ${state.view === 'today' ? 'need attention' : shown === 1 ? 'task' : 'tasks'}</p>`;
    if (state.tag)
      h += `<div class="filter"><span class="chip mono">#${esc(state.tag)}</span><button class="btn small" data-act="clear-tag">Clear filter</button></div>`;
    if (!shown) {
      h +=
        state.view === 'today'
          ? '<div class="empty">Nothing is due. Tasks with a due date appear here. Add one above, or in any note, like <code>- [ ] Call Dana due:2026-11-24</code>.</div>'
          : '<div class="empty">No tasks here yet.</div>';
    }
    for (const g of gs) {
      h += `<div class="grp${g.late ? ' late' : ''}">${esc(g.title)} <span>${g.items.length}</span></div><ul class="tasks">${g.items.map((t) => row(t)).join('')}</ul>`;
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

/**
 * Add the typed line as a task. The box is emptied the moment you press Enter, so the next line can be typed while
 * the save finishes (it used to be cleared afterwards, which could wipe a line typed in the meantime). If the save
 * fails, the line is put back, unless you have already started typing something else.
 */
export async function submitQuick(): Promise<void> {
  const line = quick.text;
  if (!line.trim()) return;
  const due = planQuickLine(line).parsed.due;
  quick.text = '';
  const box = document.getElementById('quick-text') as HTMLInputElement | null;
  if (box) box.value = '';
  const prev = document.getElementById('quick-preview');
  if (prev) prev.innerHTML = quickPreview('');
  const err = await quickAddLine(line);
  quick.error = err ?? '';
  if (err) {
    if (!quick.text) quick.text = line;
  } else {
    // Show the new task: in Today if it is due within the week, otherwise in the Inbox.
    state.view = due && due <= addDays(today(), 7) ? 'today' : state.view === 'all' ? 'all' : 'inbox';
    if (state.selected) await loadContext(state.selected).catch(() => undefined);
  }
  render();
  if (!err) document.getElementById('quick-text')?.focus();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const tg = target.closest<HTMLElement>('[data-toggle]');
  if (tg?.dataset.toggle) {
    await toggleTask(tg.dataset.toggle);
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
    const prev = document.getElementById('quick-preview');
    if (prev) prev.innerHTML = quickPreview(t.value);
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
