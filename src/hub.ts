import { fieldOf, listOf, normalizeDate, normalizeStatus, type Status } from './fields';
import type { TaskItem, VaultIndex } from './index';
import type { Note } from './parse';
import { ALL_PROJECTS, listProjects, projectNotes, type Project } from './projects';
import { addDays } from './query';

/**
 * The project hub: every task in a project with its fields read tolerantly (so a note that lacks a field
 * just has no value for it), plus grouping, filtering and the numbers the status column shows. Nothing
 * here is stored; it is worked out from the notes each time.
 */
export interface HubTask {
  item: TaskItem;
  status: Status;
  due?: string;
  phase?: string;
  people: string[];
  tags: string[];
  note: Note;
  /** The projects it belongs to, by folder or by `project:`. Filled in for the "All tasks" view. */
  projects?: string[];
}

export type GroupBy = 'due' | 'status' | 'person' | 'tag' | 'phase' | 'note' | 'project';

export interface Filters {
  text: string;
  people: string[];
  tags: string[];
  statuses: Status[];
  phases: string[];
  /** 'overdue', 'week' (the next 7 days) or 'none' (no date). */
  due?: 'overdue' | 'week' | 'none';
  /** Hide finished tasks. On by default. */
  hideDone: boolean;
}

export const NO_FILTERS: Filters = { text: '', people: [], tags: [], statuses: [], phases: [], hideDone: true };

/** A new set of filters. Always use this rather than copying NO_FILTERS, whose lists would be shared. */
export function newFilters(hideDone = true): Filters {
  return { text: '', people: [], tags: [], statuses: [], phases: [], hideDone };
}

export interface Group {
  key: string;
  title: string;
  items: HubTask[];
  total: number;
  done: number;
  late?: boolean;
}

/** Headings that organise a note but are not a phase of the work. */
const GENERIC = new Set([
  'goal',
  'goals',
  'notes',
  'note',
  'tasks',
  'task',
  'task list',
  'to do',
  'todo',
  'overview',
  'summary',
  'links',
  'log',
  'agenda',
  'decisions',
  'action items',
]);

/** The nearest heading above a line, as the phase of an inline task. Headings of level 1 are the title and do not count. */
function headingAbove(n: Note, line: number): string | undefined {
  let found: string | undefined;
  for (const h of n.headings) {
    if (h.line >= line) break;
    if (h.level >= 2) found = GENERIC.has(h.text.trim().toLowerCase()) ? undefined : h.text.trim();
  }
  return found;
}

export function toHubTask(item: TaskItem, note: Note): HubTask {
  const fm = note.frontmatter;
  let status: Status;
  let phase: string | undefined;
  let people = item.who.map((w) => w.replace(/^@/, ''));
  if (item.kind === 'file') {
    status = item.done ? 'done' : (normalizeStatus(fieldOf(fm, 'status')?.value ?? item.status) ?? 'todo');
    const ph = fieldOf(fm, 'phase')?.value;
    phase = ph !== undefined ? String(ph).trim() : undefined;
    people = [...new Set([...people, ...listOf(fieldOf(fm, 'people')?.value).map((p) => p.replace(/^@/, '').toLowerCase().replace(/\s+/g, '-'))])];
  } else {
    status = item.done ? 'done' : item.tags.includes('waiting') ? 'waiting' : 'todo';
    phase = headingAbove(note, item.line);
  }
  return { item, status, due: normalizeDate(item.due) ?? undefined, phase: phase || undefined, people, tags: item.tags, note };
}

