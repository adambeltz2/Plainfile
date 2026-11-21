import { describe, expect, it } from 'vitest';
import { HISTORY_DIR, listVersions, readVersion, shouldSnapshot, snapshot, stampNow, stampToDate, versionDir } from '../src/history';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

describe('history', () => {
  it('keeps a snapshot, lists newest first, and reads it back', async () => {
    const store = new MemoryStorage();
    expect(await snapshot(store, 'notes/a b.md', 'one', '2026-11-21T04-00-00')).toBe(true);
    expect(await snapshot(store, 'notes/a b.md', 'two', '2026-11-21T04-10-00')).toBe(true);
    const v = await listVersions(store, 'notes/a b.md');
    expect(v.map((x) => x.stamp)).toEqual(['2026-11-21T04-10-00', '2026-11-21T04-00-00']);
    expect(v[0]!.path.startsWith(`${HISTORY_DIR}/notes%2Fa%20b.md/`)).toBe(true);
    expect(await readVersion(store, v[1]!)).toBe('one');
    expect(await listVersions(store, 'other.md')).toEqual([]);
  });

  it('skips a snapshot identical to the newest, and never overwrites one taken in the same second', async () => {
    const store = new MemoryStorage();
    await snapshot(store, 'a.md', 'same', '2026-11-21T04-00-00');
    expect(await snapshot(store, 'a.md', 'same', '2026-11-21T04-05-00')).toBe(false);
    expect(await snapshot(store, 'a.md', 'different', '2026-11-21T04-00-00')).toBe(true);
    const v = await listVersions(store, 'a.md');
    expect(v).toHaveLength(2);
    expect(await Promise.all(v.map((x) => readVersion(store, x)))).toEqual(['different', 'same']);
  });

  it('keeps only the newest versions', async () => {
    const store = new MemoryStorage();
    for (let i = 1; i <= 6; i++) await snapshot(store, 'a.md', `v${i}`, `2026-11-21T04-0${i}-00`, 3);
    const v = await listVersions(store, 'a.md');
    expect(v.map((x) => x.stamp)).toEqual(['2026-11-21T04-06-00', '2026-11-21T04-05-00', '2026-11-21T04-04-00']);
    expect(await readVersion(store, v[2]!)).toBe('v4');
  });

  it('decides when to take another one', () => {
    expect(shouldSnapshot(undefined, 1000)).toBe(true);
    expect(shouldSnapshot(1000, 1000 + 60_000)).toBe(false);
    expect(shouldSnapshot(1000, 1000 + 5 * 60_000)).toBe(true);
  });

  it('turns stamps into dates and back', () => {
    const d = new Date('2026-11-21T04:12:09Z');
    expect(stampNow(d)).toBe('2026-11-21T04-12-09');
    expect(stampToDate('2026-11-21T04-12-09').getTime()).toBe(d.getTime());
  });

  it('is kept out of the vault because it lives in a hidden folder', async () => {
    const store = new MemoryStorage({ 'a.md': 'x' });
    await snapshot(store, 'a.md', 'old', '2026-11-21T04-00-00');
    const index = new VaultIndex(store);
    await index.scan();
    expect([...index.files]).toEqual(['a.md']);
    expect(versionDir('a.md')).toBe(`${HISTORY_DIR}/a.md`);
  });
});
