import type { VaultIndex } from './index';

/** What the vault actually uses: which tags, and which frontmatter keys with example values. */
export interface KeyUse {
  key: string;
  /** How many notes have this key. */
  count: number;
  /** Up to three different example values, as they would be written. */
  samples: string[];
}

function show(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => String(x)).join(', ')}]`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function frontmatterKeys(index: VaultIndex): KeyUse[] {
  const map = new Map<string, { count: number; samples: Map<string, number> }>();
  for (const n of index.notes.values()) {
    for (const [key, value] of Object.entries(n.frontmatter)) {
      const e = map.get(key) ?? { count: 0, samples: new Map<string, number>() };
      e.count++;
      const s = show(value).slice(0, 40);
      e.samples.set(s, (e.samples.get(s) ?? 0) + 1);
      map.set(key, e);
    }
  }
  return [...map]
    .map(([key, e]) => ({
      key,
      count: e.count,
      samples: [...e.samples].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([s]) => s),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function tagCounts(index: VaultIndex): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const n of index.notes.values()) for (const t of new Set(n.tags)) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/* ---------- suggestions: what already exists, so it can be offered while typing ---------- */

export interface Suggestion {
  name: string;
  count: number;
}

function ranked(m: Map<string, number>): Suggestion[] {
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function bump(m: Map<string, number>, name: string, by = 1): void {
  const n = name.trim();
  if (n) m.set(n, (m.get(n) ?? 0) + by);
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,\s]+/) : []);

/** People already in the vault: @names on tasks, `people`/`attendees` frontmatter, and person notes. */
export function peopleNames(index: VaultIndex): Suggestion[] {
  const m = new Map<string, number>();
  const clean = (s: string): string => s.trim().replace(/^@/, '').toLowerCase().replace(/\s+/g, '-');
  for (const t of index.tasks()) for (const w of t.who) bump(m, clean(w));
  for (const n of index.notes.values()) {
    for (const key of ['people', 'attendees', 'owner', 'assignee']) for (const p of asList(n.frontmatter[key])) bump(m, clean(p));
    if (n.type === 'person') bump(m, clean(n.name), 2);
  }
  return ranked(m);
}

/** Tag names, most used first. */
export function tagNames(index: VaultIndex): Suggestion[] {
  return tagCounts(index).map((t) => ({ name: t.tag, count: t.count }));
}

/** Projects already in the vault: `project:` values and the folder of each project's index note. */
export function projectNames(index: VaultIndex): Suggestion[] {
  const m = new Map<string, number>();
  for (const n of index.notes.values()) {
    const p = n.frontmatter.project;
    if (typeof p === 'string') bump(m, p);
    const isProject = n.type === 'project' || n.frontmatter.active !== undefined || n.frontmatter.sortOrder !== undefined;
    if (isProject) {
      const dir = n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : '';
      bump(m, n.name.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : n.name, 2);
    }
  }
  return ranked(m);
}

const KNOWN_STATUSES = ['todo', 'doing', 'waiting', 'done'];
const KNOWN_TYPES = ['project', 'meeting', 'journal', 'person', 'task', 'research', 'reference'];

/** Values already used for a frontmatter key, plus the common ones for `status` and `type`. */
export function valueNames(index: VaultIndex, key: string): Suggestion[] {
  const m = new Map<string, number>();
  for (const n of index.notes.values()) {
    const v = n.frontmatter[key];
    if (Array.isArray(v)) for (const x of v) bump(m, String(x));
    else if (typeof v === 'string' || typeof v === 'number') bump(m, String(v));
  }
  const base = key === 'status' ? KNOWN_STATUSES : key === 'type' ? KNOWN_TYPES : [];
  for (const b of base) if (!m.has(b)) m.set(b, 0);
  return ranked(m);
}

/** What the type-ahead offers for a field kind. */
export type SuggestKind = 'people' | 'tags' | 'projects' | 'types' | 'statuses';
export function suggestionsFor(index: VaultIndex, kind: SuggestKind): Suggestion[] {
  switch (kind) {
    case 'people':
      return peopleNames(index);
    case 'tags':
      return tagNames(index);
    case 'projects':
      return projectNames(index);
    case 'types':
      return valueNames(index, 'type');
    case 'statuses':
      return valueNames(index, 'status');
  }
}

/** Options that start with what was typed first, then ones that contain it. Skips names already used. */
export function matchSuggestions(options: Suggestion[], token: string, exclude: string[] = [], limit = 8): string[] {
  const q = token.trim().replace(/^[#@]/, '').toLowerCase();
  const used = new Set(exclude.map((x) => x.replace(/^[#@]/, '').toLowerCase()));
  const pool = options.filter((o) => !used.has(o.name.toLowerCase()));
  const starts = pool.filter((o) => o.name.toLowerCase().startsWith(q));
  const contains = q ? pool.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q)) : [];
  return [...starts, ...contains].slice(0, limit).map((o) => o.name);
}

/** The field kind a template prompt probably wants, from its name. */
export function kindForPrompt(id: string): SuggestKind | undefined {
  const k = id.toLowerCase();
  if (/^(project|projects)$/.test(k)) return 'projects';
  if (/^(people|person|attendees|owner|assignee|who|with)$/.test(k)) return 'people';
  if (/^(tags?|labels?)$/.test(k)) return 'tags';
  if (k === 'type') return 'types';
  if (k === 'status') return 'statuses';
  return undefined;
}

export interface LinkTarget {
  /** What to show: the note's title. */
  label: string;
  /** Its path, shown beside the title. */
  detail: string;
  /** What goes between [[ and ]]: the shortest text that reaches it from the note being edited. */
  insert: string;
}

/** Notes (and their aliases) a [[link]] can point at, for completion while typing in `sourcePath`. */
export function linkTargets(index: VaultIndex, sourcePath: string, bestTarget: (source: string, target: string) => string): LinkTarget[] {
  const out: LinkTarget[] = [];
  for (const n of [...index.notes.values()].sort((a, b) => a.title.localeCompare(b.title))) {
    if (n.path === sourcePath) continue;
    const insert = bestTarget(sourcePath, n.path);
    out.push({ label: n.title, detail: n.path, insert });
    for (const a of n.aliases) if (a.toLowerCase() !== n.title.toLowerCase()) out.push({ label: a, detail: `alias of ${n.title}`, insert: a });
  }
  return out;
}