/** Every task that belongs to the project, fields read tolerantly. */
export function hubTasks(index: VaultIndex, projectPath: string): HubTask[] {
  if (projectPath === ALL_PROJECTS) {
    // Which projects each note belongs to, by folder or `project:`, so the tasks can be grouped by project.
    const of = new Map<string, string[]>();
    const live = new Set<string>();
    for (const p of listProjects(index)) {
      for (const n of projectNotes(index, p.path)) {
        of.set(n.path, [...(of.get(n.path) ?? []), p.title]);
        if (p.active) live.add(n.path);
      }
    }
    // A finished task whose only projects are archived is left out, so closed work does not crowd the list. An open
    // task always shows, wherever it lives: if it is still to do, it is still to do.
    return index.tasks().flatMap((t) => {
      const n = index.notes.get(t.path);
      if (!n) return [];
      const ps = of.get(n.path) ?? [];
      const h = { ...toHubTask(t, n), projects: ps };
      return ps.length && !live.has(n.path) && h.status === 'done' ? [] : [h];
    });
  }
  const covered = projectNotes(index, projectPath);
  const byPath = new Map(covered.map((n) => [n.path, n]));
  const out: HubTask[] = [];
  for (const t of index.tasks()) {
    const n = byPath.get(t.path);
    if (n) out.push(toHubTask(t, n));
  }
  return out;
}

