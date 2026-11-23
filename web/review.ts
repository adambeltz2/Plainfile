import { fmtDate } from '../src/dates';
import { fileItem, finish, reschedule, slipped, triage, undated, waitingOn, weekAhead, type TriageItem } from '../src/home';
import { listProjects } from '../src/projects';
import { addDays } from '../src/query';
import { notice as homeNotice } from './home';
import { projectRef, errorMessage, render, rescan, state, today, writeFailure } from './store';
import { esc } from './util';

/**
 * The weekly review: four short steps that clear the loose ends and plan the week. Each step changes ordinary
 * fields in ordinary notes through the same guarded edits as everywhere else, so skipping any of it breaks
 * nothing. Nothing is stored about the review itself.
 */
const STEPS = ['Triage', 'Slipped', 'Waiting on', 'Plan the week'] as const;

export const review = {
  step: 0,
  /** What the current session has changed, shown at the end. */
  changes: 0,
  error: '',
  /** The project and tags typed for each item awaiting filing. */
  draft: new Map<string, { project: string; tags: string }>(),
};

export function startReview(): void {
  Object.assign(review, { step: 0, changes: 0, error: '', draft: new Map() });
}

const draftFor = (path: string): { project: string; tags: string } => review.draft.get(path) ?? { project: '', tags: '' };

function stepBar(): string {
  return `<nav class="tabs" role="tablist" aria-label="Review steps">${STEPS.map((s, i) => `<button role="tab" class="tab${review.step === i ? ' on' : ''}" data-rv-step="${i}" aria-selected="${review.step === i}">${i + 1}. ${s}</button>`).join('')}</nav>`;
}

function triageHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const items = triage(idx);
  const projects = listProjects(idx);
  if (!items.length) return '<div class="empty">Everything is filed. Nothing to do here.</div>';
  return (
    '<p class="muted small">Give each one a project and tags, or leave it. Filing changes only those two fields in the note.</p><ul class="plain rv-list">' +
    items
      .map((it: TriageItem) => {
        const d = draftFor(it.path);
        return (
          `<li class="rv-item"><div class="rv-t"><button class="link" data-open="${esc(it.path)}">${esc(it.title)}</button> <span class="chip quiet">${it.kind === 'task' ? 'task' : 'note'}</span>${it.created ? ` <span class="muted small">${esc(fmtDate(it.created))}</span>` : ''}</div>` +
          `<div class="rv-ctl"><select class="inp" data-rv-project="${esc(it.path)}" aria-label="Project for ${esc(it.title)}"><option value="">No project</option>${projects.map((p) => `<option value="${esc(projectRef(p).name)}"${d.project === projectRef(p).name ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select>` +
          `<input class="inp" data-rv-tags="${esc(it.path)}" data-suggest="tags" autocomplete="off" placeholder="#tags" aria-label="Tags for ${esc(it.title)}" value="${esc(d.tags)}"><button class="btn small primary" data-rv-file="${esc(it.path)}">File</button></div></li>`
        );
      })
      .join('') +
    '</ul>'
  );
}

const quickDates = (): [string, string][] => [
  ['Tomorrow', addDays(today(), 1)],
  ['Next week', addDays(today(), 7)],
];

function slippedHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const late = slipped(idx, today());
  if (!late.length) return '<div class="empty">Nothing is overdue.</div>';
  return (
    '<p class="muted small">These were due and are still open. Move each one, or finish it.</p><ul class="plain rv-list">' +
    late
      .map(
        (t) =>
          `<li class="rv-item"><div class="rv-t"><button class="link" data-open="${esc(t.item.path)}" data-line="${t.item.line}">${esc(t.item.title)}</button> <span class="chip late">${esc(t.due ? fmtDate(t.due) : '')}</span></div><div class="rv-ctl">${quickDates()
            .map(([l, d]) => `<button class="btn small" data-rv-due="${esc(t.item.id)}|${d}">${l}</button>`)
            .join(
              '',
            )}<button class="btn small" data-rv-due="${esc(t.item.id)}|">No date</button><button class="btn small primary" data-rv-done="${esc(t.item.id)}">Done</button></div></li>`,
      )
      .join('') +
    '</ul>'
  );
}

function waitingHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const w = waitingOn(idx, today());
  if (!w.length) return '<div class="empty">You are not waiting on anything.</div>';
  return (
    '<p class="muted small">Still waiting? Leave it. Arrived? Mark it done. Or move the follow-up date.</p><ul class="plain rv-list">' +
    w
      .map(
        ({ task: t, days }) =>
          `<li class="rv-item"><div class="rv-t"><button class="link" data-open="${esc(t.item.path)}" data-line="${t.item.line}">${esc(t.item.title)}</button>${t.people.length ? ` <span class="chip mono">@${esc(t.people[0] ?? '')}</span>` : ''}${days !== undefined ? ` <span class="muted small">${days} day${days === 1 ? '' : 's'}</span>` : ''}</div><div class="rv-ctl">${quickDates()
            .map(([l, d]) => `<button class="btn small" data-rv-due="${esc(t.item.id)}|${d}">Check ${l.toLowerCase()}</button>`)
            .join('')}<button class="btn small primary" data-rv-done="${esc(t.item.id)}">Arrived</button></div></li>`,
      )
      .join('') +
    '</ul>'
  );
}

function planHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const week = weekAhead(idx, today());
  const free = undated(idx);
  const days = week.map((d) => `<option value="${d.date}">${esc(fmtDate(d.date))}</option>`).join('');
  return (
    `<div class="rv-week">${week
      .map(
        (d) =>
          `<div class="rv-day${d.open > 4 ? ' heavy' : ''}"><b>${esc(fmtDate(d.date))}</b> <span class="n">${d.open}</span>${d.open > 4 ? ' <span class="chip late">heavy</span>' : ''}<ul class="plain small">${d.tasks
            .slice(0, 4)
            .map((t) => `<li>${esc(t.item.title)}</li>`)
            .join('')}${d.tasks.length > 4 ? `<li class="muted">+${d.tasks.length - 4} more</li>` : ''}</ul></div>`,
      )
      .join('')}</div>` +
    `<h3 class="grp">Tasks with no date <span>${free.length}</span></h3>` +
    (free.length
      ? `<p class="muted small">Pick a day for the ones you want to do this week. Leave the rest.</p><ul class="plain rv-list">${free
          .slice(0, 25)
          .map(
            (t) =>
              `<li class="rv-item"><div class="rv-t"><button class="link" data-open="${esc(t.item.path)}" data-line="${t.item.line}">${esc(t.item.title)}</button></div><div class="rv-ctl"><select class="inp" data-rv-plan="${esc(t.item.id)}" aria-label="Day for ${esc(t.item.title)}"><option value="">Pick a day…</option>${days}</select></div></li>`,
          )
          .join('')}${free.length > 25 ? `<li class="muted small">and ${free.length - 25} more</li>` : ''}</ul>`
      : '<div class="empty">Every open task has a date.</div>')
  );
}

export function html(): string {
  const body = [triageHtml, slippedHtml, waitingHtml, planHtml][review.step]?.() ?? '';
  const last = review.step === STEPS.length - 1;
  return (
    `<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main review"><h2 class="title">Weekly review</h2><p class="meta">Four short steps. Each change is made in your own notes, and you can stop at any point.</p>${stepBar()}` +
    (review.error ? `<div class="notice err small">${esc(review.error)}</div>` : '') +
    `<div class="rv-body">${body}</div>` +
    `<div class="row-gap"><button class="btn" data-rv-prev${review.step === 0 ? ' disabled' : ''}>Back</button>${last ? '<button class="btn primary" data-rv-finish>Finish</button>' : '<button class="btn primary" data-rv-next>Next</button>'}<span class="muted small" id="rv-count">${review.changes ? `${review.changes} change${review.changes === 1 ? '' : 's'} so far` : ''}</span></div></section></div>`
  );
}

async function run(fn: () => Promise<unknown>): Promise<void> {
  review.error = '';
  try {
    await fn();
    review.changes++;
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    review.error = friendly ?? `Could not save that change. ${errorMessage(e)}`;
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const { storage, index } = state;
  const get = (attr: string): string | undefined => (target.closest(`[${attr}]`) as HTMLElement | null)?.getAttribute(attr) ?? undefined;
  const step = get('data-rv-step');
  if (step !== undefined) {
    review.step = Number(step);
    render();
    return true;
  }
  if (target.closest('[data-rv-next]')) {
    review.step = Math.min(STEPS.length - 1, review.step + 1);
    render();
    return true;
  }
  if (target.closest('[data-rv-prev]')) {
    review.step = Math.max(0, review.step - 1);
    render();
    return true;
  }
  if (target.closest('[data-rv-finish]')) {
    homeNotice.text = `Weekly review done. ${review.changes} change${review.changes === 1 ? '' : 's'} made.`;
    state.screen = 'home';
    render();
    return true;
  }
  if (!storage || !index) return false;
  const file = get('data-rv-file');
  if (file) {
    const d = draftFor(file);
    await run(() => fileItem(storage, index, file, { project: d.project || undefined, tags: d.tags.split(/[\s,]+/).filter(Boolean) }));
    review.draft.delete(file);
    return true;
  }
  const due = get('data-rv-due');
  if (due !== undefined) {
    const [id, date] = due.split('|');
    const task = index.getTask(id ?? '');
    if (task) await run(() => reschedule(storage, index, task, date || null));
    return true;
  }
  const done = get('data-rv-done');
  if (done) {
    const task = index.getTask(done);
    if (task) await run(() => finish(storage, index, task));
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  const tags = t.dataset.rvTags;
  if (tags) {
    review.draft.set(tags, { ...draftFor(tags), tags: t.value });
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLSelectElement;
  const proj = t.dataset.rvProject;
  if (proj) {
    review.draft.set(proj, { ...draftFor(proj), project: t.value });
    return true;
  }
  const plan = t.dataset.rvPlan;
  if (plan && t.value) {
    const { storage, index } = state;
    const task = index?.getTask(plan);
    if (storage && index && task) void run(() => reschedule(storage, index, task, t.value));
    return true;
  }
  return false;
}
