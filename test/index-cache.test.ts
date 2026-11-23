import { describe, expect, it } from 'vitest';
import { VaultIndex, type IndexCache } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import type { Note } from '../src/parse';

/** A cache kept in memory, to show what the index asks of it. */
class MemCache implements IndexCache {
  saved = new Map<string, Note>();
  parserOk = true;
  async load(): Promise<Note[]> {
    return this.parserOk ? [...this.saved.values()].map((n) => structuredClone(n)) : [];
  }
  async put(notes: Note[]): Promise<void> {
    for (const n of notes) this.saved.set(n.path, structuredClone(n));
  }
  async remove(paths: string[]): Promise<void> {
    for (const p of paths) this.saved.delete(p);
  }
}

function counting(files: Record<string, string>) {
  const store = new MemoryStorage(files);
  const reads: string[] = [];
  const real = store.read.bind(store);
  store.read = async (p: string) => {
    reads.push(p);
    return real(p);
  };
  return { store, reads };
}
const settle = () => new Promise((r) => setTimeout(r, 5)); // saving to the cache is not awaited by the scan

const FILES: Record<string, string> = { 'a.md': '# A\n- [ ] Task due:2026-11-21', 'b/c.md': 'See [[a]] #tag', 'img/p.png': 'x' };

describe('saved index', () => {
  it('saves what it reads, and a second open reads nothing that is unchanged', async () => {
    const cache = new MemCache();
    const first = counting(FILES);
    const i1 = new VaultIndex(first.store, cache);
    await i1.scan();
    await settle();
    expect(first.reads.sort()).toEqual(['a.md', 'b/c.md']);
    expect([...cache.saved.keys()].sort()).toEqual(['a.md', 'b/c.md']);

    const second = new MemoryStorage(FILES);
    const reads: string[] = [];
    const real = second.read.bind(second);
    second.read = async (p) => (reads.push(p), real(p));
    // Same files, same times: carry the first store's times over by sharing it.
    const i2 = new VaultIndex(first.store, cache);
    first.reads.length = 0;
    const r = await i2.scan();
    expect(first.reads).toEqual([]);
    expect(i2.fromCache).toBe(2);
    expect(r.unchanged).toBe(2);
    expect(i2.tasks()).toHaveLength(1);
    expect(i2.backlinks('a.md')).toHaveLength(1);
    expect(i2.notes.get('b/c.md')?.tags).toEqual(['tag']);
  });

  it('re-reads only the notes that changed, adds new ones, and drops deleted ones from the cache', async () => {
    const cache = new MemCache();
    const { store, reads } = counting(FILES);
    await new VaultIndex(store, cache).scan();
    await settle();
    store.external('a.md', '# A edited');
    store.external('new.md', 'new');
    store.externalRemove('b/c.md');
    reads.length = 0;
    const i = new VaultIndex(store, cache);
    const r = await i.scan();
    await settle();
    expect(reads.sort()).toEqual(['a.md', 'new.md']);
    expect(r.added).toEqual(['a.md', 'new.md']); // a fresh index has not seen either one
    expect(i.notes.has('b/c.md')).toBe(false);
    expect([...cache.saved.keys()].sort()).toEqual(['a.md', 'new.md']);
    expect(cache.saved.get('a.md')?.title).toBe('A edited');
  });

  it('is ignored when the parser version changed, and when it cannot be read', async () => {
    const cache = new MemCache();
    const { store, reads } = counting(FILES);
    await new VaultIndex(store, cache).scan();
    await settle();
    cache.parserOk = false;
    reads.length = 0;
    await new VaultIndex(store, cache).scan();
    expect(reads.sort()).toEqual(['a.md', 'b/c.md']);
    const broken: IndexCache = {
      load: async () => Promise.reject(new Error('blocked')),
      put: async () => Promise.reject(new Error('blocked')),
      remove: async () => undefined,
    };
    const i = new VaultIndex(store, broken);
    await i.scan();
    await settle();
    expect(i.notes.size).toBe(2);
  });

  it('never serves a note whose file changed size or time, and a rescan does not touch the cache again', async () => {
    const cache = new MemCache();
    const { store } = counting(FILES);
    await new VaultIndex(store, cache).scan();
    await settle();
    cache.saved.set('a.md', { ...cache.saved.get('a.md')!, size: 999 });
    const i = new VaultIndex(store, cache);
    await i.scan();
    expect(i.fromCache).toBe(1); // only b/c.md matched
    expect(i.notes.get('a.md')?.title).toBe('A');
    const before = i.fromCache;
    await i.scan();
    expect(i.fromCache).toBe(before);
  });
});
