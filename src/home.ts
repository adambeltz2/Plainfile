import { applyBulk, planBulk } from './bulk';
import { addFrontmatterListItem } from './frontmatter';
import { setProjects } from './frontmatter';
import { fieldOf, listOf } from './fields';
import { toHubTask, type HubTask } from './hub';
import type { TaskItem, VaultIndex } from './index';
import type { Note } from './parse';
import { addDays } from './query';
import type { VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

/**
 * What the Home screen and the weekly review show, all worked out from the notes and nothing stored:
 * what needs filing, what has slipped, what you are waiting on, the week ahead, and where you left off.
 */
export interface TriageItem {
  kind: 'note' | 'task';
  path: string;
  title: string;
  /** For a task note: its id, so it can be ticked or rescheduled. */
  id?: string;
  /** When it was made, if it says so. */
  created?: string;
}

const hasProject = (n: Note): boolean => listOf(fieldOf(n.frontmatter, 'project')?.value).length > 0;
const isTaskNote = (n: Note): boolean => !!n.fileTask;

/**
 * Notes that have not been filed yet: notes in `inbox/` with no project and no tags (a quick note you meant to
 * come back to), and task notes that belong to no project. Newest first.
 */
export function triage(index: VaultIndex): TriageItem[] {
  const out: TriageItem[] = [];
  for (const n of index.notes.values()) {
    if (isTaskNote(n)) {
      if (!n.fileTask?.done && !hasProject(n) && !/(^|\/)projects\//.test(n.path)) out.push({ kind: 'task', path: n.path, title: n.title, id: `${n.path}:${n.fileTask?.statusLine}`, created: n.fileTask?.created });
      continue;
    }
    if (/^inbox\//i.test(n.path) && n.name.toLowerCase() !== 'inbox' && !hasProject(n) && n.tags.length === 0) {
      out.push({ kind: 'note', path: n.path, title: n.title, created: typeof n.frontmatter.created === 'string' ? n.frontmatter.created : undefined });
    }
  }
  return out.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || a.title.localeCompare(b.title));
}

/** Every task in the vault with its fields read tolerantly (the hub's reading, but across all projects). */
export function allTasks(index: VaultIndex): HubTask[] {
  return index.tasks().flatMap((t) => {
    const n = index.notes.get(t.path);
    return n ? [toHubTask(t, n)] : [];
  });
}

export function daysSince(iso: string | undefined, today: string): number | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return undefined;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

/** Tasks marked waiting (status or #waiting), oldest first, with how long they have waited. */
export function waitingOn(index: VaultIndex, today: string): { task: HubTask; days?: number }[] {
  return allTasks(index)
    .filter((t) => t.status === 'waiting')
    .map((task) => ({ task, days: daysSince(task.item.created, today) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || a.task.item.title.localeCompare(b.task.item.title));
}

/** Open tasks whose date has passed, longest overdue first. */
export function slipped(index: VaultIndex, today: string): HubTask[] {
  return allTasks(index)
    .filter((t) => t.status !== 'done' && t.due && t.due < today)
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.item.title.localeCompare(b.item.title));
}

export interface DayCount {
  date: string;
  open: number;
  tasks: HubTask[];
}

/** The next seven days, starting today, with the open tasks due on each. */
export function weekAhead(index: VaultIndex, today: string): DayCount[] {
  const all = allTasks(index).filter((t) => t.status !== 'done' && t.due);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const tasks = all.filter((t) => t.due === date);
    return { date, open: tasks.length, tasks };
  });
}

/** Open tasks with no date at all, the ones a week plan has to place. */
export function undated(index: VaultIndex): HubTask[] {
  return allTasks(index).filter((t) => t.status !== 'done' && !t.due);
}

/** (Home no longer shows this; the Recent screen lists every note.) Where you left off: the notes changed most recently, leaving out task notes and the generated inbox file. */
export function pickUp(index: VaultIndex, limit = 5): Note[] {
  return [...index.notes.values()]
    .filter((n) => !isTaskNote(n))
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
    .slice(0, limit);
}

/** File a note or task note: add it to a project and add tags. Only those two fields change. */
export async function fileItem(storage: VaultStorage, index: VaultIndex, path: string, opts: { project?: string; tags?: string[] }): Promise<ChangeResult> {
  const stat = await storage.stat(path);
  const text = await storage.read(path);
  let next = text;
  const note = index.notes.get(path);
  if (opts.project && note) {
    const existing = listOf(fieldOf(note.frontmatter, 'project')?.value);
    if (!existing.some((x) => x.toLowerCase() === opts.project?.toLowerCase())) next = setProjects(next, [...existing, opts.project]);
  }
  for (const t of opts.tags ?? []) {
    const tag = t.replace(/^#/, '').trim().replace(/\s+/g, '-');
    if (tag) next = addFrontmatterListItem(next, 'tags', tag);
  }
  if (next !== text) await storage.write(path, next, stat.mtime);
  await index.refreshFile(path);
  const a = text.split('\n');
  const b = next.split('\n');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  return { path, line: s + 1, before: a[s] ?? '', after: b[s] ?? '', written: next !== text };
}

/** Change one task's due date (or clear it) with the same guarded edit the bulk changes use. */
export async function reschedule(storage: VaultStorage, index: VaultIndex, task: TaskItem, date: string | null): Promise<ChangeResult> {
  const plan = await planBulk(storage, index, [task.id], { kind: 'due', date });
  const edit = plan.edits[0];
  if (!edit) return { path: task.path, line: task.line, before: '', after: '', written: false };
  const [change] = await applyBulk(storage, index, [edit]);
  if (!change) throw new StaleError(task.path, task.line);
  return change;
}

/** Mark a task done through the same edit. */
export async function finish(storage: VaultStorage, index: VaultIndex, task: TaskItem): Promise<ChangeResult> {
  const plan = await planBulk(storage, index, [task.id], { kind: 'done', done: true });
  const edit = plan.edits[0];
  if (!edit) return { path: task.path, line: task.line, before: '', after: '', written: false };
  const [change] = await applyBulk(storage, index, [edit]);
  return change ?? { path: task.path, line: task.line, before: '', after: '', written: false };
}
