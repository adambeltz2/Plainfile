import { fmtDate, localDateOf } from '../src/dates';
import { dirname } from '../src/index';
import { listProjects, projectDashboard } from '../src/projects';
import { openTemplate } from './newmenu';
import { render, justDone, state, today } from './store';
import { logHtml, row, toggleTask } from './tasks';
import { esc } from './util';

/** The Projects screen: every project as a card, and for one project a dashboard of everything that belongs to it. */
export const projectState = { path: '' };

export function openProject(path: string): void {
  projectState.path = path;
  state.screen = 'projects';
  state.log = undefined;
  state.modal = undefined;
  render();
}

function overview(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = listProjects(idx);
  let h = '<h2 class="title">Projects</h2>';
  h += `<p class="meta">${all.filter((p) => p.active).length} active · pick one to see its tasks, notes, people and follow-ups in one place</p>`;
  h += '<div class="row-gap" style="margin:0 0 12px"><button class="btn primary" data-act="proj-new">+ New project</button></div>';
  if (!all.length) {
    return `${h}<div class="empty">No projects yet. Make one with <b>+ New project</b>. A project is a folder with an <code>index.md</code> (<code>type: project</code>), or any note with <code>active</code> or <code>sortOrder</code> in its frontmatter.</div>`;
  }
  const card = (p: (typeof all)[number]): string =>
    `<li class="pcard${p.active ? '' : ' off'}"><button class="pbtn" data-open-project="${esc(p.path)}">` +
    `<span class="pnum" aria-hidden="true">${p.number ?? '–'}</span><span class="ptitle">${esc(p.title)}</span><span class="pprev">${esc(p.preview) || '&nbsp;'}</span>` +
    `<span class="chips"><span class="chip">${p.openTasks} open task${p.openTasks === 1 ? '' : 's'}</span>${p.followups ? `<span class="chip">${p.followups} follow-up${p.followups === 1 ? '' : 's'}</span>` : ''}${p.active ? '' : '<span class="chip quiet">inactive</span>'}</span></button></li>`;
  return `${h}<ul class="pgrid">${all.map(card).join('')}</ul>`;
}

function section(title: string, count: number | string, body: string): string {
  return `<section class="psec"><h3>${esc(title)} <span class="n">${count}</span></h3>${body}</section>`;
}

