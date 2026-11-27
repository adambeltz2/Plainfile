import { normalizeDate } from './fields';
import { setFrontmatterField } from './frontmatter';
import { dirname, type TaskItem, type VaultIndex } from './index';
import type { Note } from './parse';
import type { VaultStorage } from './storage';
import type { ChangeResult } from './writeback';

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
  /** For a sub-project, the path of the project whose folder holds it. Sub-projects are one level deep: a project deeper down belongs to the outermost one. */
  parent?: string;
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

const slug = (v: unknown): string =>
  String(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The names a note's `project:` value can use to point at a project: its title, folder and file name. */
function projectNames(n: Note): Set<string> {
  const dir = dirname(n.path);
  return new Set([n.title, n.name, n.name.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : ''].map(slug).filter(Boolean));
}

/**
 * The notes a project covers: itself, or for a folder's index.md, everything in that folder. Notes
 * elsewhere (a meeting in `meetings/`, say) belong too when their `project:` names the project.
 */
function scope(index: VaultIndex, n: Note, withSub = true): Note[] {
  const hit = scopes(index);
  const list = (withSub ? hit.full : hit.own).get(n.path);
  // A note that is not a project has no entry: it covers itself and the notes that name it.
  return list ? [...list] : [...scopeOwn(index, n).values()]; // a copy, so a caller cannot change the shared list
}

/** What every project covers, by itself and with its sub-projects. Worked out once per change to the index: the hub asks for it once per project. */
const scopeCache = new WeakMap<VaultIndex, { version: number; own: Map<string, Note[]>; full: Map<string, Note[]> }>();
function scopes(index: VaultIndex): { own: Map<string, Note[]>; full: Map<string, Note[]> } {
  const hit = scopeCache.get(index);
  if (hit?.version === index.version) return hit;
  const own = new Map<string, Note[]>();
  const full = new Map<string, Note[]>();
  const maps = ownScopes(index);
  const children = new Map<string, string[]>();
  for (const [child, parent] of parentMap(index)) children.set(parent, [...(children.get(parent) ?? []), child]);
  for (const [path, m] of maps) {
    own.set(path, [...m.values()]);
    const merged = new Map(m);
    for (const c of children.get(path) ?? []) for (const [cp, x] of maps.get(c) ?? []) merged.set(cp, x);
    full.set(path, [...merged.values()]);
  }
  const made = { version: index.version, own, full };
  scopeCache.set(index, made);
  return made;
}

/** The outermost project that holds each sub-project's folder: sub-project path to parent path. Only folder projects (an `index` note) nest. */
const parentCache = new WeakMap<VaultIndex, { version: number; map: Map<string, string> }>();
function parentMap(index: VaultIndex): Map<string, string> {
  const hit = parentCache.get(index);
  if (hit?.version === index.version) return hit.map;
  const map = buildParentMap(index);
  parentCache.set(index, { version: index.version, map });
  return map;
}

function buildParentMap(index: VaultIndex): Map<string, string> {
  const dirs = new Map<string, Note>();
  for (const n of index.notes.values()) {
    const dir = dirname(n.path);
    if (dir && n.name.toLowerCase() === 'index' && isProject(n)) dirs.set(dir, n);
  }
  const out = new Map<string, string>();
  for (const [dir, n] of dirs) {
    let up = dirname(dir);
    let top: Note | undefined;
    while (up) {
      top = dirs.get(up) ?? top;
      up = dirname(up);
    }
    if (top) out.set(n.path, top.path);
  }
  return out;
}

/** The projects a note names in its `project:` value, as slugs. A parsed note never changes (an edit makes a new one), so this is worked out once per note. */
const slugCache = new WeakMap<Note, string[]>();
function namedProjects(x: Note): string[] {
  let hit = slugCache.get(x);
  if (!hit) {
    const v = x.frontmatter.project;
    hit = v === undefined || isProject(x) ? [] : (Array.isArray(v) ? v : [v]).map(slug);
    slugCache.set(x, hit);
  }
  return hit;
}

/** What a project covers by itself: its folder and the notes elsewhere that name it. */
function scopeOwn(index: VaultIndex, n: Note): Map<string, Note> {
  const dir = n.name.toLowerCase() === 'index' ? dirname(n.path) : '';
  const names = projectNames(n);
  const out = new Map<string, Note>([[n.path, n]]);
  for (const x of index.notes.values()) {
    if (dir && x.path.startsWith(`${dir}/`)) out.set(x.path, x);
    else if (namedProjects(x).some((v) => names.has(v))) out.set(x.path, x);
  }
  return out;
}

/**
 * What every project covers by itself, worked out in one pass over the notes (asking `scopeOwn` once per project
 * reads every note once per project, which is slow in a big folder). The same rule: a folder project covers the
 * notes inside its folder, and any project covers the notes elsewhere whose `project:` names it.
 */
function ownScopes(index: VaultIndex): Map<string, Map<string, Note>> {
  const out = new Map<string, Map<string, Note>>();
  const byDir = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  for (const n of index.notes.values()) {
    if (!isProject(n)) continue;
    out.set(n.path, new Map([[n.path, n]]));
    if (n.name.toLowerCase() === 'index') {
      const dir = dirname(n.path);
      byDir.set(dir, [...(byDir.get(dir) ?? []), n.path]);
    }
    for (const nm of projectNames(n)) byName.set(nm, [...(byName.get(nm) ?? []), n.path]);
  }
  for (const x of index.notes.values()) {
    for (let d = dirname(x.path); d; d = dirname(d)) for (const pp of byDir.get(d) ?? []) out.get(pp)?.set(x.path, x);
    for (const nm of namedProjects(x)) for (const pp of byName.get(nm) ?? []) out.get(pp)?.set(x.path, x);
  }
  return out;
}

/** Not a real project: the hub opened on this path shows every task from every note, in or out of a project. */
export const ALL_PROJECTS = '*';

/** The notes a project covers: its folder, and notes elsewhere whose `project:` names it. */
export function projectNotes(index: VaultIndex, path: string, own = false): Note[] {
  if (path === ALL_PROJECTS) return [...index.notes.values()];
  const me = index.notes.get(path);
  return me ? scope(index, me, !own) : [];
}

/** Every project, numbered and ordered. Worked out once per change to the index (it is asked for on most renders), and handed out as copies. */
const listCache = new WeakMap<VaultIndex, { version: number; list: Project[] }>();
export function listProjects(index: VaultIndex): Project[] {
  let hit = listCache.get(index);
  if (hit?.version !== index.version) {
    hit = { version: index.version, list: buildProjects(index) };
    listCache.set(index, hit);
  }
  return hit.list.map((p) => ({ ...p }));
}

function buildProjects(index: VaultIndex): Project[] {
  const out: Project[] = [];
  const parents = parentMap(index);
  const { full } = scopes(index);
  for (const n of index.notes.values()) {
    if (!isProject(n)) continue;
    const covered = full.get(n.path) ?? [n];
    const order = Number(n.frontmatter.sortOrder);
    out.push({
      path: n.path,
      title: n.title,
      active: isActive(n),
      sortOrder: n.frontmatter.sortOrder !== undefined && Number.isFinite(order) ? order : undefined,
      parent: parents.get(n.path),
      preview: n.preview,
      openTasks: covered.reduce((c, x) => c + x.tasks.filter((t) => t.state === ' ').length + (x.fileTask && !x.fileTask.done ? 1 : 0), 0),
      followups: covered.reduce((c, x) => c + x.followups.length, 0),
    });
  }
  const byOrder = (a: Project, b: Project): number =>
    Number(b.active) - Number(a.active) || (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) || a.title.localeCompare(b.title);
  const tops = out.filter((p) => !p.parent).sort(byOrder);
  let k = 0;
  for (const p of tops) if (p.active) p.number = ++k; // only top-level projects are numbered
  const subs = out.filter((p) => p.parent).sort(byOrder);
  return tops.flatMap((t) => [t, ...subs.filter((x) => x.parent === t.path)]);
}

/** The sub-projects of a project, in the order they are listed. */
export function subProjects(index: VaultIndex, path: string): Project[] {
  return listProjects(index).filter((p) => p.parent === path);
}

/** The sub-projects of a project that are not closed out yet. A project with any of these cannot be closed out. */
export function openSubProjects(index: VaultIndex, path: string): Project[] {
  return subProjects(index, path).filter((p) => p.active);
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
  /** When it was closed out (`completed:`), if it was. */
  completed?: string;
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
  const created =
    me.fileTask?.created ??
    (typeof me.frontmatter.created === 'string' || typeof me.frontmatter.created === 'number' ? String(me.frontmatter.created).slice(0, 10) : undefined);
  return {
    note: me,
    title: me.title,
    active: isActive(me),
    summary: goal ?? me.preview,
    created,
    completed: normalizeDate(me.frontmatter.completed),
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

/** Whether a project has been closed out: `active: false`. Such a project is archived, not deleted. */
export const isArchived = (n: Note): boolean => !isActive(n);

/**
 * Close out a project (`active: false` and `completed: <date>`) or reopen it (`active: true`, no `completed`).
 * Only those two frontmatter lines change, and the write is guarded by the file's modified time. Nothing moves.
 */
export async function setProjectActive(storage: VaultStorage, index: VaultIndex, path: string, active: boolean, today: string): Promise<ChangeResult> {
  const note = index.notes.get(path);
  if (!note) throw new Error(`No such project: ${path}`);
  if (!active) {
    const open = openSubProjects(index, path);
    if (open.length) throw new Error(`Close out its sub-project${open.length === 1 ? '' : 's'} first: ${open.map((p) => p.title).join(', ')}.`);
  }
  const stat = await storage.stat(path);
  const text = await storage.read(path);
  let next = setFrontmatterField(text, 'active', active ? 'true' : 'false');
  next = setFrontmatterField(next, 'completed', active ? null : today);
  if (next === text) return { path, line: 1, before: '', after: '', written: false };
  const a = text.split('\n');
  const b = next.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  await storage.write(path, next, stat.mtime);
  await index.refreshFile(path);
  const strip = (l: string | undefined): string => (l ?? '').replace(/\r$/, '');
  return { path, line: i + 1, before: strip(a[i]), after: strip(b[i]), written: true };
}
