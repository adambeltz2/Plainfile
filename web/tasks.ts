import { fmtDate } from '../src/dates';
import { describeRecurrence } from '../src/recur';
import type { TaskItem } from '../src/index';
import { setTaskDone } from '../src/writeback';
import { openNote } from './notes';
import { errorMessage, justDone, loadContext, render, rescan, state, today, writeFailure } from './store';
import { esc } from './util';

/** A to C are drawn with weight and inversion (no colour); D to Z are quiet. */
export function priorityBadge(p: string | undefined): string {
  if (!p) return '';
  const tier = p === 'A' ? 'a' : p === 'B' ? 'b' : p === 'C' ? 'c' : 'q';
  return `<span class="pri ${tier}" title="Priority ${esc(p)}" role="img" aria-label="Priority ${esc(p)}">${esc(p)}</span>`;
}

/** A task as a list row, shared by Today and the project page: tick box, title, and its chips. */
function chips(t: TaskItem): string {
  const out: string[] = [];
  if (t.sub?.total) out.push(`<span class="chip" title="${t.sub.done} of ${t.sub.total} subtasks done">${t.sub.done} of ${t.sub.total}</span>`);
  if (t.due) {
    const late = t.due < today() && !t.done;
    out.push(`<span class="chip${late ? ' late' : ''}">${late ? 'Overdue · ' : ''}${esc(fmtDate(t.due))}</span>`);
  }
  if (t.recur) out.push(`<span class="chip" title="Finishing it makes the next one">↻ ${esc(describeRecurrence(t.recur))}</span>`);
  if (t.status) out.push(`<span class="chip st st-${esc(t.status)}">${esc(t.status)}</span>`);
  if (t.created) out.push(`<span class="chip quiet" title="Created ${esc(t.created)}">added ${esc(fmtDate(t.created))}</span>`);
  for (const w of t.who) out.push(`<span class="chip mono">${esc(w)}</span>`);
  for (const g of t.tags) out.push(`<span class="chip mono">#${esc(g)}</span>`);
  out.push(
    `<button class="chip src mono" data-open="${esc(t.path)}" data-line="${t.line}" title="Open this note" aria-label="Open ${esc(t.path)}">${esc(t.path.split('/').slice(-2).join('/'))}</button>`,
  );
  return out.join('');
}

export function row(t: TaskItem, pick?: { on: boolean }): string {
  return (
    `<li class="task${t.done ? ' done' : ''}${t.id === state.selected ? ' sel' : ''}${pick?.on ? ' picked' : ''}" data-id="${esc(t.id)}" tabindex="0">` +
    (pick ? `<input type="checkbox" class="selbox" data-hub-select="${esc(t.id)}"${pick.on ? ' checked' : ''} aria-label="Select: ${esc(t.title)}">` : '') +
    `<button class="cb" data-toggle="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${t.done ? '✓' : ''}</button>` +
    `<div class="body"><div class="t">${priorityBadge(t.priority)}${esc(t.title)}</div><div class="chips">${chips(t)}</div></div></li>`
  );
}

/** Tick or untick a task. The write is guarded, and what changed on disk is kept for the readout. */
export async function toggleTask(id: string): Promise<void> {
  const { index, storage } = state;
  const t = index?.getTask(id);
  if (!index || !storage || !t) return;
  try {
    const r = await setTaskDone(storage, index, id, !t.done, { completedOn: today() });
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

/** What the last write changed on disk: the exact line before and after. Empty if nothing was written. */
export function logHtml(): string {
  const log = state.log;
  if (!log) return '';
  if ('message' in log) return `<div class="diff plain"><div class="cap">Not saved</div>${esc(log.message)}</div>`;
  if (!log.written) return '<div class="diff plain"><div class="cap">What changed on disk</div>Nothing. It was already in that state.</div>';
  return (
    `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(log.path)}:${log.line}</div>` +
    (log.before ? `<div class="del"><span class="sg">−</span><span>${esc(log.before)}</span></div>` : '') +
    `<div class="add"><span class="sg">+</span><span>${esc(log.after)}</span></div>` +
    (log.also
      ? `<div class="muted">${esc(log.path)}:${log.also.line}</div>${log.also.before ? `<div class="del"><span class="sg">−</span><span>${esc(log.also.before)}</span></div>` : ''}${log.also.after ? `<div class="add"><span class="sg">+</span><span>${esc(log.also.after)}</span></div>` : ''}`
      : '') +
    '</div>'
  );
}

/** On screens with no side panel (Home, Calendar, People), a click on a task row opens the note it lives in, at its line. */
export async function openTaskRow(target: HTMLElement): Promise<boolean> {
  const id = target.closest<HTMLElement>('li.task[data-id]')?.dataset.id;
  const task = id ? state.index?.getTask(id) : undefined;
  if (!task) return false;
  await openNote(task.path, { line: task.line });
  return true;
}
