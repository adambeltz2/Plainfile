import { describe, expect, it } from 'vitest';
import { applyBulk, editFileText, editInlineLine, planBulk } from '../src/bulk';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';
import { StaleError } from '../src/writeback';

const FILES: Record<string, string> = {
  'p/index.md': '---\ntitle: P\n---\n# P\n- [ ] One due:2026-11-20\r\n- [ ] Two @sam\n- [x] Three #launch\nPlain line\n',
  'p/tasks/a.md': '---\ntitle: A\nstatus: todo\ndue: 2026-11-25\npeople: [dana]\ntags: []\n---\nbody\n',
  'p/tasks/b.md': '---\ntitle: B\nstatus: todo\n---\n',
};
async function setup() {
  const store = new MemoryStorage(FILES);
  const index = new VaultIndex(store);
  await index.scan();
  const ids = (title: string) => index.tasks().find((t) => t.title === title)!.id;
  return { store, index, ids };
}

describe('single edits', () => {
  it('change one thing on a checkbox line and keep line endings', () => {
    expect(editInlineLine('- [ ] One due:2026-11-20\r', { kind: 'due', date: '2026-12-01' })).toBe('- [ ] One due:2026-12-01\r');
    expect(editInlineLine('- [ ] Two @sam', { kind: 'due', date: '2026-12-01' })).toBe('- [ ] Two @sam due:2026-12-01');
    expect(editInlineLine('- [ ] One due:2026-11-20', { kind: 'due', date: null })).toBe('- [ ] One');
    expect(editInlineLine('- [ ] Two @sam', { kind: 'person', name: '@Sam' })).toBe('- [ ] Two @sam');
    expect(editInlineLine('- [ ] Two @sam', { kind: 'person', name: 'dana' })).toBe('- [ ] Two @sam @dana');
    expect(editInlineLine('- [x] Three #launch', { kind: 'tag', tag: 'launch' })).toBe('- [x] Three #launch');
    expect(editInlineLine('- [x] Three #launch', { kind: 'tag', tag: 'home' })).toBe('- [x] Three #launch #home');
    expect(editInlineLine('- [ ] Two', { kind: 'done', done: true })).toBe('- [x] Two');
    expect(editInlineLine('- [ ] Two', { kind: 'status', status: 'doing' })).toBe('- [ ] Two status:doing');
    expect(editInlineLine('Plain line', { kind: 'done', done: true })).toBeNull();
  });
  it('change one key in a task note', () => {
    expect(editFileText(FILES['p/tasks/a.md']!, { kind: 'status', status: 'waiting' })).toBe(
      '---\ntitle: A\nstatus: waiting\ndue: 2026-11-25\npeople: [dana]\ntags: []\n---\nbody\n',
    );
    expect(editFileText(FILES['p/tasks/a.md']!, { kind: 'person', name: 'sam' })).toContain('people: [dana, sam]');
    expect(editFileText(FILES['p/tasks/a.md']!, { kind: 'due', date: null })).not.toContain('due:');
  });
});

describe('planBulk and applyBulk', () => {
  it('plans across inline and file tasks, writes only the changed lines, and undo restores every byte', async () => {
    const { store, index, ids } = await setup();
    const sel = [ids('One'), ids('Two'), ids('A'), ids('B')];
    const plan = await planBulk(store, index, sel, { kind: 'due', date: '2026-12-24' });
    expect(plan.skipped).toBe(0);
    expect(plan.edits.map((e) => [e.path, e.tasks])).toEqual([
      ['p/index.md', 2],
      ['p/tasks/a.md', 1],
      ['p/tasks/b.md', 1],
    ]);
    expect(plan.edits[0]).toMatchObject({ line: 5, was: '- [ ] One due:2026-11-20', now: '- [ ] One due:2026-12-24' });
    await applyBulk(store, index, plan.edits);
    expect(await store.read('p/index.md')).toBe(
      '---\ntitle: P\n---\n# P\n- [ ] One due:2026-12-24\r\n- [ ] Two @sam due:2026-12-24\n- [x] Three #launch\nPlain line\n',
    );
    expect(await store.read('p/tasks/a.md')).toContain('due: 2026-12-24');
    expect(await store.read('p/tasks/b.md')).toBe('---\ntitle: B\nstatus: todo\ndue: 2026-12-24\n---\n');
    await applyBulk(store, index, plan.edits, 'back');
    for (const [p, t] of Object.entries(FILES)) expect(await store.read(p)).toBe(t);
  });

  it('counts what it cannot change, and sets a status on checkbox lines as a word on the line', async () => {
    const { store, index, ids } = await setup();
    const plan = await planBulk(store, index, [ids('One'), ids('Two'), ids('A')], { kind: 'status', status: 'doing' });
    expect(plan.skipped).toBe(0);
    expect(plan.edits.map((e) => e.path)).toEqual(['p/index.md', 'p/tasks/a.md']);
    const done = await planBulk(store, index, [ids('One'), ids('A')], { kind: 'done', done: true });
    expect(done.edits.map((e) => e.path)).toEqual(['p/index.md', 'p/tasks/a.md']);
    expect(done.edits[1]!.now).toBe('status: done');
  });

  it('does nothing for notes already in the wanted state, and rejects bad input', async () => {
    const { store, index, ids } = await setup();
    expect((await planBulk(store, index, [ids('Three')], { kind: 'done', done: true })).edits).toEqual([]);
    await expect(planBulk(store, index, [ids('One')], { kind: 'due', date: 'tomorrow' })).rejects.toThrow('Pick a date');
    await expect(planBulk(store, index, [ids('One')], { kind: 'person', name: ' ' })).rejects.toThrow('Type a name');
  });

  it('refuses to write over a note that changed since it was planned, and writes nothing past it', async () => {
    const { store, index, ids } = await setup();
    const plan = await planBulk(store, index, [ids('One'), ids('A')], { kind: 'tag', tag: 'urgent' });
    store.external('p/tasks/a.md', FILES['p/tasks/a.md']! + 'edited elsewhere\n');
    await expect(applyBulk(store, index, plan.edits)).rejects.toBeInstanceOf(StaleError);
    expect(await store.read('p/tasks/a.md')).toContain('edited elsewhere');
    expect(await store.read('p/index.md')).toContain('#urgent'); // earlier notes were already written, and undo can put them back
    await applyBulk(store, index, plan.edits.slice(0, 1), 'back');
    expect(await store.read('p/index.md')).toBe(FILES['p/index.md']);
    expect(ConflictError).toBeDefined();
  });
});
