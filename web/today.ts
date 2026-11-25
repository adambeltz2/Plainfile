import { fmtDate } from '../src/dates';
import { addDays } from '../src/query';
import { reschedule, setPriority } from '../src/home';
import { describeRecurrence, parseRepeatField, type Recurrence } from '../src/recur';
import { errorMessage, loadContext, planQuickLine, quickAddLine, render, rescan, state, today, writeFailure } from './store';
import { openNote } from './notes';
import { logHtml, toggleTask } from './tasks';
import { esc } from './util';

/** Set by the Tasks screen: called after a quick add, so it can switch to a view that shows the new task. */
export const quickHooks: { added?: (due: string | undefined) => void } = {};

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
  if (parsed.priority) bits.push(`priority <b>${esc(parsed.priority)}</b>`);
  if (parsed.rec) bits.push(`repeats <b>${esc(describeRecurrence(parseRepeatField(parsed.rec) as Recurrence))}</b>`);
  if (parsed.due) bits.push(`due <b>${esc(fmtDate(parsed.due))}</b>`);
  if (parsed.people.length) bits.push(`with ${parsed.people.map((p) => `<b>@${esc(p)}</b>`).join(' ')}`);
  if (parsed.tags.length) bits.push(`tagged ${parsed.tags.map((x) => `<b>#${esc(x)}</b>`).join(' ')}`);
  return bits.join(' · ');
}

/* ---------- rendering ---------- */

/** Move the chosen task's due date with one click: tomorrow, next Monday, in a week, a date you pick, or none. */
function rescheduleHtml(): string {
  const t = state.selected ? state.index?.getTask(state.selected) : undefined;
  if (!t || t.done) return '';
  const d = today();
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  const nextMonday = addDays(d, (8 - dow) % 7 || 7);
  const btn = (label: string, date: string): string => `<button class="btn small" data-resched="${date}">${label}</button>`;
  return (
    '<h2 style="margin-top:14px">Reschedule</h2><div class="row-gap" style="margin-top:0" role="group" aria-label="Reschedule this task">' +
    `${btn('Tomorrow', addDays(d, 1))}${btn('Next Monday', nextMonday)}${btn('In a week', addDays(d, 7))}${btn('No date', '')}</div>` +
    `<label class="small muted" style="display:block;margin-top:6px">Pick a date <input type="date" class="inp date" data-resched-pick value="${esc(t.due ?? '')}" aria-label="Pick a new due date"></label>`
  );
}

async function moveDue(date: string): Promise<void> {
  const { storage, index } = state;
  const t = state.selected ? index?.getTask(state.selected) : undefined;
  if (!storage || !index || !t) return;
  try {
    state.log = await reschedule(storage, index, t, date || null);
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    state.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
  }
  // The task may now be due elsewhere, so its id (path:line) is unchanged but the lists are not.
  if (state.selected) await loadContext(state.selected).catch(() => undefined);
  render();
}

/** Set (A, B, C) or clear the selected task's priority. */
async function movePriority(letter: string | null): Promise<void> {
  const { storage, index } = state;
  const t = state.selected ? index?.getTask(state.selected) : undefined;
  if (!storage || !index || !t) return;
  try {
    state.log = await setPriority(storage, index, t, letter);
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    state.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
  }
  if (state.selected) await loadContext(state.selected).catch(() => undefined);
  render();
}

/** The panel for the selected task: its lines in the file, Open note, and Reschedule. Used on the Tasks screen. */
export function taskPanelHtml(): string {
  return source(false, true);
}

function source(withLog = true, withTrash = false): string {
  const c = state.context;
  const task = withTrash && state.selected ? state.index?.getTask(state.selected) : undefined;
  let h = task
    ? `<h3 class="tp-title">${esc(task.title)}</h3><p class="tp-kind">${task.kind === 'file' ? 'Task note' : `Task line ${task.line}`} · ${esc(task.path)}</p><h2>In your file</h2>`
    : '<h2>In your file</h2>';
  if (!c)
    h +=
      '<p class="muted small" style="margin:0">Select a task to see the exact lines in its file. Tick the box and the change shows here. Click the selected task again, or press E, to open its note.</p>';
  else {
    h += `<div class="path">${esc(c.path)}</div><div class="lines">`;
    c.lines.forEach((l, i) => {
      const n = c.start + i;
      h += `<div class="ln${n === c.hi ? ' hi' : ''}"><span class="n">${n}</span><span>${esc(l) || ' '}</span></div>`;
    });
    // A task that is its own note can go to the trash; a task line inside another note has no file of its own to remove.
    const own = withTrash && state.selected && state.index?.getTask(state.selected)?.kind === 'file';
    h += `</div><div class="row-gap"><button class="btn small primary" data-open="${esc(c.path)}" data-line="${c.hi}">Open note</button>${own ? `<button class="btn small" data-task-trash="${esc(c.path)}">Move to Trash</button>` : ''}</div>`;
    h += rescheduleHtml();
  }
  if (withLog) h += logHtml();
  return h;
}

/* ---------- events ---------- */

export async function select(id: string): Promise<void> {
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
    quickHooks.added?.(due);
    if (state.selected) await loadContext(state.selected).catch(() => undefined);
  }
  render();
  if (!err) document.getElementById('quick-text')?.focus();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const rs = target.closest<HTMLElement>('[data-resched]');
  if (rs) {
    await moveDue(rs.dataset.resched ?? '');
    return true;
  }
  const tg = target.closest<HTMLElement>('[data-toggle]');
  if (tg?.dataset.toggle) {
    await toggleTask(tg.dataset.toggle);
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (!t.matches?.('[data-resched-pick]') || !t.value) return false;
  void moveDue(t.value);
  return true;
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

/**
 * Keys for working down the list without the mouse: j and k move to the next and previous task, x ticks it, e opens
 * its note. Only when no box has the focus and no modifier is held, so typing is never affected.
 */
export function listKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const k = e.key.toLowerCase();
  if (!['j', 'k', 'x', 'e', '1', '2', '3', '0'].includes(k)) return false;
  if ((e.target as HTMLElement | null)?.closest('input, textarea, select, button:not(.cb), [contenteditable="true"]')) return false;
  const rows = [...document.querySelectorAll<HTMLElement>('.main li.task[data-id], .hub-content li.task[data-id]')];
  if (!rows.length) return false;
  const at = rows.findIndex((r) => r.dataset.id === state.selected);
  if (k === 'j' || k === 'k') {
    const next = rows[k === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1)];
    if (next?.dataset.id) void select(next.dataset.id);
    e.preventDefault();
    return true;
  }
  const id = state.selected;
  const task = id ? state.index?.getTask(id) : undefined;
  if (!task) return false;
  e.preventDefault();
  if (k === 'x') void toggleTask(task.id);
  else if ('1230'.includes(k)) void movePriority(k === '1' ? 'A' : k === '2' ? 'B' : k === '3' ? 'C' : null);
  else void openNote(task.path, { line: task.line });
  return true;
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
