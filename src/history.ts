import { ExistsError, type VaultStorage } from './storage';

/**
 * A local safety net. Before the app overwrites a note, the previous content is kept in
 * `.plainfile/history/<note path>/` so a mistake can be undone even after the note is closed.
 * The first save in a session always keeps one, then at most one every few minutes, and only the
 * newest 30 per note are kept. Snapshots live in a hidden folder, so they are not part of the vault.
 */
export const HISTORY_DIR = '.plainfile/history';
export const KEEP_VERSIONS = 30;
export const SNAPSHOT_GAP_MS = 5 * 60 * 1000;

export interface Version {
  /** Where the snapshot is stored. */
  path: string;
  notePath: string;
  /** When it was taken, e.g. 2026-11-21T04-12-00 (UTC). */
  stamp: string;
  size: number;
}

export const versionDir = (notePath: string): string => `${HISTORY_DIR}/${encodeURIComponent(notePath)}`;

export function stampNow(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace(/:/g, '-');
}

/** The moment a stamp such as 2026-11-21T04-12-00 names. */
export function stampToDate(stamp: string): Date {
  return new Date(`${stamp.slice(0, 10)}T${stamp.slice(11, 19).replace(/-/g, ':')}Z`);
}

export function shouldSnapshot(lastAt: number | undefined, now: number, gap: number = SNAPSHOT_GAP_MS): boolean {
  return lastAt === undefined || now - lastAt >= gap;
}

/** Saved versions of a note, newest first. */
export async function listVersions(storage: VaultStorage, notePath: string): Promise<Version[]> {
  const dir = versionDir(notePath);
  const out: (Version & { n: number })[] = [];
  for (const f of await storage.listDir(dir)) {
    const m = /\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(?:-(\d+))?\.md$/.exec(f.path);
    if (m) out.push({ path: f.path, notePath, stamp: m[1] as string, size: f.size, n: Number(m[2] ?? 1) });
  }
  // Same second: the one with the higher number was taken later.
  return out.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.n - a.n).map(({ n: _n, ...v }) => v);
}

export function readVersion(storage: VaultStorage, v: Version): Promise<string> {
  return storage.read(v.path);
}

/**
 * Keep `content` as a version of the note. Does nothing if it is identical to the newest one.
 * Returns true if a snapshot was written.
 */
export async function snapshot(
  storage: VaultStorage,
  notePath: string,
  content: string,
  stamp: string = stampNow(),
  keep: number = KEEP_VERSIONS,
): Promise<boolean> {
  const existing = await listVersions(storage, notePath);
  const newest = existing[0];
  if (newest && (await storage.read(newest.path)) === content) return false;
  const dir = versionDir(notePath);
  for (let n = 1; n < 1000; n++) {
    try {
      await storage.create(`${dir}/${stamp}${n === 1 ? '' : `-${n}`}.md`, content);
      break;
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  const all = await listVersions(storage, notePath);
  for (const old of all.slice(keep)) {
    try {
      await storage.remove(old.path, (await storage.stat(old.path)).mtime);
    } catch {
      /* an old snapshot that will not go is harmless */
    }
  }
  return true;
}
