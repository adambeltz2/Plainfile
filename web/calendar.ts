import { addMonths, eventsBetween, monthGrid, monthLabel, weekOf, type CalEvent } from '../src/calendar';
import { fmtDate, fmtDateLong } from '../src/dates';
import { reschedule } from '../src/home';
import { addDays } from '../src/query';
import { errorMessage, quickAddTask, render, rescan, state, today, writeFailure } from './store';
import { logHtml, row, toggleTask } from './tasks';
import { esc } from './util';

/**
 * The Calendar screen: a month, a week or an agenda of tasks (by due date) and dated notes (meetings, journal
 * entries). Drag a task to another day, or change its date in the day panel, and the due date in its own file
 * changes. Nothing is stored apart from the notes.
 */
type View = 'month' | 'week' | 'agenda';

export const cal = { view: 'month' as View, anchor: '', selected: '', error: '', adding: '' };

const MAX_CHIPS = 3;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ensure(): void {
  if (!cal.anchor) cal.anchor = today();
  if (!cal.selected) cal.selected = today();
}

const chip = (e: CalEvent): string =>
  `<button class="cal-ev ${e.kind}${e.done ? ' done' : ''}"${e.kind === 'task' && e.id ? ` draggable="true" data-cal-task="${esc(e.id)}"` : ''} data-open="${esc(e.path)}"${e.line ? ` data-line="${e.line}"` : ''} title="${esc(e.title)}${e.kind === 'note' ? ' (note)' : ''}">${e.kind === 'task' ? (e.done ? '☑' : '☐') : '◇'} ${esc(e.title)}</button>`;

function monthHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const weeks = monthGrid(cal.anchor);
  const from = weeks[0]?.[0] ?? cal.anchor;
  const to = weeks.at(-1)?.[6] ?? cal.anchor;
  const ev = eventsBetween(idx, from, to);
  const by = new Map<string, CalEvent[]>();
  for (const e of ev) by.set(e.date, [...(by.get(e.date) ?? []), e]);
  const month = cal.anchor.slice(0, 7);
  return (
    `<div class="cal-grid" role="grid" aria-label="${esc(monthLabel(cal.anchor))}">${DOW.map((d) => `<div class="cal-h" role="columnheader">${d}</div>`).join('')}` +
    weeks
      .flat()
      .map((d) => {
        const list = by.get(d) ?? [];
        const open = list.filter((e) => !e.done).length;
        return (
          `<div class="cal-cell${d.slice(0, 7) !== month ? ' out' : ''}${d === today() ? ' today' : ''}${d === cal.selected ? ' sel' : ''}" role="gridcell" data-cal-day="${d}">` +
          `<button class="cal-num" data-cal-pick="${d}" aria-label="${esc(fmtDateLong(d))}${list.length ? `, ${list.length} item${list.length === 1 ? '' : 's'}` : ''}">${Number(d.slice(8))}${list.length ? `<span class="cal-count">${open || list.length}</span>` : ''}</button>` +
          list.slice(0, MAX_CHIPS).map(chip).join('') +
          (list.length > MAX_CHIPS ? `<button class="cal-more" data-cal-pick="${d}">+${list.length - MAX_CHIPS} more</button>` : '') +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function weekHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const days = weekOf(cal.anchor);
  const ev = eventsBetween(idx, days[0] as string, days[6] as string);
  return (
    '<div class="cal-week">' +
    days
      .map((d) => `<div class="cal-col${d === today() ? ' today' : ''}${d === cal.selected ? ' sel' : ''}" data-cal-day="${d}"><button class="cal-num" data-cal-pick="${d}">${esc(fmtDate(d))}</button>${ev.filter((e) => e.date === d).map(chip).join('') || '<span class="muted small">Nothing</span>'}</div>`)
      .join('') +
    '</div>'
  );
}

function agendaHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const from = cal.anchor;
  const ev = eventsBetween(idx, from, addDays(from, 30));
  if (!ev.length) return '<div class="empty">Nothing dated in the next 30 days. Give a task a due date, or a note a <code>date:</code>.</div>';
  const days = [...new Set(ev.map((e) => e.date))];
  return `<div class="cal-agenda">${days.map((d) => `<section><h3 class="grp${d === today() ? ' late' : ''}">${esc(fmtDateLong(d))}${d === today() ? ' · today' : ''}</h3><div class="cal-day-list">${ev.filter((e) => e.date === d).map(chip).join('')}</div></section>`).join('')}</div>`;
}

function dayPanel(): string {
  const idx = state.index;
  if (!idx) return '';
  const d = cal.selected;
  const ev = eventsBetween(idx, d, d);
  const tasks = ev.filter((e) => e.kind === 'task' && e.id).map((e) => idx.getTask(e.id as string)).filter((t) => !!t);
  const notes = ev.filter((e) => e.kind === 'note');
  return (
    `<section class="cal-day card" aria-label="${esc(fmtDateLong(d))}"><h3>${esc(fmtDateLong(d))}${d === today() ? ' · today' : ''}</h3>` +
    (tasks.length
      ? tasks.map((t) => `<div class="cal-trow"><ul class="tasks">${row(t!)}</ul><label class="small muted cal-move">Move to <input type="date" class="inp date" data-cal-move="${esc(t!.id)}" value="${esc(t!.due ?? '')}" aria-label="New date for ${esc(t!.title)}"></label></div>`).join('')
      : '<p class="muted small" style="margin:0 0 6px">No tasks this day.</p>') +
    (notes.length ? `<h4 class="small muted" style="margin:8px 0 4px">Notes</h4><div class="cal-day-list">${notes.map(chip).join('')}</div>` : '') +
    `<form class="cal-add" data-cal-add><label class="sr" for="cal-add-text">Add a task for this day</label><input id="cal-add-text" class="inp" autocomplete="off" placeholder="Add a task for this day" value="${esc(cal.adding)}"><button class="btn small primary" type="submit">Add</button></form>` +
    `${cal.error ? `<div class="notice err small">${esc(cal.error)}</div>` : ''}${logHtml() ? `<div class="plog">${logHtml()}</div>` : ''}</section>`
  );
}

export function html(): string {
  ensure();
  const label = cal.view === 'month' ? monthLabel(cal.anchor) : cal.view === 'week' ? `Week of ${fmtDate(weekOf(cal.anchor)[0] as string)}` : `Next 30 days from ${fmtDate(cal.anchor)}`;
  const view = (v: View, l: string): string => `<button class="btn small" data-cal-view="${v}" aria-pressed="${cal.view === v}">${l}</button>`;
  return (
    '<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main calendar">' +
    `<div class="cal-bar"><h2 class="title" style="margin:0">${esc(label)}</h2><span class="grow"></span><button class="btn small" data-cal-nav="-1" aria-label="Previous">‹</button><button class="btn small" data-cal-nav="0">Today</button><button class="btn small" data-cal-nav="1" aria-label="Next">›</button>${view('month', 'Month')}${view('week', 'Week')}${view('agenda', 'Agenda')}</div>` +
    `<p class="muted small" style="margin:4px 0 8px">☐ tasks by due date, ◇ notes with a date. Drag a task to another day to change its due date.</p>` +
    (cal.view === 'month' ? monthHtml() : cal.view === 'week' ? weekHtml() : agendaHtml()) +
    dayPanel() +
    '</section></div>'
  );
}

async function moveTask(id: string, date: string | null): Promise<void> {
  const { storage, index } = state;
  const task = index?.getTask(id);
  if (!storage || !index || !task) return;
  cal.error = '';
  try {
    state.log = await reschedule(storage, index, task, date);
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    cal.error = friendly ?? `Could not save that change. ${errorMessage(e)}`;
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  ensure();
  const nav = target.closest<HTMLElement>('[data-cal-nav]')?.dataset.calNav;
  if (nav !== undefined) {
    const n = Number(nav);
    if (n === 0) cal.anchor = cal.selected = today();
    else if (cal.view === 'month') cal.anchor = addMonths(cal.anchor, n);
    else cal.anchor = addDays(cal.anchor, n * (cal.view === 'week' ? 7 : 30));
    render();
    return true;
  }
  const view = target.closest<HTMLElement>('[data-cal-view]')?.dataset.calView as View | undefined;
  if (view) {
    cal.view = view;
    render();
    return true;
  }
  const pick = target.closest<HTMLElement>('[data-cal-pick]')?.dataset.calPick;
  if (pick) {
    cal.selected = pick;
    if (cal.view === 'month' && pick.slice(0, 7) !== cal.anchor.slice(0, 7)) cal.anchor = pick;
    render();
    return true;
  }
  const tg = target.closest<HTMLElement>('[data-toggle]')?.dataset.toggle;
  if (tg) {
    await toggleTask(tg);
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  const id = t.dataset.calMove;
  if (id) {
    void moveTask(id, t.value || null);
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'cal-add-text') {
    cal.adding = t.value;
    return true;
  }
  return false;
}

export async function submitAdd(): Promise<void> {
  const title = cal.adding.trim();
  if (!title) return;
  const err = await quickAddTask({ title, due: cal.selected });
  cal.error = err ?? '';
  if (!err) cal.adding = '';
  render();
}

/* ---------- dragging a task to another day ---------- */

export function dragStart(e: DragEvent): void {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-cal-task]')?.dataset.calTask;
  if (!id || !e.dataTransfer) return;
  e.dataTransfer.setData('text/plain', `cal:${id}`);
  e.dataTransfer.effectAllowed = 'move';
}

export function dragOver(e: DragEvent): void {
  const day = (e.target as HTMLElement).closest<HTMLElement>('[data-cal-day]');
  if (!day) return;
  e.preventDefault();
  document.querySelectorAll('.cal-cell.over, .cal-col.over').forEach((c) => c !== day && c.classList.remove('over'));
  day.classList.add('over');
}

export function dragEnd(): void {
  document.querySelectorAll('.cal-cell.over, .cal-col.over').forEach((c) => c.classList.remove('over'));
}

export function drop(e: DragEvent): void {
  const day = (e.target as HTMLElement).closest<HTMLElement>('[data-cal-day]')?.dataset.calDay;
  const data = e.dataTransfer?.getData('text/plain') ?? '';
  if (!day || !data.startsWith('cal:')) return;
  e.preventDefault();
  cal.selected = day;
  void moveTask(data.slice(4), day);
}
