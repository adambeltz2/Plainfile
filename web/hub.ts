import { fmtDate, localDateOf } from '../src/dates';
import { applyBulk, planBulk, type BulkAction, type BulkPlan } from '../src/bulk';
import { applyFieldFix, fieldIssues, STATUSES, type FieldIssue, type Status } from '../src/fields';
import { applyFilters, groupTasks, hubTasks, newFilters, summarize, type Filters, type GroupBy, type HubTask } from '../src/hub';
import { dirname } from '../src/index';
import { ALL_PROJECTS, listProjects, projectDashboard, projectNotes, type ProjectDashboard } from '../src/projects';
import { addDays } from '../src/query';
import { deleteView, listViews, saveView, type SavedView } from '../src/views';
import { setTaskStatus } from '../src/writeback';
import { errorMessage, justDone, render, rescan, state, today, writeFailure } from './store';
import { openNote } from './notes';
import { logHtml, row } from './tasks';
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
  tidy: false,
  /** The "more filters" drawer stays open while you pick several. */
  facetsOpen: false,
  /** The Filter & group drawer on a phone, and whether row tick boxes are showing there. */
  toolsOpen: false,
  statusOpen: false,
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
  views: [] as SavedView[],
  viewName: '',
};

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
  Object.assign(hubState, { project: path, filters: newFilters(), toggled: new Set<string>(), limits: new Map<string, number>(), tidy: false, facetsOpen: false, toolsOpen: false, statusOpen: false, selectMode: false, selected: new Set<string>(), preview: undefined, last: undefined, error: '' });
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
  const chip = (kind: string, value: string, label: string): string => `<span class="chip fchip">${esc(label)}<button class="plain-btn x" data-hub-filter="${kind}:${esc(value)}" aria-label="Remove filter ${esc(label)}">×</button></span>`;
  const out: string[] = [];
  for (const p of f.people) out.push(chip('people', p, `@${p}`));
  for (const g of f.tags) out.push(chip('tags', g, `#${g}`));
  for (const s of f.statuses) out.push(chip('statuses', s, s));
  for (const p of f.phases) out.push(chip('phases', p, p || 'No phase'));
  if (f.due) out.push(`<span class="chip fchip">${f.due === 'overdue' ? 'Overdue' : f.due === 'week' ? 'Due this week' : 'No date'}<button class="plain-btn x" data-hub-due="${f.due}" aria-label="Remove date filter">×</button></span>`);
  return out.length ? `<div class="chips hub-active">${out.join('')}<button class="btn small" data-hub-clear>Clear all</button></div>` : '';
}

