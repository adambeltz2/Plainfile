import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { parseNote } from '../src/parse';
import { activity, folderSizes, monthStats } from '../src/insight';

const TODAY = '2026-11-21';
const at = (iso: string): number => new Date(`${iso}T12:00:00`).getTime();

function fake(notes: { path: string; text: string; mtime: string }[]): VaultIndex {
  const map = new Map(notes.map((n) => [n.path, parseNote(n.path, n.text, { mtime: at(n.mtime), size: n.text.length })]));
  return { notes: map, tasks: () => [...map.values()].flatMap((n) => n.tasks.map((t) => ({ id: `${n.path}:${t.line}`, kind: 'inline' as const, path: n.path, line: t.line, title: t.title, done: t.state === 'x', due: t.due, created: t.created, who: t.who, tags: [] as string[] }))) } as unknown as VaultIndex;
}

describe('insight', () => {
  const index = fake([
    { path: 'a/1.md', text: '# One\n- [ ] Late due:2026-11-01 created:2026-11-02\n- [x] Done thing created:2026-11-03', mtime: '2026-11-20' },
    { path: 'a/2.md', text: '---\ncreated: 2026-11-05\n---\nTwo', mtime: '2026-11-20' },
    { path: 'a/3.md', text: 'Three', mtime: '2026-11-20' },
    { path: 'b/4.md', text: 'Four', mtime: '2026-11-18' },
    { path: 'old.md', text: 'Old', mtime: '2026-03-01' },
    { path: 'ancient.md', text: 'Ancient', mtime: '2025-01-01' },
  ]);

  it('counts notes changed per day in Monday-first weeks, with levels, and ignores what is too old or in the future', () => {
    const a = activity(index, TODAY, 26);
    expect(a.weeks).toHaveLength(26);
    expect(a.weeks.every((w) => w.length === 7)).toBe(true);
    expect(a.weeks.at(-1)![0]!.date).toBe('2026-11-16'); // this week starts on Monday
    expect(a.total).toBe(4); // the March and 2025 notes are outside the 26 weeks
    expect(a.days).toBe(2);
    expect(a.busiest).toMatchObject({ date: '2026-11-20', count: 3, level: 3 });
    const nov18 = a.weeks.flat().find((h) => h.date === '2026-11-18')!;
    expect(nov18.count).toBe(1);
    expect(nov18.level).toBe(1);
    expect(a.weeks.at(-1)![6]).toMatchObject({ date: '2026-11-22', count: 0, level: 0 }); // tomorrow is empty
  });

  it('summarises the month: notes edited and created, tasks created and done, overdue and open', () => {
    expect(monthStats(index, TODAY)).toEqual({ edited: 4, notesCreated: 1, tasksCreated: 2, tasksDone: 1, overdue: 1, open: 1 });
  });

  it('lists folders by size and copes with an empty vault', async () => {
    expect(folderSizes(index)).toEqual([
      { folder: 'a', notes: 3 },
      { folder: '(top level)', notes: 2 },
      { folder: 'b', notes: 1 },
    ]);
    const empty = new VaultIndex(new MemoryStorage({}));
    await empty.scan();
    expect(activity(empty, TODAY).total).toBe(0);
    expect(monthStats(empty, TODAY)).toMatchObject({ edited: 0, open: 0 });
    expect(folderSizes(empty)).toEqual([]);
  });
});
