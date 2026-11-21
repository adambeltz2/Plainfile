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
export interface RecentGroup {
  label: string;
  items: RecentItem[];
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

/** Group by when it changed: Today, Yesterday, Earlier this week (last 7 days), then by month. */
export function groupRecent(items: RecentItem[], today: string): RecentGroup[] {
  const yesterday = addDays(today, -1);
  const weekStart = addDays(today, -6);
  const groups: RecentGroup[] = [];
  for (const it of items) {
    const label = it.date >= today ? 'Today' : it.date === yesterday ? 'Yesterday' : it.date >= weekStart ? 'Earlier this week' : monthLabel(it.date);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthLabel(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`;
}
