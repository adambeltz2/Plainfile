import { describe, expect, it } from 'vitest';
import { applyBulk, planBulk } from '../src/bulk';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { describeRecurrence, nextCopy, nextDue, parseRecurrence, parseRepeatField } from '../src/recur';
import { setTaskDone, setTaskStatus } from '../src/writeback';

describe('reading a repeat rule', () => {
  it('reads rec: on a line, and +  for counting from the day it is finished', () => {
    expect(parseRecurrence('Team sync due:2026-11-24 rec:1w')).toEqual({ n: 1, unit: 'w', fromDone: false });
    expect(parseRecurrence('Water plants rec:+3d')).toEqual({ n: 3, unit: 'd', fromDone: true });
    expect(parseRecurrence('Pay rent rec:1m')).toEqual({ n: 1, unit: 'm', fromDone: false });
    expect(parseRecurrence('Renew rec:1y')).toEqual({ n: 1, unit: 'y', fromDone: false });
    expect(parseRecurrence('no repeat here, recs: 1w')).toBeUndefined();
  });
  it('reads the Obsidian Tasks form but treats it as read-only', () => {
    expect(parseRecurrence('Pay rent 🔁 every month 📅 2026-12-01')).toEqual({ n: 1, unit: 'm', fromDone: false });
    expect(parseRecurrence('Sync 🔁 every 2 weeks when done')).toEqual({ n: 2, unit: 'w', fromDone: true });
    expect(parseRecurrence('Standup 🔁 every monday')).toEqual({ n: 1, unit: 'w', fromDone: false });
  });
  it('reads a task note repeat: value', () => {
    expect(parseRepeatField('weekly')).toEqual({ n: 1, unit: 'w', fromDone: false });
    expect(parseRepeatField('+2w')).toEqual({ n: 2, unit: 'w', fromDone: true });
    expect(parseRepeatField('every 3 months')).toEqual({ n: 3, unit: 'm', fromDone: false });
    expect(parseRepeatField('sometimes')).toBeUndefined();
    expect(describeRecurrence({ n: 2, unit: 'w', fromDone: true })).toBe('every 2 weeks, after done');
  });
});

describe('the next date', () => {
  const week = { n: 1, unit: 'w', fromDone: false } as const;
  it('is a period after the due date, or after the finish day for +', () => {
    expect(nextDue(week, '2026-11-24', '2026-11-24')).toBe('2026-12-01');
    expect(nextDue({ ...week, fromDone: true }, '2026-11-20', '2026-11-24')).toBe('2026-12-01');
    expect(nextDue({ n: 1, unit: 'm', fromDone: false }, '2026-01-31', '2026-01-31')).toBe('2026-02-28'); // the month has no 31st
    expect(nextDue({ n: 1, unit: 'y', fromDone: false }, '2024-02-29', '2024-02-29')).toBe('2025-02-28');
    expect(nextDue(week, undefined, '2026-11-24')).toBe('2026-12-01');
  });
  it('makes one next date, not one per missed period', () => {
    expect(nextDue(week, '2026-10-20', '2026-11-24')).toBe('2026-11-24'); // five weeks late: the next is today, not five tasks
    expect(nextDue({ n: 1, unit: 'd', fromDone: false }, '2026-11-01', '2026-11-24')).toBe('2026-11-24');
  });
  it('writes the next copy unticked, with the new date, without the finish date or status', () => {
    expect(nextCopy('- [x] Team sync due:2026-11-24 rec:1w created:2026-11-01 done:2026-11-24', '2026-12-01', '2026-11-24')).toBe(
      '- [ ] Team sync due:2026-12-01 rec:1w created:2026-11-24',
    );
    expect(nextCopy('  * [x] Pay 📅 2026-11-24 🔁 every month ✅ 2026-11-24', '2026-12-24', '2026-11-24')).toBe('  * [ ] Pay 📅 2026-12-24 🔁 every month');
    expect(nextCopy('- [ ] Water rec:+3d status:doing', '2026-11-27', '2026-11-24')).toBe('- [ ] Water rec:+3d due:2026-11-27');
  });
});

