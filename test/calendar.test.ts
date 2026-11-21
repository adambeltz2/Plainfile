import { describe, expect, it } from 'vitest';
import { addMonths, eventsBetween, monthGrid, monthLabel, weekOf, weekStart } from '../src/calendar';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

describe('calendar dates', () => {
  it('weeks start on Monday and months are whole weeks', () => {
    expect(weekStart('2026-11-21')).toBe('2026-11-16'); // a Saturday
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // a Sunday belongs to the week before
    expect(weekOf('2026-11-21')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    const nov = monthGrid('2026-11-15');
    expect(nov).toHaveLength(6); // November 2026 starts on a Sunday
    expect(nov[0]![0]).toBe('2026-10-26');
    expect(nov.at(-1)![6]).toBe('2026-12-06');
    expect(nov.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid('2026-02-10')).toHaveLength(5);
    expect(monthGrid('2027-02-10')).toHaveLength(4); // February 2027 is exactly four Monday-first weeks
  });
  it('moves by months across years and labels them', () => {
    expect(addMonths('2026-11-21', 1)).toBe('2026-12-01');
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(monthLabel('2026-11-21')).toBe('November 2026');
  });
});

describe('eventsBetween', () => {
  it('lists tasks by due date and notes by their date, and nothing outside the range', async () => {
    const index = new VaultIndex(
      new MemoryStorage({
        'a.md': '- [ ] Pay invoice due:2026-11-21\n- [x] Book flights due:2026-11-21\n- [ ] Later due:2026-12-30',
        'tasks/T.md': '---\ntitle: Task note\nstatus: todo\ndue: 2026-11-22\n---\n',
        'meetings/Kickoff.md': '---\ntitle: Kickoff\ntype: meeting\ndate: 2026-11-21\n---\n',
        'journal/J.md': '---\ntitle: Journal\ndate: Nov 23 2026\n---\n',
        'nodate.md': '- [ ] Undated',
      }),
    );
    await index.scan();
    const ev = eventsBetween(index, '2026-11-16', '2026-11-29');
    expect(ev.map((e) => `${e.date} ${e.kind} ${e.title}${e.done ? ' (done)' : ''}`)).toEqual([
      '2026-11-21 task Book flights (done)',
      '2026-11-21 task Pay invoice',
      '2026-11-21 note Kickoff',
      '2026-11-22 task Task note',
      '2026-11-23 note Journal',
    ]);
    expect(ev.find((e) => e.title === 'Kickoff')).toMatchObject({ type: 'meeting' });
    expect(ev.find((e) => e.title === 'Pay invoice')).toMatchObject({ id: 'a.md:1', line: 1 });
  });
});
