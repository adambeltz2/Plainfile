import { normalizeDate } from './fields';
import { allTasks } from './home';
import type { VaultIndex } from './index';
import { addDays } from './query';

/**
 * The calendar: tasks by due date, and notes that carry a `date:` (meetings, journal entries), laid out on a
 * month, a week or an agenda. All of it is read from the notes each time; dragging a task to another day
 * changes its due date in its own file.
 */
export interface CalEvent {
  date: string;
  kind: 'task' | 'note';
  title: string;
  path: string;
  line?: number;
  /** A task's id, so it can be moved or ticked. */
  id?: string;
  done: boolean;
  /** A note's type, such as `meeting`. */
  type?: string;
}

/** Everything on the calendar from `from` to `to` (inclusive), by date then title. */
export function eventsBetween(index: VaultIndex, from: string, to: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (const t of allTasks(index)) {
    if (t.due && t.due >= from && t.due <= to)
      out.push({ date: t.due, kind: 'task', title: t.item.title, path: t.item.path, line: t.item.line, id: t.item.id, done: t.status === 'done' });
  }
  for (const n of index.notes.values()) {
    if (n.fileTask) continue; // a task note is already there as a task, by its due date
    const d = normalizeDate(n.frontmatter.date);
    if (d && d >= from && d <= to)
      out.push({
        date: d,
        kind: 'note',
        title: n.title,
        path: n.path,
        done: false,
        type: typeof n.frontmatter.type === 'string' ? n.frontmatter.type : undefined,
      });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(a.kind === 'note') - Number(b.kind === 'note') || a.title.localeCompare(b.title));
}

const first = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** Monday of the week a date falls in. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

/** The seven days of the week a date falls in, Monday first. */
export function weekOf(iso: string): string[] {
  const s = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** The weeks that cover a month, Monday first. Always whole weeks, four to six of them. */
export function monthGrid(anchor: string): string[][] {
  const start = first(anchor);
  const d = new Date(`${start}T00:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const last = addDays(next, -1);
  const weeks: string[][] = [];
  for (let w = weekStart(start); w <= last; w = addDays(w, 7)) weeks.push(weekOf(w));
  return weeks;
}

/** The first day of the month `n` months from a date's month (negative for earlier). */
export function addMonths(iso: string, n: number): string {
  const d = new Date(`${first(iso)}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
}

export function monthLabel(iso: string): string {
  return new Date(`${first(iso)}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