function dashboard(path: string): string {
  const idx = state.index;
  const d = idx ? projectDashboard(idx, path, today(), justDone) : undefined;
  if (!d) return `<div class="empty">That project is no longer there. <button class="btn" data-act="proj-back">All projects</button></div>`;
  const dir = d.note.name.toLowerCase() === 'index' ? dirname(d.note.path) : '';
  const name = dir ? (dir.split('/').pop() as string) : d.note.name;
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
  const t = today();
  const late = d.open.filter((x) => !x.done && x.due && x.due < t);
  const dated = d.open.filter((x) => x.done || (x.due && x.due >= t));
  const undated = d.open.filter((x) => !x.done && !x.due);
  const group = (label: string, list: typeof d.open, cls = ''): string =>
    list.length ? `<div class="grp${cls}">${esc(label)} <span>${list.length}</span></div><ul class="tasks">${list.map(row).join('')}</ul>` : '';

  let h = `<div class="row-gap" style="margin:0 0 8px"><button class="btn" data-act="proj-back">← All projects</button></div>`;
  h += `<div class="ed-head"><div style="min-width:0"><h2 class="title">${esc(d.title)}</h2>` +
    `<div class="meta">${d.active ? 'Active' : 'Inactive'}${d.created ? ` · started ${esc(fmtDate(d.created))}` : ''}${d.lastChange ? ` · last change ${esc(localDateOf(d.lastChange) === t ? 'today' : fmtDate(localDateOf(d.lastChange)))}` : ''}</div></div>` +
    `<div class="ed-actions"><button class="btn primary" data-act="proj-task" data-path="${esc(path)}">+ Task</button><button class="btn" data-act="proj-note" data-path="${esc(path)}">+ Note</button>` +
    `<button class="btn" data-act="proj-meeting" data-name="${esc(name)}">+ Meeting</button><button class="btn" data-open="${esc(path)}">Open note</button></div></div>`;
  if (d.summary) h += `<p class="psummary">${esc(d.summary)}</p>`;
  h += `<div class="pstats"><div class="pstat"><b>${d.open.filter((x) => !x.done).length}</b><span>open</span></div><div class="pstat${d.overdue ? ' late' : ''}"><b>${d.overdue}</b><span>overdue</span></div>` +
    `<div class="pstat"><b>${d.done}</b><span>done</span></div><div class="pstat"><b>${d.notes.length}</b><span>notes</span></div><div class="pstat"><b>${d.followups.length}</b><span>follow-ups</span></div></div>`;
  h += `<div class="pprog"><progress max="${Math.max(d.total, 1)}" value="${d.done}" aria-label="Tasks done"></progress><span class="small muted">${d.done} of ${d.total} tasks done${d.total ? ` (${pct}%)` : ''}</span></div>`;

  const tasks = group('Overdue', late, ' late') + group('Coming up', dated) + group('No date', undated);
  h += '<div class="pcols"><div>' + section('Open tasks', d.open.filter((x) => !x.done).length, tasks || '<p class="muted small">Nothing open. Add a task with <b>+ Task</b>, or type <code>+' + esc(name) + '</code> in the quick add on Today.</p>');
  if (d.followups.length) {
    h += section('Follow-ups', d.followups.length, `<ul class="tasks">${d.followups.map((f) => `<li class="task" tabindex="-1"><div class="body"><div class="t">${esc(f.title)}</div><div class="chips"><button class="chip src mono" data-open="${esc(f.path)}" data-line="${f.line}">${esc(f.from)} · line ${f.line}</button></div></div></li>`).join('')}</ul>`);
  }
  h += '</div><div>';
  h += section(
    'Notes',
    d.notes.length,
    d.notes.length
      ? `<ul class="plain pnotes">${d.notes.slice(0, 40).map((n) => `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(fmtDate(localDateOf(n.mtime)))}</span>${n.type ? `<span class="chip">${esc(n.type)}</span>` : ''}<span class="chip src mono">${esc(n.path)}</span></span></button></li>`).join('')}</ul>${d.notes.length > 40 ? `<p class="muted small">and ${d.notes.length - 40} more. Open the folder in Notes.</p>` : ''}`
      : '<p class="muted small">No notes yet. Add one with <b>+ Note</b> or <b>+ Meeting</b>.</p>',
  );
  if (d.people.length) {
    h += section('People', d.people.length, `<div class="chips">${d.people.slice(0, 20).map((p) => `<button class="chip mono" data-search-q="@${esc(p.name)}" title="${p.count} mention${p.count === 1 ? '' : 's'}. Search.">@${esc(p.name)} <sup>${p.count}</sup></button>`).join('')}</div>`);
  }
  if (d.tags.length) {
    h += section('Tags', d.tags.length, `<div class="chips">${d.tags.slice(0, 20).map((g) => `<button class="chip mono" data-search-q="tag:${esc(g.tag)}">#${esc(g.tag)} <sup>${g.count}</sup></button>`).join('')}</div>`);
  }
  h += '</div></div>';
  const log = logHtml();
  if (log) h += `<div class="plog" aria-live="polite">${log}</div>`;
  return h;
}

export function html(): string {
  return `<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main projects-main">${projectState.path ? dashboard(projectState.path) : overview()}</section></div>`;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const p = target.closest<HTMLElement>('[data-open-project]')?.dataset.openProject;
  if (p) {
    openProject(p);
    return true;
  }
  const tg = target.closest<HTMLElement>('[data-toggle]')?.dataset.toggle;
  if (tg) {
    await toggleTask(tg);
    return true;
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