function toolbar(all: HubTask[]): string {
  const f = hubState.filters;
  const facet = (title: string, kind: string, items: [string, string, number][], on: string[]): string =>
    items.length ? `<div class="hub-facet"><h4>${title}</h4><div class="chips">${items.map(([v, l, n]) => `<button class="chip${on.includes(v) ? ' on' : ''}" data-hub-filter="${kind}:${esc(v)}" aria-pressed="${on.includes(v)}">${esc(l)} <span class="muted">${n}</span></button>`).join('')}</div></div>` : '';
  const count = (xs: string[]): [string, number][] => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const people = count(all.flatMap((t) => t.people)).map(([v, n]): [string, string, number] => [v, `@${v}`, n]);
  const tags = count(all.flatMap((t) => t.tags)).map(([v, n]): [string, string, number] => [v, `#${v}`, n]);
  const phases = count(all.map((t) => t.phase ?? '')).map(([v, n]): [string, string, number] => [v, v || 'No phase', n]);
  const statuses = count(all.map((t) => t.status)).map(([v, n]): [string, string, number] => [v, v, n]);
  const quick = (k: 'overdue' | 'week' | 'none', l: string): string => `<button class="chip${f.due === k ? ' on' : ''}" data-hub-due="${k}" aria-pressed="${f.due === k}">${l}</button>`;
  const narrow = isNarrow();
  const active = f.people.length + f.tags.length + f.statuses.length + f.phases.length + (f.due ? 1 : 0);
  return (
    `<input id="hub-q" class="inp hub-q" type="search" autocomplete="off" spellcheck="false" placeholder="Filter this project…" aria-label="Filter tasks in this project" value="${esc(f.text)}">` +
    `<details class="hub-tools"${!narrow || hubState.toolsOpen ? ' open' : ''}><summary class="small">Filter &amp; group${active ? ` · ${active} on` : ''}</summary>` +
    '<div class="hub-bar">' +
    `<label class="hub-sel"><span class="small muted">View</span><select id="hub-views" class="inp" aria-label="Saved views"><option value="">${hubState.views.length ? 'Saved views…' : 'No saved views'}</option>${hubState.views.map((v) => `<option value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}${hubState.views.length ? '<option value="__delete">Delete a view…</option>' : ''}</select></label>` +
    (hubState.tab !== 'tasks' ? '' : `<label class="hub-sel"><span class="small muted">Group by</span><select id="hub-group" class="inp">${GROUPS.map(([v, l]) => `<option value="${v}"${v === hubState.groupBy ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
    `<label class="check small"><input type="checkbox" id="hub-hidedone"${f.hideDone ? ' checked' : ''}> Hide done</label>`) +
    (hubState.tab === 'tasks' ? `<button class="btn small" data-hub-selectmode aria-pressed="${hubState.selectMode}">${hubState.selectMode ? 'Stop selecting' : 'Select tasks'}</button><button class="btn small" data-hub-selectall title="Select every task that matches the filters">Select all shown</button>` : '') +
    '</div>' +
    `<div class="chips hub-quick">${quick('overdue', 'Overdue')}${quick('week', 'Due this week')}${quick('none', 'No date')}<form class="hub-saveview" data-hub-saveview><input id="hub-view-name" class="inp" autocomplete="off" placeholder="Name this view" aria-label="Name for this view" value="${esc(hubState.viewName)}"><button class="btn small" type="submit">Save view</button></form></div>` +
    `<details class="hub-facets"${hubState.facetsOpen || f.people.length || f.tags.length || f.phases.length || f.statuses.length ? ' open' : ''}><summary class="small">More filters: people, tags, phases, status</summary>${facet('People', 'people', people, f.people)}${facet('Tags', 'tags', tags, f.tags)}${facet('Phases', 'phases', phases, f.phases)}${facet('Status', 'statuses', statuses, f.statuses)}</details>` +
    '</details>' +
    activeChips()
  );
}

function groupsHtml(visible: HubTask[]): string {
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
        h += `<ul class="tasks">${g.items.slice(0, limit).map((t) => row(t.item, { on: hubState.selected.has(t.item.id) })).join('')}</ul>`;
        if (g.items.length > limit) h += `<button class="btn small" data-hub-more="${esc(key)}">Show ${Math.min(PAGE, g.items.length - limit)} more of ${g.items.length - limit}</button>`;
      }
      return `${h}</section>`;
    })
    .join('');
}

function bulkHtml(): string {
  const n = hubState.selected.size;
  const p = hubState.preview;
  let h = '';
  if (hubState.last && !p) h += `<div class="notice ok small" role="status">${esc(hubState.last.label)} <button class="btn small" data-hub-undo>Undo</button></div>`;
  if (hubState.error) h += `<div class="notice err small">${esc(hubState.error)}</div>`;
  if (p) {
    const e = p.plan.edits;
    h += `<div class="hub-preview card" role="dialog" aria-label="Review the change"><b>${esc(p.label)}</b><p class="small muted" style="margin:2px 0 6px">${e.length ? `${e.length} note${e.length === 1 ? '' : 's'} will change. Nothing is written until you press Apply.` : 'Nothing would change.'}${p.plan.skipped ? ` ${p.plan.skipped} selected task${p.plan.skipped === 1 ? '' : 's'} cannot take this change and ${p.plan.skipped === 1 ? 'is' : 'are'} left alone.` : ''}</p>` +
      `<ul class="plain small">${e.slice(0, 8).map((x) => `<li><div class="mono muted">${esc(x.path)}:${x.line}</div><div class="diff"><div class="del"><span class="sg">−</span><span>${esc(x.was) || ' '}</span></div><div class="add"><span class="sg">+</span><span>${esc(x.now) || ' '}</span></div></div></li>`).join('')}${e.length > 8 ? `<li class="muted">and ${e.length - 8} more notes</li>` : ''}</ul>` +
      `<div class="row-gap"><button class="btn primary" data-hub-apply${e.length ? '' : ' disabled'}>Apply</button><button class="btn" data-hub-cancel>Cancel</button></div></div>`;
  }
  if (n && !p) {
    const i = hubState.inputs;
    h += `<div class="hub-bulk" role="toolbar" aria-label="Change the selected tasks"><b>${n} selected</b>` +
      '<button class="btn small" data-hub-bulk="done">Done</button><button class="btn small" data-hub-bulk="reopen">Reopen</button>' +
      `<select id="bulk-status" class="inp" aria-label="Status">${STATUSES.map((s) => `<option${s === i.status ? ' selected' : ''}>${s}</option>`).join('')}</select><button class="btn small" data-hub-bulk="status">Set status</button>` +
      `<input id="bulk-due" class="inp date" type="date" aria-label="Due date" value="${esc(i.due)}"><button class="btn small" data-hub-bulk="due">Set due</button><button class="btn small" data-hub-bulk="nodue">Clear due</button>` +
      `<input id="bulk-person" class="inp" autocomplete="off" data-suggest="people" placeholder="@person" aria-label="Person" value="${esc(i.person)}"><button class="btn small" data-hub-bulk="person">Assign</button>` +
      `<input id="bulk-tag" class="inp" autocomplete="off" data-suggest="tags" placeholder="#tag" aria-label="Tag" value="${esc(i.tag)}"><button class="btn small" data-hub-bulk="tag">Tag</button>` +
      '<button class="btn small" data-hub-bulk-clear>Clear selection</button></div>';
  }
  return h;
}

function boardHtml(all: HubTask[]): string {
  const f = { ...hubState.filters, hideDone: false };
  const vis = applyFilters(all, f, justDone, today());
  return (
    '<div class="hub-cols">' +
    COLS.map(([key, label], ci) => {
      const cards = vis.filter((t) => t.status === key).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.item.title.localeCompare(b.item.title));
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
              `<div class="hub-move">${file && prev ? `<button class="btn small" data-hub-move="${esc(t.item.id)}|${prev}" aria-label="Move to ${prev}">←</button>` : ''}<button class="btn small" data-open="${esc(t.item.path)}" data-line="${t.item.line}">Open</button>${file && next ? `<button class="btn small" data-hub-move="${esc(t.item.id)}|${next}" aria-label="Move to ${next}">→</button>` : ''}${!file ? `<button class="cb" data-toggle="${esc(t.item.id)}" aria-pressed="${t.status === 'done'}" aria-label="${t.status === 'done' ? 'Mark not done' : 'Mark done'}: ${esc(t.item.title)}">${t.status === 'done' ? '✓' : ''}</button>` : ''}</div></div>`
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
  const bucket = (t: HubTask): number => (!t.due ? 9 : t.due < t0 ? 0 : t.due >= addDays(t0, 56) ? 10 : 1 + Math.floor((Date.parse(`${t.due}T00:00:00Z`) - Date.parse(`${t0}T00:00:00Z`)) / (7 * 86400000)));
  const phases = [...new Set(vis.map((t) => t.phase ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const heads = ['Overdue', ...weeks.map((w) => fmtDate(w).replace(/^\w+ /, '')), 'No date', 'Later'];
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let h = `<div class="hub-tl" style="grid-template-columns:7rem repeat(${heads.length}, minmax(5.5rem, 1fr))"><div class="h"></div>${heads.map((x) => `<div class="h">${esc(x)}</div>`).join('')}`;
  for (const p of phases) {
    h += `<div class="rowh">${esc(p || 'No phase')}</div>`;
    for (const b of order) {
      const cell = vis.filter((t) => (t.phase ?? '') === p && bucket(t) === b).sort((a, c) => (a.due ?? '').localeCompare(c.due ?? ''));
      h += `<div class="cell${b === 0 && cell.length ? ' late' : ''}">${cell.slice(0, 4).map((t) => `<button class="tlitem${t.status === 'done' ? ' done' : ''}" data-open="${esc(t.item.path)}" data-line="${t.item.line}" title="${esc(t.item.title)}${t.due ? ` · ${esc(fmtDate(t.due))}` : ''}">${esc(t.item.title)}</button>`).join('')}${cell.length > 4 ? `<span class="muted small">+${cell.length - 4} more</span>` : ''}</div>`;
    }
  }
  return `${h}</div>${phases.length ? '' : '<div class="empty">No tasks match.</div>'}`;
}

function tidyHtml(issues: FieldIssue[]): string {
  if (!issues.length) return '<p class="muted small">Everything in this project follows the standard fields.</p>';
  const fixable = issues.filter((i) => i.fix);
  return (
    `<p class="small muted" style="margin:0 0 6px">Your notes can be written any way. These would make them uniform. Each fix changes one line in one note, and nothing is changed until you press it.</p>` +
    (fixable.length ? `<div class="row-gap" style="margin:0 0 8px"><button class="btn small primary" data-hub-fixall>Fix all ${fixable.length}</button></div>` : '') +
    `<ul class="plain tidy">${issues
      .slice(0, 60)
      .map(
        (i) =>
          `<li><div><button class="link" data-open="${esc(i.path)}">${esc(i.title)}</button> <span class="muted small">${esc(i.message)}</span></div>${i.fix ? `<div class="mono small">${esc(i.fix.before)} → ${esc(i.fix.after)} <button class="btn small" data-hub-fix="${esc(i.id)}">Fix</button></div>` : ''}</li>`,
      )
      .join('')}${issues.length > 60 ? `<li class="muted">and ${issues.length - 60} more</li>` : ''}</ul>`
  );
}

function statusColumn(all: HubTask[], issues: FieldIssue[]): string {
  const s = summarize(all, today(), Date.now());
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const f = hubState.filters;
  const spark = Math.max(1, ...s.weekly);
  return (
    '<aside class="hub-status" aria-label="Project status">' +
    `<details class="hub-status-d"${isNarrow() && !hubState.statusOpen ? '' : ' open'}><summary class="small">Status: ${s.done} of ${s.total} done${s.overdue ? `, ${s.overdue} overdue` : ''}${issues.length ? `, ${issues.length} to tidy` : ''}</summary>` +
    `<h3>Progress</h3><div class="prog"><i style="width:${pct}%"></i></div><p class="small muted" style="margin:4px 0 8px">${s.done} of ${s.total} done${s.total ? ` (${pct}%)` : ''} · ${s.overdue} overdue</p>` +
    (s.phases.length
      ? `<h3>Phases</h3>${s.phases.map((p) => `<button class="hub-phase${f.phases.includes(p.name === 'No phase' ? '' : p.name) ? ' on' : ''}" data-hub-filter="phases:${esc(p.name === 'No phase' ? '' : p.name)}"><span>${esc(p.name)}</span><b>${p.done}/${p.total}</b><span class="prog"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></i></span></button>`).join('')}`
      : '') +
    (s.people.length ? `<h3>Who has what</h3><div class="chips">${s.people.slice(0, 10).map((p) => `<button class="chip mono${p.name && f.people.includes(p.name) ? ' on' : ''}" ${p.name ? `data-hub-filter="people:${esc(p.name)}"` : 'disabled'}>${p.name ? `@${esc(p.name)}` : 'nobody'} ${p.open}</button>`).join('')}</div>` : '') +
    (s.next.length ? `<h3>Next up</h3><ol class="small hub-next">${s.next.map((t) => `<li><button class="link" data-open="${esc(t.item.path)}" data-line="${t.item.line}">${esc(t.item.title)}</button>${t.due ? ` <span class="muted">${esc(fmtDate(t.due))}</span>` : ''}</li>`).join('')}</ol>` : '') +
    `<h3>Done per week <span class="muted" title="Worked out from when each note was last changed">(estimate)</span></h3><div class="spark" aria-label="Tasks finished in each of the last six weeks">${s.weekly.map((n, i) => `<i style="height:${Math.max(6, Math.round((n / spark) * 100))}%" title="${n} done"></i>`).join('')}</div>` +
    `<h3 style="margin-top:12px">Tidy <span class="n">${issues.length}</span></h3><button class="btn small" data-hub-tidy aria-expanded="${hubState.tidy}">${hubState.tidy ? 'Hide' : issues.length ? 'Review' : 'All uniform'}</button>${hubState.tidy ? `<div class="hub-tidy">${tidyHtml(issues)}</div>` : ''}` +
    '</details></aside>'
  );
}

function rail(path: string): string {
  const idx = state.index;
  if (!idx) return '';
  const all = listProjects(idx);
  const item = (p: (typeof all)[number]): string => `<button class="hub-rail-item${p.path === path ? ' on' : ''}" data-open-project="${esc(p.path)}" aria-current="${p.path === path}"><span>${p.number ?? '–'} ${esc(p.title)}</span><span class="n">${p.openTasks}</span></button>`;
  const allOpen = tasksOf(idx, ALL_PROJECTS).filter((t) => t.status !== 'done').length;
  const allBtn = `<button class="hub-rail-item${path === ALL_PROJECTS ? ' on' : ''}" data-open-project="${ALL_PROJECTS}" aria-current="${path === ALL_PROJECTS}"><span>All tasks</span><span class="n">${allOpen}</span></button>`;
  return `<nav class="hub-rail" aria-label="Projects"><h3>Projects</h3>${allBtn}${all.filter((p) => p.active).map(item).join('')}${all.some((p) => !p.active) ? `<h3 class="muted">Inactive</h3>${all.filter((p) => !p.active).map(item).join('')}` : ''}<button class="btn small" data-act="proj-back" style="margin-top:8px">All projects</button></nav>`;
}

export function html(path: string): string {
  const idx = state.index;
  const everything = path === ALL_PROJECTS;
  const d = idx ? (everything ? allDashboard(idx) : projectDashboard(idx, path, today(), justDone)) : undefined;
  if (!idx || !d) return '<div class="empty">That project is no longer there. <button class="btn" data-act="proj-back">All projects</button></div>';
  resetFor(path);
  const all = tasksOf(idx, path);
  const covered = projectNotes(idx, path);
  const issues = everything ? [] : fieldIssues(idx, covered); // a tidy list over every note is for a project, not for All
  const visible = applyFilters(all, hubState.filters, justDone, today());
  const dir = !d.note ? '' : d.note.name.toLowerCase() === 'index' ? dirname(d.note.path) : '';
  const name = !d.note ? '' : dir ? (dir.split('/').pop() as string) : d.note.name;
  const openCount = all.filter((t) => t.status !== 'done').length;
  const tabs: [Tab, string][] = [
    ['tasks', `Tasks ${openCount}`],
    ['board', 'Board'],
    ['timeline', 'Timeline'],
    ['notes', `Notes ${d.notes.length}`],
    ['activity', 'Activity'],
  ];
  let body = '';
  if (hubState.tab === 'tasks') body = `${toolbar(all)}<div id="hub-body">${groupsHtml(visible)}</div>`;
  else if (hubState.tab === 'board') body = `${toolbar(all)}<div id="hub-body">${boardHtml(all)}</div>`;
  else if (hubState.tab === 'timeline') body = `${toolbar(all)}<div id="hub-body" class="hub-scroll">${timelineHtml(all)}</div>`;
  else if (hubState.tab === 'notes')
    body = d.notes.length
      ? `<ul class="plain pnotes">${d.notes.slice(0, 80).map((n) => `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(fmtDate(localDateOf(n.mtime)))}</span>${n.type ? `<span class="chip">${esc(n.type)}</span>` : ''}<span class="chip src mono">${esc(n.path)}</span></span></button></li>`).join('')}</ul>${d.followups.length ? `<h3 class="grp">Follow-ups <span>${d.followups.length}</span></h3><ul class="tasks">${d.followups.map((f) => `<li class="task" tabindex="-1"><div class="body"><div class="t">${esc(f.title)}</div><div class="chips"><button class="chip src mono" data-open="${esc(f.path)}" data-line="${f.line}">${esc(f.from)} · line ${f.line}</button></div></div></li>`).join('')}</ul>` : ''}`
      : '<div class="empty">No notes yet. Add one with <b>+ Note</b> or <b>+ Meeting</b>.</div>';
  else {
    const recent = [...covered].sort((a, b) => b.mtime - a.mtime).slice(0, 30);
    body = `<p class="small muted">Taken from when each note was last changed.</p><ul class="plain pnotes">${recent.map((n) => `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(ago(n.mtime))}</span><span class="chip src mono">${esc(n.path)}</span></span></button></li>`).join('')}</ul>`;
  }
  const log = logHtml();
  return (
    `<div class="hubwrap${hubState.selectMode || hubState.selected.size ? ' sel-on' : ''}">${rail(path)}<div class="hub-main">` +
    `<label class="hub-pick small"><span class="muted">Project</span><select id="hub-pick" class="inp"><option value="${ALL_PROJECTS}"${everything ? ' selected' : ''}>All tasks</option>${listProjects(idx).map((p) => `<option value="${esc(p.path)}"${p.path === path ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select><button class="btn small" data-act="proj-back">All projects</button></label>` +
    `<div class="ed-head"><div style="min-width:0"><h2 class="title">${esc(d.title)}</h2><div class="meta">${d.active ? 'Active' : 'Inactive'}${d.created ? ` · started ${esc(fmtDate(d.created))}` : ''}${d.lastChange ? ` · last change ${esc(localDateOf(d.lastChange) === today() ? 'today' : fmtDate(localDateOf(d.lastChange)))}` : ''}</div></div>` +
    (everything ? '</div>' : `<div class="ed-actions"><button class="btn primary" data-act="proj-task" data-path="${esc(path)}">+ Task</button>` +
    `<span class="hub-wide-actions"><button class="btn" data-act="proj-note" data-path="${esc(path)}">+ Note</button><button class="btn" data-act="proj-meeting" data-name="${esc(name)}">+ Meeting</button><button class="btn" data-report-open="${esc(path)}">Report</button><button class="btn" data-open="${esc(path)}">Open note</button></span>` +
    `<details class="hub-more"><summary class="btn" aria-label="More: new note, new meeting, open the project note">⋯</summary><div class="hub-more-box"><button class="btn" data-act="proj-note" data-path="${esc(path)}">+ Note</button><button class="btn" data-act="proj-meeting" data-name="${esc(name)}">+ Meeting</button><button class="btn" data-report-open="${esc(path)}">Report</button><button class="btn" data-open="${esc(path)}">Open note</button></div></details></div></div>`) +
    (d.summary ? `<p class="psummary">${esc(d.summary)}</p>` : '') +
    `<div class="pstats"><div class="pstat"><b>${openCount}</b><span>open</span></div><div class="pstat${d.overdue ? ' late' : ''}"><b>${d.overdue}</b><span>overdue</span></div><div class="pstat"><b>${all.length - openCount}</b><span>done</span></div><div class="pstat"><b>${d.notes.length}</b><span>notes</span></div><div class="pstat"><b>${d.followups.length}</b><span>follow-ups</span></div></div>` +
    `<div class="pprog"><progress max="${Math.max(all.length, 1)}" value="${all.length - openCount}" aria-label="Tasks done"></progress><span class="small muted">${all.length - openCount} of ${all.length} tasks done${all.length ? ` (${Math.round(((all.length - openCount) / all.length) * 100)}%)` : ''}</span></div>` +
    `<div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" class="tab${hubState.tab === id ? ' on' : ''}" data-hub-tab="${id}" aria-selected="${hubState.tab === id}">${esc(l)}</button>`).join('')}</div>` +
    `<div class="hub-content">${hubState.tab === 'tasks' || hubState.tab === 'board' ? `<div id="hub-bulk">${bulkHtml()}</div>` : ''}${body}</div>${log ? `<div class="plog" aria-live="polite">${log}</div>` : ''}</div>${statusColumn(all, issues)}</div>`
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
  el.innerHTML = hubState.tab === 'board' ? boardHtml(all) : hubState.tab === 'timeline' ? timelineHtml(all) : groupsHtml(applyFilters(all, hubState.filters, justDone, today()));
}

function toggleFilter(kind: string, value: string): void {
  const f = hubState.filters;
  const list = f[kind as 'people' | 'tags' | 'statuses' | 'phases'] as string[] | undefined;
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
    done: [{ kind: 'done', done: true }, 'Mark done'],
    reopen: [{ kind: 'done', done: false }, 'Reopen'],
    status: [{ kind: 'status', status: i.status as Status }, `Set status to ${i.status}`],
    due: [{ kind: 'due', date: i.due || '' }, `Set due date to ${i.due}`],
    nodue: [{ kind: 'due', date: null }, 'Clear the due date'],
    person: [{ kind: 'person', name: i.person }, `Assign ${i.person.startsWith('@') ? i.person : `@${i.person}`}`],
    tag: [{ kind: 'tag', tag: i.tag }, `Add tag ${i.tag.startsWith('#') ? i.tag : `#${i.tag}`}`],
  };
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

async function move(id: string, status: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  try {
    state.log = await setTaskStatus(storage, index, id, status);
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    state.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const q = <T extends string>(attr: string): T | undefined => (target.closest(`[${attr}]`) as HTMLElement | null)?.getAttribute(attr) as T | undefined;
  const cardOpen = target.closest<HTMLElement>('[data-card-open]');
  if (cardOpen?.dataset.cardOpen && !target.closest('button')) {
    await openNote(cardOpen.dataset.cardOpen, { line: Number(cardOpen.dataset.line) });
    return true;
  }
  const toolsSum = target.closest<HTMLElement>('.hub-tools > summary');
  if (toolsSum) {
    hubState.toolsOpen = !(toolsSum.parentElement as HTMLDetailsElement).open;
    return false;
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
  const sum = target.closest<HTMLElement>('.hub-facets > summary');
  if (sum) {
    hubState.facetsOpen = !(sum.parentElement as HTMLDetailsElement).open; // the click is about to toggle it
    return false;
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
    hubState.tab = tab;
    render();
    return true;
  }
  const filter = q('data-hub-filter');
  if (filter) {
    const i = filter.indexOf(':');
    toggleFilter(filter.slice(0, i), filter.slice(i + 1));
    render();
    return true;
  }
  const due = q<'overdue' | 'week' | 'none'>('data-hub-due');
  if (due) {
    hubState.filters.due = hubState.filters.due === due ? undefined : due;
    render();
    return true;
  }
  if (target.closest('[data-hub-clear]')) {
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
  if (target.closest('[data-hub-tidy]')) {
    hubState.tidy = !hubState.tidy;
    render();
    return true;
  }
  const fix = q('data-hub-fix');
  const fixAll = target.closest('[data-hub-fixall]');
  if (fix || fixAll) {
    const { storage, index } = state;
    if (!storage || !index) return true;
    const issues = fieldIssues(index, projectNotes(index, hubState.project));
    const todo = fixAll ? issues.filter((i) => i.fix) : issues.filter((i) => i.id === fix);
    // Several fixes can touch one note, so each is worked out again from what is on disk when it is applied.
    for (const issue of todo) {
      try {
        const now = fieldIssues(index, projectNotes(index, hubState.project)).find((i) => i.id === issue.id);
        if (now) state.log = await applyFieldFix(storage, index, now);
      } catch (e) {
        state.log = { message: `Could not tidy ${issue.path}. ${errorMessage(e)}` };
        break;
      }
    }
    render();
    return true;
  }
  return false;
}

/** Read the saved views from the folder. Call when a project is opened. */
export async function loadViews(): Promise<void> {
  const { storage } = state;
  hubState.views = storage ? await listViews(storage).catch(() => []) : [];
}

/** Save the grouping and filters now showing under a name. */
export async function saveCurrentView(): Promise<void> {
  const { storage } = state;
  const name = hubState.viewName.trim();
  if (!storage || !name) return;
  try {
    await saveView(storage, { name, groupBy: hubState.groupBy, filters: structuredClone(hubState.filters) });
    hubState.viewName = '';
    await loadViews();
    hubState.error = '';
  } catch (e) {
    hubState.error = `Could not save the view. ${errorMessage(e)}`;
  }
  render();
}

function applyView(name: string): void {
  const v = hubState.views.find((x) => x.name === name);
  if (!v) return;
  hubState.groupBy = v.groupBy;
  hubState.filters = structuredClone(v.filters);
  hubState.toggled.clear();
  hubState.limits.clear();
  hubState.selected.clear();
  render();
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'hub-view-name') {
    hubState.viewName = t.value;
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
  if (t.id === 'hub-views') {
    const v = t.value;
    if (v === '__delete') {
      const name = window.prompt('Delete which saved view? Type its name.', hubState.views[0]?.name ?? '');
      const found = hubState.views.find((x) => x.name.toLowerCase() === (name ?? '').trim().toLowerCase());
      if (found && state.storage) void deleteView(state.storage, found.name).then(loadViews).then(render);
      else render();
    } else if (v) applyView(v);
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
    hubState.groupBy = t.value as GroupBy;
    hubState.limits.clear();
    hubState.toggled.clear();
    refreshBody();
    return true;
  }
  if (t.id === 'hub-hidedone') {
    hubState.filters.hideDone = (t as HTMLInputElement).checked;
    refreshBody();
    return true;
  }
  return false;
}
