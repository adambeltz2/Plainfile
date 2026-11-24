import { fmtDate, localDateOf } from '../src/dates';
import { listProjects } from '../src/projects';
import { filtersForView, newFilters, portfolio, type QuickView } from '../src/hub';
import { ALL_PROJECTS } from '../src/projects';
import * as hub from './hub';
import { openTemplate } from './newmenu';
import { render, state, today } from './store';
import * as todayScreen from './today';
import { openTaskRow, toggleTask } from './tasks';
import { esc } from './util';

/** The Projects screen: every project as a card, and for one project a dashboard of everything that belongs to it. */
export const projectState = { path: '', view: 'cards' as 'cards' | 'table', sort: 'number' as string, desc: false };

// When closing out or reopening moves the project's folder, keep showing the project at its new place.
hub.hubHooks.moved = (newPath) => {
  projectState.path = newPath;
};

export function openProject(path: string): void {
  projectState.path = path;
  state.screen = 'projects';
  state.log = undefined;
  state.modal = undefined;
  render();
}

/** The Tasks screen: every task from every project, opened on a quick view (Today unless asked for another). */
export function openTasks(view: QuickView = 'today'): void {
  hub.resetFor(ALL_PROJECTS);
  hub.hubState.filters = filtersForView(newFilters(), view);
  hub.hubState.tab = 'tasks';
  hub.hubState.groupBy = 'due';
  hub.hubState.limits.clear();
  openProject(ALL_PROJECTS);
}

function portfolioTable(idx: NonNullable<typeof state.index>): string {
  const rows = portfolio(idx, today());
  const key: Record<string, (r: (typeof rows)[number]) => string | number> = {
    number: (r) => r.project.number ?? 999,
    project: (r) => r.project.title.toLowerCase(),
    progress: (r) => (r.total ? r.done / r.total : 0),
    open: (r) => r.open,
    overdue: (r) => r.overdue,
    next: (r) => r.nextDue ?? '9999',
    changed: (r) => r.lastChange,
  };
  const k = key[projectState.sort] ?? key.number!;
  rows.sort((a, b) => {
    const x = k(a);
    const y = k(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return projectState.desc ? -c : c;
  });
  const th = (id: string, label: string): string =>
    `<th aria-sort="${projectState.sort === id ? (projectState.desc ? 'descending' : 'ascending') : 'none'}"><button class="plain-btn" data-port-sort="${id}">${label}${projectState.sort === id ? (projectState.desc ? ' ▾' : ' ▴') : ''}</button></th>`;
  return (
    '<div class="table-wrap"><table class="portfolio"><thead><tr>' +
    th('number', '#') +
    th('project', 'Project') +
    th('progress', 'Progress') +
    th('open', 'Open') +
    th('overdue', 'Overdue') +
    th('next', 'Next due') +
    th('changed', 'Last change') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (r) =>
          `<tr class="${r.project.active ? '' : 'off'}"><td>${r.project.parent ? '↳' : (r.project.number ?? '–')}</td><td><button class="link" data-open-project="${esc(r.project.path)}"><b>${esc(r.project.title)}</b></button>${r.project.active ? '' : ' <span class="chip quiet">inactive</span>'}</td>` +
          `<td><div class="prog" style="width:90px"><i style="width:${r.total ? Math.round((r.done / r.total) * 100) : 0}%"></i></div><span class="small muted">${r.done}/${r.total}</span></td><td>${r.open}</td><td>${r.overdue ? `<span class="chip late">${r.overdue}</span>` : '0'}</td><td>${r.nextDue ? esc(fmtDate(r.nextDue)) : '<span class="muted">–</span>'}</td><td>${r.lastChange ? esc(localDateOf(r.lastChange) === today() ? 'today' : fmtDate(localDateOf(r.lastChange))) : '–'}</td></tr>`,
      )
      .join('') +
    '</tbody></table></div>'
  );
}