const FILES = {
  'a.md': '# A\r\n- [ ] Team sync due:2026-11-24 rec:1w\r\n  - [ ] agenda\r\n- [ ] Plain one\r\n',
  'tasks/Standing.md': '---\ntitle: Standing\nstatus: doing\ndue: 2026-11-24\nrepeat: weekly\n---\nbody\n',
};
async function setup() {
  const store = new MemoryStorage(FILES);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index, id: (t: string) => index.tasks().find((x) => x.title === t)!.id };
}

describe('finishing a repeating task', () => {
  it('shows the rule in the index and keeps it out of the title', async () => {
    const { index } = await setup();
    expect(index.tasks().map((t) => [t.title, t.recur?.unit])).toEqual([
      ['Team sync', 'w'],
      ['agenda', undefined],
      ['Plain one', undefined],
      ['Standing', 'w'],
    ]);
  });

  it('ticks the line and adds the next copy below its block, with CRLF kept, and Undo removes the copy', async () => {
    const { store, index, id } = await setup();
    const r = await setTaskDone(store, index, id('Team sync'), true, { completedOn: '2026-11-24' });
    expect(r.after).toBe('- [x] Team sync due:2026-11-24 rec:1w done:2026-11-24');
    expect(r.also).toEqual({ line: 4, before: '', after: '- [ ] Team sync due:2026-12-01 rec:1w' });
    expect(await store.read('a.md')).toBe(
      '# A\r\n- [x] Team sync due:2026-11-24 rec:1w done:2026-11-24\r\n  - [ ] agenda\r\n- [ ] Team sync due:2026-12-01 rec:1w\r\n- [ ] Plain one\r\n',
    );
    // The new copy is its own task; ticking the old one again does not make a second copy.
    const old = index.tasks().find((t) => t.title === 'Team sync' && t.done)!;
    await setTaskDone(store, index, old.id, false, { completedOn: '2026-11-24' });
    expect(await store.read('a.md')).toBe(FILES['a.md']);
  });

  it('leaves the next copy alone when it was changed since, and makes none without a date', async () => {
    const { store, index, id } = await setup();
    await setTaskDone(store, index, id('Team sync'), true, { completedOn: '2026-11-24' });
    await store.write('a.md', (await store.read('a.md')).replace('rec:1w\r\n- [ ] Plain', 'rec:1w #edited\r\n- [ ] Plain'), (await store.stat('a.md')).mtime);
    await index.scan();
    const old = index.tasks().find((t) => t.title === 'Team sync' && t.done)!;
    await setTaskDone(store, index, old.id, false, { completedOn: '2026-11-24' });
    expect((await store.read('a.md')).split('\r\n').filter((l) => l.includes('Team sync')).length).toBe(2);
    const fresh = await setup();
    await setTaskDone(fresh.store, fresh.index, fresh.id('Team sync'), true);
    expect((await fresh.store.read('a.md')).split('\r\n').filter((l) => l.includes('Team sync')).length).toBe(1);
  });

  it('moves a repeating task note forward in the same file instead of finishing it', async () => {
    const { store, index, id } = await setup();
    const r = await setTaskDone(store, index, id('Standing'), true, { completedOn: '2026-11-24' });
    expect([r.before, r.after]).toEqual(['status: doing', 'status: todo']);
    expect(r.also).toEqual({ line: 4, before: 'due: 2026-11-24', after: 'due: 2026-12-01' });
    expect(await store.read('tasks/Standing.md')).toBe('---\ntitle: Standing\nstatus: todo\ndue: 2026-12-01\nrepeat: weekly\n---\nbody\n');
  });

  it('is the same when a card is moved to done, and a bulk Mark done leaves repeating tasks alone', async () => {
    const { store, index, id } = await setup();
    await setTaskStatus(store, index, id('Team sync'), 'done', { completedOn: '2026-11-24' });
    expect((await store.read('a.md')).split('\r\n').filter((l) => l.includes('Team sync')).length).toBe(2);
    const plan = await planBulk(store, index, [id('Plain one'), id('Standing')], { kind: 'done', done: true, on: '2026-11-24' });
    expect(plan.skipped).toBe(1);
    await applyBulk(store, index, plan.edits);
    expect(await store.read('tasks/Standing.md')).toBe(FILES['tasks/Standing.md']);
    expect(await store.read('a.md')).toContain('- [x] Plain one done:2026-11-24');
  });
});