export function applyFilters(tasks: HubTask[], f: Filters, keep?: ReadonlySet<string>, today = ''): HubTask[] {
  const q = f.text.trim().toLowerCase();
  const week = today ? addDays(today, 7) : '';
  return tasks.filter((t) => {
    if (f.hideDone && t.status === 'done' && !keep?.has(t.item.id)) return false;
    if (f.people.length && !f.people.some((p) => t.people.includes(p))) return false;
    if (f.tags.length && !f.tags.some((g) => t.tags.includes(g))) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.phases.length && !f.phases.includes(t.phase ?? '')) return false;
    if (f.due === 'overdue' && !(t.due && t.due < today && t.status !== 'done')) return false;
    if (f.due === 'week' && !(t.due && t.due >= today && t.due <= week)) return false;
    if (f.due === 'none' && t.due) return false;
    if (q && !`${t.item.title} ${t.people.join(' ')} ${t.tags.join(' ')} ${t.phase ?? ''} ${t.note.title}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const byDue = (a: HubTask, b: HubTask): number =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
  a.item.title.localeCompare(b.item.title) ||
  a.item.path.localeCompare(b.item.path) ||
  a.item.line - b.item.line;

/** `keep` lists task ids just ticked, which stay in their place (struck through) instead of jumping to Done. */
export function groupTasks(tasks: HubTask[], by: GroupBy, today: string, keep?: ReadonlySet<string>): Group[] {
  const week = addDays(today, 7);
  const make = (key: string, title: string, items: HubTask[], late = false): Group => ({
    key,
    title,
    items: [...items].sort(byDue),
    total: items.length,
    done: items.filter((t) => t.status === 'done').length,
    late,
  });
  const open = (t: HubTask): boolean => t.status !== 'done' || !!keep?.has(t.item.id);
  let groups: Group[];
  if (by === 'due') {
    groups = [
      make(
        'overdue',
        'Overdue',
        tasks.filter((t) => open(t) && t.due && t.due < today),
        true,
      ),
      make(
        'today',
        'Due today',
        tasks.filter((t) => open(t) && t.due === today),
      ),
      make(
        'week',
        'This week',
        tasks.filter((t) => open(t) && t.due && t.due > today && t.due <= week),
      ),
      make(
        'later',
        'Later',
        tasks.filter((t) => open(t) && t.due && t.due > week),
      ),
      make(
        'none',
        'No date',
        tasks.filter((t) => open(t) && !t.due),
      ),
      make(
        'done',
        'Done',
        tasks.filter((t) => !open(t)),
      ),
    ];
  } else {
    const m = new Map<string, HubTask[]>();
    const put = (k: string, t: HubTask): void => void m.set(k, [...(m.get(k) ?? []), t]);
    for (const t of tasks) {
      if (by === 'status') put(t.status, t);
      else if (by === 'person') for (const p of t.people.length ? t.people : ['']) put(p, t);
      else if (by === 'tag') for (const g of t.tags.length ? t.tags : ['']) put(g, t);
      else if (by === 'project') for (const p of t.projects?.length ? t.projects : ['']) put(p.toLowerCase(), t);
      else if (by === 'phase') put(t.phase ?? '', t);
      else put(t.item.path, t);
    }
    const title = (k: string): string =>
      by === 'status'
        ? (({ todo: 'To do', doing: 'Doing', waiting: 'Waiting', done: 'Done' } as Record<string, string>)[k] ?? k)
        : by === 'person'
          ? k
            ? `@${k}`
            : 'Unassigned'
          : by === 'tag'
            ? k
              ? `#${k}`
              : 'No tag'
            : by === 'phase'
              ? k || 'No phase'
              : by === 'project'
                ? k
                  ? (tasks.flatMap((t) => t.projects ?? []).find((p) => p.toLowerCase() === k) ?? k)
                  : 'No project'
                : (tasks.find((t) => t.item.path === k)?.note.title ?? k);
    const order = (k: string): number => (by === 'status' ? ['todo', 'doing', 'waiting', 'done'].indexOf(k) : k === '' ? 1 : 0);
    groups = [...m].sort((a, b) => order(a[0]) - order(b[0]) || title(a[0]).localeCompare(title(b[0]))).map(([k, v]) => make(k, title(k), v));
  }
  return groups.filter((g) => g.items.length);
}

export interface HubSummary {
  total: number;
  done: number;
  open: number;
  overdue: number;
  phases: { name: string; done: number; total: number }[];
  people: { name: string; open: number }[];
  tags: { tag: string; open: number }[];
  /** The first three open tasks by date, late ones first. */
  next: HubTask[];
  /** Tasks finished per week for the last six weeks, by the note's modified time (a close guess, not a log). */
  weekly: number[];
}

export function summarize(all: HubTask[], today: string, nowMs: number): HubSummary {
  const open = all.filter((t) => t.status !== 'done');
  const phases = new Map<string, { done: number; total: number }>();
  for (const t of all) {
    const p = phases.get(t.phase ?? '') ?? { done: 0, total: 0 };
    p.total++;
    if (t.status === 'done') p.done++;
    phases.set(t.phase ?? '', p);
  }
  const count = (xs: string[]): Map<string, number> => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const people = count(open.flatMap((t) => (t.people.length ? t.people : [''])));
  const tags = count(open.flatMap((t) => t.tags));
  const weekMs = 7 * 24 * 3600 * 1000;
  const weekly = Array<number>(6).fill(0);
  for (const t of all) {
    if (t.status !== 'done') continue;
    const ago = Math.floor((nowMs - t.note.mtime) / weekMs);
    if (ago >= 0 && ago < 6) weekly[5 - ago] = (weekly[5 - ago] ?? 0) + 1;
  }
  return {
    total: all.length,
    done: all.length - open.length,
    open: open.length,
    overdue: open.filter((t) => t.due && t.due < today).length,
    phases: [...phases]
      .filter(([k]) => k !== '' || phases.size > 1)
      .map(([name, v]) => ({ name: name || 'No phase', ...v }))
      .sort((a, b) => (a.name === 'No phase' ? 1 : 0) - (b.name === 'No phase' ? 1 : 0)),
    people: [...people].map(([name, n]) => ({ name, open: n })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    tags: [...tags]
      .map(([tag, n]) => ({ tag, open: n }))
      .sort((a, b) => b.open - a.open || a.tag.localeCompare(b.tag))
      .slice(0, 12),
    next: [...open].sort(byDue).slice(0, 3),
    weekly,
  };
}

export interface PortfolioRow {
  project: Project;
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** The earliest due date among open tasks. */
  nextDue?: string;
  /** When anything in the project last changed (ms). */
  lastChange: number;
}

/** One row per project for the portfolio table. Tasks are read once, then shared out by project. */
export function portfolio(index: VaultIndex, today: string): PortfolioRow[] {
  const all = index.tasks();
  return listProjects(index).map((project) => {
    const covered = projectNotes(index, project.path);
    const paths = new Set(covered.map((n) => n.path));
    const mine = all.filter((t) => paths.has(t.path)).map((t) => toHubTask(t, index.notes.get(t.path) as Note));
    const open = mine.filter((t) => t.status !== 'done');
    return {
      project,
      total: mine.length,
      done: mine.length - open.length,
      open: open.length,
      overdue: open.filter((t) => t.due && t.due < today).length,
      nextDue: open
        .map((t) => t.due)
        .filter((d): d is string => !!d)
        .sort()[0],
      lastChange: covered.reduce((m, n) => Math.max(m, n.mtime), 0),
    };
  });
}