function overview(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = listProjects(idx);
  let h = '<h2 class="title">Projects</h2>';
  h += `<p class="meta">${all.filter((p) => p.active).length} active · pick one to see its tasks, notes, people and follow-ups in one place</p>`;
  h +=
    '<div class="row-gap" style="margin:0 0 12px"><button class="btn primary" data-act="proj-new">+ New project</button><button class="btn" data-open-project="*">All tasks</button></div>';
  if (!all.length) {
    return `${h}<div class="empty">No projects yet. Make one with <b>+ New project</b>. A project is a folder with an <code>index.md</code> (<code>type: project</code>), or any note with <code>active</code> or <code>sortOrder</code> in its frontmatter.</div>`;
  }
  const toggle = `<div class="row-gap" style="margin:0 0 12px"><button class="btn small" data-port-view="cards" aria-pressed="${projectState.view === 'cards'}">Cards</button><button class="btn small" data-port-view="table" aria-pressed="${projectState.view === 'table'}">Table</button></div>`;
  if (projectState.view === 'table') return `${h}${toggle}${portfolioTable(idx)}`;
  h += toggle;
  const card = (p: (typeof all)[number]): string =>
    `<li class="pcard${p.active ? '' : ' off'}"><button class="pbtn" data-open-project="${esc(p.path)}">` +
    `<span class="pnum" aria-hidden="true">${p.parent ? '↳' : (p.number ?? '–')}</span><span class="ptitle">${esc(p.title)}</span><span class="pprev">${esc(p.preview) || '&nbsp;'}</span>` +
    `<span class="chips"><span class="chip">${p.openTasks} open task${p.openTasks === 1 ? '' : 's'}</span>${p.followups ? `<span class="chip">${p.followups} follow-up${p.followups === 1 ? '' : 's'}</span>` : ''}${p.active ? '' : '<span class="chip quiet">inactive</span>'}</span></button>` +
    `<div class="pacts"><button class="btn small" data-open-project="${esc(p.path)}">Dashboard</button><button class="btn small" data-act="proj-task" data-path="${esc(p.path)}">+ Task</button><button class="btn small" data-act="proj-note" data-path="${esc(p.path)}">+ Note</button></div></li>`;
  const live = all.filter((p) => p.active);
  const archived = all.filter((p) => !p.active);
  return `${h}<ul class="pgrid">${live.map(card).join('')}</ul>${archived.length ? `<h3 class="muted" style="margin:18px 0 8px">Archived <span class="n">${archived.length}</span></h3><ul class="pgrid">${archived.map(card).join('')}</ul>` : ''}`;
}

export function html(): string {
  return `<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main projects-main">${projectState.path ? hub.html(projectState.path) : overview()}</section></div>`;
}

export async function click(target: HTMLElement): Promise<boolean> {
  if (projectState.path && (await hub.click(target))) return true;
  const p = target.closest<HTMLElement>('[data-open-project]')?.dataset.openProject;
  if (p) {
    openProject(p);
    return true;
  }
  const pv = target.closest<HTMLElement>('[data-port-view]')?.dataset.portView;
  if (pv) {
    projectState.view = pv === 'table' ? 'table' : 'cards';
    render();
    return true;
  }
  const ps = target.closest<HTMLElement>('[data-port-sort]')?.dataset.portSort;
  if (ps) {
    projectState.desc = projectState.sort === ps ? !projectState.desc : false;
    projectState.sort = ps;
    render();
    return true;
  }
  // Reschedule buttons in the selected task's panel.
  if (target.closest('[data-resched]')) return todayScreen.click(target);
  const tg = target.closest<HTMLElement>('[data-toggle]')?.dataset.toggle;
  if (tg) {
    await toggleTask(tg);
    return true;
  }
  // In a task list: the title opens its note; anywhere else on the row (the date, a blank part) selects it, which shows its panel
  // with the lines in its file and Reschedule. In select mode the boxes are for choosing.
  if (projectState.path && !hub.hubState.selectMode) {
    const row = target.closest<HTMLElement>('li.task[data-id]');
    if (row?.dataset.id && !target.closest('button, input, select, a, label')) {
      if (target.closest('.t')) return openTaskRow(target);
      await todayScreen.select(row.dataset.id);
      return true;
    }
    if (await openTaskRow(target)) return true;
  }
  const act = target.closest<HTMLElement>('[data-act]');
  switch (act?.dataset.act) {
    case 'proj-back':
      projectState.path = '';
      state.log = undefined;
      render();
      return true;
    case 'proj-new':
      openTemplate('Project');
      return true;
    case 'proj-meeting': {
      openTemplate('Meeting');
      const m = state.modal;
      if (m?.step === 'template') {
        m.values.project = act.dataset.name ?? '';
        render();
      }
      return true;
    }
  }
  return false;
}

export const input = (e: Event): boolean => hub.input(e);

export function change(e: Event): boolean {
  const t = e.target as HTMLSelectElement;
  if (t.id === 'hub-pick') {
    openProject(t.value);
    return true;
  }
  return hub.change(e);
}
