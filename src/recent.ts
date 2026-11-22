import { addDays } from './query';
import { localDateOf } from './dates';
import type { VaultIndex } from './index';

export interface RecentItem {
  path: string;
  title: string;
  mtime: number;
  date: string;
  task: boolean;
  project?: string;
}
/** Every note, newest change first. `query` matches the title or path. Task notes are included and marked. */
export function recentNotes(index: VaultIndex, query = ''): RecentItem[] {
  const q = query.trim().toLowerCase();
  const out: RecentItem[] = [];
  for (const n of index.notes.values()) {
    if (q && !n.title.toLowerCase().includes(q) && !n.path.toLowerCase().includes(q)) continue;
    const p = n.frontmatter.project;
    out.push({ path: n.path, title: n.title, mtime: n.mtime, date: localDateOf(n.mtime), task: !!n.fileTask, project: typeof p === 'string' && p ? p : undefined });
  }
  return out.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
}

/** "Today 22:54", "Yesterday 22:54", or "Mon 17 Nov 22:54" style pieces: the day word (or date) and the time. */
export function whenParts(it: RecentItem, today: string, fmt: (iso: string) => string): { day: string; time: string } {
  const d = new Date(it.mtime);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = it.date >= today ? 'Today' : it.date === addDays(today, -1) ? 'Yesterday' : fmt(it.date);
  return { day, time };
}

/** The folder a note lives in, or an empty string at the top level. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}
