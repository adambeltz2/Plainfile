import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { homeJournal, journalDay, journalFor, listJournals } from '../src/journal';
import { MemoryStorage } from '../src/memory-storage';

async function idx(files: Record<string, string>): Promise<VaultIndex> {
  const i = new VaultIndex(new MemoryStorage(files));
  await i.scan();
  return i;
}

const FILES: Record<string, string> = {
  'journal/2026-11-25.md': '---\ntitle: 2026-11-25\ntype: journal\ndate: 2026-11-25\n---\nToday\n',
  'journal/2026-11-24.md': 'Yesterday, no frontmatter\n',
  'daily/2026-11-20.md': '---\ntype: daily\n---\nA daily note\n',
  'notes/2026-11-23 meeting.md': '---\ntitle: Meeting\ntype: meeting\ndate: 2026-11-23\n---\n',
  'journal/undated.md': 'Not a day\n',
};

describe('journals', () => {
  it('finds journals by type or folder, newest day first, and leaves out meetings and undated notes', async () => {
    const list = listJournals(await idx(FILES));
    expect(list.map((j) => [j.date, j.path])).toEqual([
      ['2026-11-25', 'journal/2026-11-25.md'],
      ['2026-11-24', 'journal/2026-11-24.md'],
      ['2026-11-20', 'daily/2026-11-20.md'],
    ]);
  });
  it('reads the day from date:, then the file name, then the title', async () => {
    const i = await idx({
      'journal/a.md': '---\ndate: 2026-01-02\n---\n',
      'journal/2026-02-03 notes.md': 'x',
      'journal/b.md': '---\ntitle: 2026-03-04\ntype: journal\n---\n',
    });
    expect([...i.notes.values()].map((n) => journalDay(n)).sort()).toEqual(['2026-01-02', '2026-02-03', '2026-03-04']);
  });
  it('journalFor finds a day, and the Home button offers today, else the latest and starting today', async () => {
    const list = listJournals(await idx(FILES));
    expect(journalFor(list, '2026-11-24')?.path).toBe('journal/2026-11-24.md');
    expect(journalFor(list, '2026-11-22')).toBeUndefined();
    expect(homeJournal(list, '2026-11-25')).toMatchObject({ open: { date: '2026-11-25' }, latest: false, start: false });
    expect(homeJournal(list, '2026-11-26')).toMatchObject({ open: { date: '2026-11-25' }, latest: true, start: true });
    expect(homeJournal([], '2026-11-26')).toEqual({ open: undefined, latest: false, start: true });
  });
});
