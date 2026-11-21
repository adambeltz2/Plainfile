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
