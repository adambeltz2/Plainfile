import type { VaultIndex } from './index';
import { ConflictError, ExistsError, type VaultStorage } from './storage';

/**
 * Deleting a note. By default it is moved to `.plainfile/trash/` with its original path in the
 * file name, so it can be put back. Permanent deletion is a separate choice. Either way the
 * delete is guarded: if the note changed on disk since it was read, nothing is removed.
 */
export const TRASH_DIR = '.plainfile/trash';

export interface DeletePlan {
  path: string;
  title: string;
  /** Notes that link here. Those links will point nowhere afterwards. */
  linkedFrom: { path: string; line: number }[];
  openTasks: number;
  /** A project's index note covers its folder, so deleting it removes the project card. */
  isProjectIndex: boolean;
  trashPath: string;
  /** The modified time the app last saw. The note is only deleted if the file still has it. */
  mtime: number;
}

export interface DeleteResult {
  path: string;
  /** Where the copy went, when it was moved to the trash. */
  trashedTo?: string;
}

export interface TrashItem {
  trashPath: string;
  originalPath: string;
  /** When it was deleted, as written in the file name. */
  stamp: string;
  size: number;
}

/** "2026-11-21T04-12-00__projects%2Fsite%2Fkickoff.md": the stamp, then the original path. */
export function trashName(path: string, stamp: string): string {
  return `${stamp}__${encodeURIComponent(path)}`;
}

export function parseTrashName(name: string): { stamp: string; originalPath: string } | undefined {
  const i = name.indexOf('__');
  if (i < 0) return undefined;
  try {
    return { stamp: name.slice(0, i), originalPath: decodeURIComponent(name.slice(i + 2)) };
  } catch {
    return undefined;
  }
}

export function planDelete(index: VaultIndex, path: string, stamp: string): DeletePlan {
  const note = index.notes.get(path);
  if (!note) throw new Error(`No such note: ${path}`);
  const seen = new Set<string>();
  const linkedFrom = index
    .backlinks(path)
    .filter((b) => (seen.has(`${b.from}:${b.line}`) ? false : !!seen.add(`${b.from}:${b.line}`)))
    .map((b) => ({ path: b.from, line: b.line }));
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  return {
    path,
    title: note.title,
    linkedFrom,
    openTasks: index.tasks().filter((t) => t.path === path && !t.done).length,
    isProjectIndex:
      note.name.toLowerCase() === 'index' &&
      !!dir &&
      (note.type === 'project' || note.frontmatter.active !== undefined || note.frontmatter.sortOrder !== undefined),
    trashPath: `${TRASH_DIR}/${trashName(path, stamp)}`,
    mtime: note.mtime,
  };
}

async function createUnique(storage: VaultStorage, path: string, content: string): Promise<string> {
  const dot = path.lastIndexOf('.');
  const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const p = n === 1 ? path : `${base} (${n})${ext}`;
    try {
      await storage.create(p, content);
      return p;
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error(`Could not find a free name for ${path}`);
}

export async function deleteNote(storage: VaultStorage, index: VaultIndex, plan: DeletePlan, opts: { trash: boolean }): Promise<DeleteResult> {
  const stat = await storage.stat(plan.path);
  // Compare with what the app last showed, so a change made before this click is noticed too.
  if (stat.mtime !== plan.mtime) throw new ConflictError(plan.path);
  let trashedTo: string | undefined;
  if (opts.trash) trashedTo = await createUnique(storage, plan.trashPath, await storage.read(plan.path));
  try {
    await storage.remove(plan.path, stat.mtime);
  } catch (e) {
    // The note changed while we were deleting it. Keep it, and do not leave a stale copy behind.
    if (trashedTo) {
      try {
        await storage.remove(trashedTo, (await storage.stat(trashedTo)).mtime);
      } catch {
        /* a leftover copy in the trash is harmless */
      }
    }
    throw e;
  }
  await index.scan();
  return { path: plan.path, trashedTo };
}

/** Everything in the trash, newest first. */
export async function listTrash(storage: VaultStorage): Promise<TrashItem[]> {
  const out: TrashItem[] = [];
  for (const f of await storage.listDir(TRASH_DIR)) {
    const parsed = parseTrashName(f.path.slice(TRASH_DIR.length + 1));
    if (parsed) out.push({ trashPath: f.path, originalPath: parsed.originalPath, stamp: parsed.stamp, size: f.size });
  }
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp) || a.originalPath.localeCompare(b.originalPath));
}

/** Put a trashed note back where it was, or beside it with a number if something is there now. */
export async function restoreNote(storage: VaultStorage, index: VaultIndex, item: TrashItem): Promise<string> {
  const stat = await storage.stat(item.trashPath);
  const restored = await createUnique(storage, item.originalPath, await storage.read(item.trashPath));
  await storage.remove(item.trashPath, stat.mtime);
  await index.scan();
  return restored;
}

/** Remove one item from the trash for good. */
export async function purgeTrashItem(storage: VaultStorage, item: TrashItem): Promise<void> {
  await storage.remove(item.trashPath, (await storage.stat(item.trashPath)).mtime);
}
