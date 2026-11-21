import { dirname, type VaultIndex } from './index';
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

/** The notes a project covers: itself, or for a folder's index.md, everything in that folder. */
function scope(index: VaultIndex, n: Note): Note[] {
  if (n.name.toLowerCase() !== 'index') return [n];
  const dir = dirname(n.path);
  if (!dir) return [n];
  return [...index.notes.values()].filter((x) => x.path.startsWith(`${dir}/`));
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
