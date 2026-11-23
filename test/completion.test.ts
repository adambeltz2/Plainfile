import { describe, expect, it } from 'vitest';
import { applyBulk, editInlineLine, planBulk } from '../src/bulk';
import { withCompletion } from '../src/completion';
import { summarize, hubTasks } from '../src/hub';
import { VaultIndex } from '../src/index';
import { monthStats } from '../src/insight';
import { MemoryStorage } from '../src/memory-storage';
import { ALL_PROJECTS } from '../src/projects';
import { setTaskDone, setTaskStatus } from '../src/writeback';

const ON = '2026-11-23';
const FILES = {
  'a.md': '# A\r\n- [ ] Call Dana due:2026-11-24\r\n- [x] Old one done:2026-10-01\r\n- [x] Ticked elsewhere\r\n- [ ] Waiting job status:waiting\r\n',
  'tasks/Note task.md': '---\ntitle: Note task\nstatus: todo\ndue: 2026-11-30 # keep\n---\nbody\n',
};
async function setup() {
  const store = new MemoryStorage(FILES);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index, id: (t: string) => index.tasks().find((x) => x.title === t)!.id };
}

describe('reading a completion date', () => {
  it('reads done:, Obsidian ✅ and Dataview completion, and keeps them out of the title', async () => {
    const store = new MemoryStorage({
      'a.md': '- [x] One done:2026-11-01\n- [x] Two ✅ 2026-11-02\n- [x] Three [completion:: 2026-11-03]\n- [x] Four\n',
      'tasks/T.md': '---\ntitle: T\nstatus: done\ncompleted: 2026-11-04\n---\n',
    });
    const index = new VaultIndex(store);
    await index.scan();
    expect(index.tasks().map((t) => [t.title, t.completed])).toEqual([
      ['One', '2026-11-01'],
      ['Two', '2026-11-02'],
      ['Three', '2026-11-03'],
      ['Four', undefined],
      ['T', '2026-11-04'],
    ]);
  });
});

describe('writing a completion date', () => {
  it('stamps a ticked checkbox line with the day, and unticking removes only the stamp', () => {
    expect(withCompletion('- [x] Call Dana due:2026-11-24', true, ON)).toBe('- [x] Call Dana due:2026-11-24 done:2026-11-23');
    expect(withCompletion('- [x] Call Dana done:2026-11-23', false)).toBe('- [x] Call Dana');
    expect(withCompletion('- [x] Pay ✅ 2026-11-01', true, ON)).toBe('- [x] Pay ✅ 2026-11-01'); // it already says when
    expect(withCompletion('- [x] Pay', true)).toBe('- [x] Pay'); // no date given: nothing added
    expect(editInlineLine('- [ ] Two\r', { kind: 'done', done: true, on: ON })).toBe('- [x] Two done:2026-11-23\r');
  });

  it('ticks one line with CRLF kept and nothing else changed, and unticking restores the file exactly', async () => {
    const { store, index, id } = await setup();
    const r = await setTaskDone(store, index, id('Call Dana'), true, { completedOn: ON });
    expect(r.after).toBe('- [x] Call Dana due:2026-11-24 done:2026-11-23');
    expect(await store.read('a.md')).toBe(FILES['a.md'].replace('- [ ] Call Dana due:2026-11-24', '- [x] Call Dana due:2026-11-24 done:2026-11-23'));
    await setTaskDone(store, index, id('Call Dana'), false, { completedOn: ON });
    expect(await store.read('a.md')).toBe(FILES['a.md']);
  });

  it('records completed: in a task note, shows both changed lines, and removes it on reopen', async () => {
    const { store, index, id } = await setup();
    const r = await setTaskDone(store, index, id('Note task'), true, { completedOn: ON });
    expect(r.before).toBe('status: todo');
    expect(r.after).toBe('status: done');
    expect(r.also).toEqual({ line: 5, before: '---', after: 'completed: 2026-11-23' });
    expect(await store.read('tasks/Note task.md')).toBe('---\ntitle: Note task\nstatus: done\ndue: 2026-11-30 # keep\ncompleted: 2026-11-23\n---\nbody\n');
    await setTaskDone(store, index, id('Note task'), false, { completedOn: ON });
    expect(await store.read('tasks/Note task.md')).toBe(FILES['tasks/Note task.md']);
  });

  it('leaves the file as it was when no date is given', async () => {
    const { store, index, id } = await setup();
    await setTaskDone(store, index, id('Note task'), true);
    expect(await store.read('tasks/Note task.md')).toBe('---\ntitle: Note task\nstatus: done\ndue: 2026-11-30 # keep\n---\nbody\n');
  });

  it('is recorded when a card moves to done and cleared when it moves out', async () => {
    const { store, index, id } = await setup();
    await setTaskStatus(store, index, id('Waiting job'), 'done', { completedOn: ON });
    expect((await store.read('a.md')).split('\r\n')[4]).toBe('- [x] Waiting job done:2026-11-23');
    await setTaskStatus(store, index, id('Waiting job'), 'doing', { completedOn: ON });
    expect((await store.read('a.md')).split('\r\n')[4]).toBe('- [ ] Waiting job status:doing');
  });

  it('works as a bulk change with Undo, and keeps the first finish date of a note that already has one', async () => {
    const files = { 'tasks/A.md': '---\ntitle: A\nstatus: todo\n---\n', 'tasks/B.md': '---\ntitle: B\nstatus: done\ncompleted: 2026-10-01\n---\n' };
    const store = new MemoryStorage(files);
    const index = new VaultIndex(store);
    await index.scan();
    const ids = index.tasks().map((t) => t.id);
    const plan = await planBulk(store, index, ids, { kind: 'done', done: true, on: ON });
    await applyBulk(store, index, plan.edits);
    expect(await store.read('tasks/A.md')).toBe('---\ntitle: A\nstatus: done\ncompleted: 2026-11-23\n---\n');
    expect(await store.read('tasks/B.md')).toBe(files['tasks/B.md']);
    await applyBulk(store, index, plan.edits, 'back');
    expect(await store.read('tasks/A.md')).toBe(files['tasks/A.md']);
  });
});

describe('counting finished tasks', () => {
  it('uses the finish date where there is one, instead of the file modified time', async () => {
    const { index } = await setup();
    const stats = monthStats(index, '2026-11-23', '2026-10');
    expect(stats.tasksDone).toBe(1); // "Old one" says 2026-10-01; the others have no date and their file is "now"
    const week = summarize(hubTasks(index, ALL_PROJECTS), '2026-11-23', Date.parse('2026-11-23T12:00:00'));
    expect(week.weekly.reduce((a, b) => a + b, 0)).toBeLessThan(3); // the October task is not counted in the last six weeks
  });
});
