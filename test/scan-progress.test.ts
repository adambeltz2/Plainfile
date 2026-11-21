import { describe, expect, it } from 'vitest';
import { VaultIndex, type ScanProgress } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { AbortedError, mapPool } from '../src/pool';

function vault(n: number): MemoryStorage {
  const files: Record<string, string> = {};
  for (let i = 0; i < n; i++) files[`n/note-${i}.md`] = `Note ${i} [[note-${(i + 1) % n}]]`;
  return new MemoryStorage(files);
}

describe('scan progress', () => {
  it('reports how many notes have been read, up to the total', async () => {
    const events: ScanProgress[] = [];
    await new VaultIndex(vault(120)).scan({ onProgress: (p) => events.push(p) });
    const reading = events.filter((e): e is Extract<ScanProgress, { phase: 'reading' }> => e.phase === 'reading');
    expect(reading[0]).toEqual({ phase: 'reading', done: 0, total: 120 });
    expect(reading.at(-1)).toEqual({ phase: 'reading', done: 120, total: 120 });
    for (let i = 1; i < reading.length; i++) expect(reading[i]!.done).toBeGreaterThanOrEqual(reading[i - 1]!.done);
  });

  it('only counts notes that changed on a rescan', async () => {
    const store = vault(50);
    const index = new VaultIndex(store);
    await index.scan();
    store.external('n/note-3.md', 'edited');
    const events: ScanProgress[] = [];
    await index.scan({ onProgress: (p) => events.push(p) });
    expect(events.at(-1)).toEqual({ phase: 'reading', done: 1, total: 1 });
  });

  it('can be cancelled part-way, and says so', async () => {
    const ctrl = new AbortController();
    const store = vault(400);
    const realRead = store.read.bind(store);
    let reads = 0;
    store.read = async (path: string) => {
      if (++reads === 20) ctrl.abort();
      return realRead(path);
    };
    const index = new VaultIndex(store);
    await expect(index.scan({ signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reads).toBeLessThan(400);
  });

  it('does not start at all if it is cancelled first', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(new VaultIndex(vault(5)).scan({ signal: ctrl.signal })).rejects.toBeInstanceOf(AbortedError);
  });
});

describe('mapPool', () => {
  it('runs everything but never more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await mapPool([...Array(40).keys()], 6, async (i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1 + (i % 3)));
      running--;
      done.push(i);
    });
    expect(done).toHaveLength(40);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles an empty list', async () => {
    await mapPool([], 4, async () => undefined);
  });
});
