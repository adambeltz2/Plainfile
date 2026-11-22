import { normalizeDate } from './fields';
import { allTasks } from './home';
import type { VaultIndex } from './index';
import { localDateOf } from './dates';
import { weekStart } from './calendar';
import { addDays } from './query';

/**
 * Insight: what your own files say about your work. Which days you wrote, what this month looked like, and what
 * you write about. All of it is counted from modified times, dates and tags, in the browser. There is no log.
 */
export interface Heat {
  date: string;
  count: number;
  /** 0 (none) to 3 (a busy day), relative to the busiest days. */
  level: 0 | 1 | 2 | 3;
}

/** Notes changed per day for the last `weeks` weeks (Monday-first columns), ending with this week. */
export function activity(index: VaultIndex, today: string, weeks = 26): { weeks: Heat[][]; total: number; days: number; busiest?: Heat } {
  const counts = new Map<string, number>();
  for (const n of index.notes.values()) {
    const d = localDateOf(n.mtime);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  const cols: Heat[][] = [];
  let total = 0;
  let days = 0;
  let busiest: Heat | undefined;
  const values: number[] = [];
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const c = counts.get(addDays(start, w * 7 + d)) ?? 0;
    if (c) values.push(c);
  }
  const max = Math.max(0, ...values);
  for (let w = 0; w < weeks; w++) {
    const col: Heat[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const count = date > today ? 0 : counts.get(date) ?? 0;
      const level: Heat['level'] = count === 0 ? 0 : count <= max / 3 ? 1 : count <= (2 * max) / 3 ? 2 : 3;
      const h = { date, count, level };
      col.push(h);
      total += count;
      if (count) days++;
      if (count && (!busiest || count > busiest.count)) busiest = h;
    }
    cols.push(col);
  }
  return { weeks: cols, total, days, busiest };
}

export interface MonthStats {
  /** Notes changed this month. */
  edited: number;
  /** Notes with a `created:` date this month. */
  notesCreated: number;
  tasksCreated: number;
  /** Tasks that are done in notes changed this month (a close guess: file times are all there is). */
  tasksDone: number;
  overdue: number;
  open: number;
}

export function monthStats(index: VaultIndex, today: string): MonthStats {
  const month = today.slice(0, 7);
  let edited = 0;
  let notesCreated = 0;
  for (const n of index.notes.values()) {
    if (localDateOf(n.mtime).startsWith(month)) edited++;
    const c = normalizeDate(n.frontmatter.created);
    if (c?.startsWith(month) && !n.fileTask) notesCreated++;
  }
  const tasks = allTasks(index);
  return {
    edited,
    notesCreated,
    tasksCreated: tasks.filter((t) => (t.item.created ?? '').startsWith(month)).length,
    tasksDone: tasks.filter((t) => t.status === 'done' && localDateOf(t.note.mtime).startsWith(month)).length,
    overdue: tasks.filter((t) => t.status !== 'done' && t.due && t.due < today).length,
    open: tasks.filter((t) => t.status !== 'done').length,
  };
}

/** Folders by how many notes they hold, biggest first. */
export function folderSizes(index: VaultIndex, limit = 8): { folder: string; notes: number }[] {
  const m = new Map<string, number>();
  for (const n of index.notes.values()) {
    const top = n.path.includes('/') ? (n.path.split('/')[0] as string) : '(top level)';
    m.set(top, (m.get(top) ?? 0) + 1);
  }
  return [...m].map(([folder, notes]) => ({ folder, notes })).sort((a, b) => b.notes - a.notes || a.folder.localeCompare(b.folder)).slice(0, limit);
}

export type Drill = 'edited' | 'notesCreated' | 'tasksCreated' | 'tasksDone' | 'open' | 'overdue';

export interface DrillItem {
  path: string;
  title: string;
  line?: number;
  /** Shown at the right: a date or a short note. */
  hint: string;
}

/** The notes or tasks behind one of the This month numbers, so the number can be opened and checked. */
export function drillItems(index: VaultIndex, today: string, kind: Drill): DrillItem[] {
  const month = today.slice(0, 7);
  const notes = [...index.notes.values()];
  const byTime = (a: { path: string }, b: { path: string }) => (index.notes.get(b.path)?.mtime ?? 0) - (index.notes.get(a.path)?.mtime ?? 0);
  if (kind === 'edited') return notes.filter((n) => localDateOf(n.mtime).startsWith(month)).map((n) => ({ path: n.path, title: n.title, hint: localDateOf(n.mtime) })).sort(byTime);
  if (kind === 'notesCreated') {
    return notes
      .filter((n) => !n.fileTask && normalizeDate(n.frontmatter.created)?.startsWith(month))
      .map((n) => ({ path: n.path, title: n.title, hint: normalizeDate(n.frontmatter.created) ?? '' }))
      .sort((a, b) => b.hint.localeCompare(a.hint));
  }
  const tasks = allTasks(index);
  const pick = (list: typeof tasks, hint: (t: (typeof tasks)[number]) => string): DrillItem[] => list.map((t) => ({ path: t.item.path, title: t.item.title, line: t.item.line, hint: hint(t) })).sort((a, b) => b.hint.localeCompare(a.hint));
  if (kind === 'tasksCreated') return pick(tasks.filter((t) => (t.item.created ?? '').startsWith(month)), (t) => t.item.created ?? '');
  if (kind === 'tasksDone') return pick(tasks.filter((t) => t.status === 'done' && localDateOf(t.note.mtime).startsWith(month)), (t) => localDateOf(t.note.mtime));
  if (kind === 'overdue') return pick(tasks.filter((t) => t.status !== 'done' && t.due && t.due < today), (t) => t.due ?? '').reverse();
  return pick(tasks.filter((t) => t.status !== 'done'), (t) => t.due ?? '');
}

/** Notes whose file changed on one day, newest first. */
export function notesChangedOn(index: VaultIndex, date: string): DrillItem[] {
  return [...index.notes.values()]
    .filter((n) => localDateOf(n.mtime) === date)
    .sort((a, b) => b.mtime - a.mtime)
    .map((n) => ({ path: n.path, title: n.title, hint: new Date(n.mtime).toTimeString().slice(0, 5) }));
}
