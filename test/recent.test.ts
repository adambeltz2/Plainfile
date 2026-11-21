import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { groupRecent, recentNotes } from '../src/recent';

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
    const day = (d: string, p: string) => ({ path: p, title: p, mtime: 0, date: d, task: false });
    const g = groupRecent([day('2026-11-21', 'x'), day('2026-11-20', 'y'), day('2026-11-17', 'z'), day('2026-10-03', 'w'), day('2026-10-01', 'v')], '2026-11-21');
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['Today', 1], ['Yesterday', 1], ['Earlier this week', 1], ['October 2026', 2]]);
  });
});
