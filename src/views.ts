import { newFilters, type Filters, type GroupBy } from './hub';
import { ExistsError, type VaultStorage } from './storage';

/**
 * Saved views of the project hub: a name, how tasks are grouped and which filters are on. Each is a small
 * JSON file in `.plainfile/views/`, so views travel with the folder and need no database.
 */
export const VIEWS_DIR = '.plainfile/views';

export interface SavedView {
  name: string;
  groupBy: GroupBy;
  filters: Filters;
}

const GROUPS: GroupBy[] = ['due', 'status', 'person', 'tag', 'phase', 'note'];
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'view';

export function viewPath(name: string): string {
  return `${VIEWS_DIR}/${slug(name)}.json`;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** A view read from text, with anything unknown dropped. Undefined if it is not a view at all. */
export function parseView(text: string): SavedView | undefined {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const name = typeof j.name === 'string' ? j.name.trim() : '';
    if (!name) return undefined;
    const f = (j.filters ?? {}) as Record<string, unknown>;
    const filters = newFilters(f.hideDone !== false);
    filters.text = typeof f.text === 'string' ? f.text : '';
    filters.people = strings(f.people);
    filters.tags = strings(f.tags);
    filters.phases = strings(f.phases);
    filters.statuses = strings(f.statuses).filter((s): s is 'todo' | 'doing' | 'waiting' | 'done' => ['todo', 'doing', 'waiting', 'done'].includes(s));
    if (f.due === 'overdue' || f.due === 'week' || f.due === 'none') filters.due = f.due;
    return { name, groupBy: GROUPS.includes(j.groupBy as GroupBy) ? (j.groupBy as GroupBy) : 'due', filters };
  } catch {
    return undefined;
  }
}

export function serializeView(v: SavedView): string {
  return `${JSON.stringify({ name: v.name, groupBy: v.groupBy, filters: v.filters }, null, 2)}\n`;
}

export async function listViews(storage: VaultStorage): Promise<SavedView[]> {
  const out: SavedView[] = [];
  for (const f of await storage.listDir(VIEWS_DIR)) {
    if (!f.path.endsWith('.json')) continue;
    const v = parseView(await storage.read(f.path).catch(() => ''));
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Save a view, replacing one with the same name. */
export async function saveView(storage: VaultStorage, view: SavedView): Promise<void> {
  const path = viewPath(view.name);
  try {
    await storage.create(path, serializeView(view));
  } catch (e) {
    if (!(e instanceof ExistsError)) throw e;
    await storage.write(path, serializeView(view), (await storage.stat(path)).mtime);
  }
}

export async function deleteView(storage: VaultStorage, name: string): Promise<void> {
  const path = viewPath(name);
  await storage.remove(path, (await storage.stat(path)).mtime);
}
