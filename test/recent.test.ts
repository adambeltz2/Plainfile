import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { folderOf, recentNotes, whenParts } from '../src/recent';

describe('recent', () => {
  it('lists newest change first, filters, and groups by day', async () => {
    const store = new MemoryStorage({ 'a.md': '# Alpha\n', 'b.md': '# Beta\n', 'tasks/c.md': '---\nstatus: todo\n---\n# Gamma\n' });
    const index = new VaultIndex(store);
    await index.scan();
    store.external('a.md', '# Alpha\nmore\n');
    await index.scan();
    const all = recentNotes(index);
    expect(all[0]!.path).toBe('a.md');
    expect(all.find((x) => x.path === 'tasks/c.md')!.task).toBe(true);
    expect(recentNotes(index, 'beta').map((x) => x.path)).toEqual(['b.md']);
    const it = (date: string, mtime: number) => ({ path: 'x.md', title: 'x', mtime, date, task: false });
    const noon = new Date(2026, 10, 17, 9, 5).getTime();
    const fmt = (d: string) => `D${d}`;
    expect(whenParts(it('2026-11-21', noon), '2026-11-21', fmt)).toEqual({ day: 'Today', time: '09:05' });
    expect(whenParts(it('2026-11-20', noon), '2026-11-21', fmt).day).toBe('Yesterday');
    expect(whenParts(it('2026-11-17', noon), '2026-11-21', fmt).day).toBe('D2026-11-17');
    expect(folderOf('a/b/c.md')).toBe('a/b');
    expect(folderOf('c.md')).toBe('');
  });
});
