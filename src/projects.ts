import { dirname, type TaskItem, type VaultIndex } from './index';
import type { Note } from './parse';

/**
 * Projects, as the first Notebook app had them: a note with `active` or `sortOrder` in its
 * frontmatter (or `type: project`). Active projects are numbered 1 to N in sortOrder.
 */
export interface Project {
  path: string;
  title: string;
  active: boolean;
  sortOrder?: number;
  /** 1 to N across active projects, in sort order. */
  number?: number;
  preview: string;
  openTasks: number;
  followups: number;
}

function isProject(n: Note): boolean {
  const fm = n.frontmatter;
  return fm.active !== undefined || fm.sortOrder !== undefined || n.type === 'project';
}

function isActive(n: Note): boolean {
  const a = n.frontmatter.active;
  return !(a === false || String(a).toLowerCase() === 'false');
}

const slug = (v: unknown): string => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The names a note's `project:` value can use to point at a project: its title, folder and file name. */
function projectNames(n: Note): Set<string> {
  const dir = dirname(n.path);
  return new Set([n.title, n.name, n.name.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : ''].map(slug).filter(Boolean));
}

/**
 * The notes a project covers: itself, or for a folder's index.md, everything in that folder. Notes
 * elsewhere (a meeting in `meetings/`, say) belong too when their `project:` names the project.
 */
function scope(index: VaultIndex, n: Note): Note[] {
  const dir = n.name.toLowerCase() === 'index' ? dirname(n.path) : '';
  const names = projectNames(n);
  const out = new Map<string, Note>([[n.path, n]]);
  for (const x of index.notes.values()) {
    if (dir && x.path.startsWith(`${dir}/`)) out.set(x.path, x);
    else if (x.frontmatter.project !== undefined && !isProject(x)) {
      const ps = Array.isArray(x.frontmatter.project) ? x.frontmatter.project : [x.frontmatter.project];
      if (ps.some((v) => names.has(slug(v)))) out.set(x.path, x);
    }
  }
  return [...out.values()];
}

/** Not a real project: the hub opened on this path shows every task from every note, in or out of a project. */
export const ALL_PROJECTS = '*';

/** The notes a project covers: its folder, and notes elsewhere whose `project:` names it. */
export function projectNotes(index: VaultIndex, path: string): Note[] {
  if (path === ALL_PROJECTS) return [...index.notes.values()];
  const me = index.notes.get(path);
  return me ? scope(index, me) : [];
}

export function listProjects(index: VaultIndex): Project[] {
  const out: Project[] = [];
  for (const n of index.notes.values()) {
    if (!isProject(n)) continue;
    const covered = scope(index, n);
    const order = Number(n.frontmatter.sortOrder);
    out.push({
      path: n.path,
      title: n.title,
      active: isActive(n),
      sortOrder: n.frontmatter.sortOrder !== undefined && Number.isFinite(order) ? order : undefined,
      preview: n.preview,
      openTasks: covered.reduce((c, x) => c + x.tasks.filter((t) => t.state === ' ').length + (x.fileTask && !x.fileTask.done ? 1 : 0), 0),
      followups: covered.reduce((c, x) => c + x.followups.length, 0),
    });
  }
  out.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
      a.title.localeCompare(b.title),
  );
  let k = 0;
  for (const p of out) if (p.active) p.number = ++k;
  return out;
}

/** The notes and open tasks that belong to a project. */
export function projectContents(index: VaultIndex, path: string): { notes: Note[]; tasks: TaskItem[] } {
  const me = index.notes.get(path);
  if (!me) return { notes: [], tasks: [] };
  const covered = scope(index, me);
  const paths = new Set(covered.map((n) => n.path));
  return {
    notes: covered.filter((n) => n.path !== path).sort((a, b) => a.path.localeCompare(b.path)),
    tasks: index.tasks().filter((t) => paths.has(t.path) && !t.done),
  };
}

export function isProjectNote(n: Note): boolean {
  return isProject(n);
}

export interface FollowUp {
  path: string;
  line: number;
  title: string;
  /** Title of the note the follow-up is in. */
  from: string;
}

export function listFollowUps(index: VaultIndex): FollowUp[] {
  const out: FollowUp[] = [];
  for (const n of [...index.notes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const f of n.followups) out.push({ path: n.path, line: f.line, title: f.title, from: n.title });
  }
  return out;
}

/** Everything the project page shows, worked out from the notes. Nothing here is stored. */
export interface ProjectDashboard {
  /** The project's own note. Missing for the "All tasks" view, which belongs to no project. */
  note?: Note;
  title: string;
  active: boolean;
  /** The goal or first lines of the note. */
  summary: string;
  created?: string;
  /** Open tasks: late first, then by date, then undated. */
  open: TaskItem[];
  overdue: number;
  done: number;
  total: number;
  /** Notes in the project other than its own page, newest change first. */
  notes: Note[];
  followups: FollowUp[];
  /** People on its tasks and in its notes, most mentioned first. */
  people: { name: string; count: number }[];
  /** Tags used across it, most used first. */
  tags: { tag: string; count: number }[];
  /** When anything in the project last changed (ms), or 0. */
  lastChange: number;
}

/** `keep` lists task ids to leave in `open` although they are done, so a ticked task stays on screen, struck through. */
export function projectDashboard(index: VaultIndex, path: string, today: string, keep?: ReadonlySet<string>): ProjectDashboard | undefined {
  const me = index.notes.get(path);
  if (!me) return undefined;
  const covered = scope(index, me);
  const paths = new Set(covered.map((n) => n.path));
  const tasks = index.tasks().filter((t) => paths.has(t.path));
  const open = tasks
    .filter((t) => !t.done || keep?.has(t.id))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.path.localeCompare(b.path) || a.line - b.line);
  const who = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
  const tagCount = new Map<string, number>();
  for (const t of tasks) {
    for (const w of t.who) bump(who, w.replace(/^@/, '').toLowerCase());
  }
  for (const n of covered) {
    const ppl = n.frontmatter.people;
    for (const w of Array.isArray(ppl) ? ppl : ppl === undefined ? [] : [ppl]) if (String(w).trim()) bump(who, String(w).replace(/^@/, '').toLowerCase());
    for (const g of n.tags) bump(tagCount, g);
  }
  const rank = <K extends string>(m: Map<string, number>, key: K) =>
    [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, count]) => ({ [key]: k, count }));
  const goal = /^##\s+Goal\s*\n+([^\n#][^\n]*)/im.exec(me.text)?.[1]?.trim();
  const created = me.fileTask?.created ?? (typeof me.frontmatter.created === 'string' || typeof me.frontmatter.created === 'number' ? String(me.frontmatter.created).slice(0, 10) : undefined);
  return {
    note: me,
    title: me.title,
    active: isActive(me),
    summary: goal ?? me.preview,
    created,
    open,
    overdue: open.filter((t) => !t.done && t.due && t.due < today).length,
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
    notes: covered.filter((n) => n.path !== path && !n.fileTask).sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path)),
    followups: covered.flatMap((n) => n.followups.map((f) => ({ path: n.path, line: f.line, title: f.title, from: n.title }))),
    people: rank(who, 'name') as { name: string; count: number }[],
    tags: rank(tagCount, 'tag') as { tag: string; count: number }[],
    lastChange: covered.reduce((m, n) => Math.max(m, n.mtime), 0),
  };
}

/** The projects a note says it belongs to: `project: site` or `project: [site, kitchen]`. */
export function noteProjects(n: Note): string[] {
  const v = n.frontmatter.project;
  const list = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
  return list.map((x) => String(x).trim()).filter(Boolean);
}
