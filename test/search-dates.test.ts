import { describe, expect, it } from 'vitest';
import type { VaultIndex } from '../src/index';
import { parseNote } from '../src/parse';
import { parseDateTest, recentNotes, search } from '../src/query';

const TODAY = '2026-11-21';
const at = (iso: string, h = 12): number => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00`).getTime();

function fakeIndex(): VaultIndex {
  const mk = (path: string, text: string, mtime: number) => parseNote(path, text, { mtime, size: text.length });
  const notes = [
    mk('a-today.md', '# A today\n- [ ] Task a created:2026-11-21\n', at('2026-11-21', 9)),
    mk('b-today-late.md', '---\ncreated: 2026-11-01\n---\nB', at('2026-11-21', 18)),
    mk('c-yesterday.md', 'C', at('2026-11-20')),
    mk('d-last-month.md', 'D', at('2026-10-05')),
  ];
  const map = new Map(notes.map((n) => [n.path, n]));
  return { notes: map, tasks: () => [...map.values()].flatMap((n) => n.tasks.map((t) => ({ ...t, path: n.path, id: `${n.path}:${t.line}`, done: t.state === 'x', tags: [] }))) } as unknown as VaultIndex;
}

describe('modified: and created:', () => {
  it('modified:today finds notes changed today, newest first, and no tasks', () => {
    const hits = search(fakeIndex(), 'modified:today', TODAY);
    expect(hits.map((h) => h.path)).toEqual(['b-today-late.md', 'a-today.md']);
    expect(hits.every((h) => h.kind === 'note' && h.mtime)).toBe(true);
  });
  it('understands yesterday, week, month, and a date range', () => {
    const idx = fakeIndex();
    expect(search(idx, 'modified:yesterday', TODAY).map((h) => h.path)).toEqual(['c-yesterday.md']);
    expect(search(idx, 'modified:week', TODAY).map((h) => h.path)).toEqual(['b-today-late.md', 'a-today.md', 'c-yesterday.md']);
    expect(search(idx, 'modified:month', TODAY)).toHaveLength(3);
    expect(search(idx, 'modified:<2026-11-01', TODAY).map((h) => h.path)).toEqual(['d-last-month.md']);
  });
  it('combines with words and other operators', () => {
    expect(search(fakeIndex(), 'modified:today task', TODAY).map((h) => h.path)).toEqual(['a-today.md']);
  });
  it('created: reads the frontmatter on notes and the created date on tasks', () => {
    const idx = fakeIndex();
    expect(search(idx, 'created:2026-11-01', TODAY).map((h) => h.path)).toEqual(['b-today-late.md']);
    const t = search(idx, 'created:today is:task', TODAY);
    expect(t.map((h) => h.kind)).toEqual(['task']);
  });
  it('an unreadable day matches nothing instead of everything', () => {
    expect(search(fakeIndex(), 'modified:sometime', TODAY)).toEqual([]);
    expect(parseDateTest('sometime', TODAY)).toBeUndefined();
  });
  it('recentNotes lists the newest first', () => {
    expect(recentNotes(fakeIndex(), 2).map((h) => h.path)).toEqual(['b-today-late.md', 'a-today.md']);
  });
});
