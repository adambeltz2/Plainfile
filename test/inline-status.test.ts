import { describe, expect, it } from 'vitest';
import { applyBulk, editInlineLine, planBulk } from '../src/bulk';
import { extractInlineStatus, inlineWithStatus } from '../src/inline-status';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { hubTasks } from '../src/hub';
import { ALL_PROJECTS } from '../src/projects';
import { setTaskDone, setTaskStatus } from '../src/writeback';

describe('status on a checkbox line', () => {
  it('reads doing and waiting from the line, ignoring other words', () => {
    expect(extractInlineStatus('Call Dana status:doing due:2026-11-24')).toBe('doing');
    expect(extractInlineStatus('Call Dana STATUS:Waiting')).toBe('waiting');
    expect(extractInlineStatus('Call Dana status:todo')).toBeUndefined();
    expect(extractInlineStatus('the status:report is late')).toBeUndefined();
  });

  it('sets, changes and clears it, touching only that word and the box', () => {
    expect(inlineWithStatus('- [ ] Call Dana due:2026-11-24', 'doing')).toBe('- [ ] Call Dana due:2026-11-24 status:doing');
    expect(inlineWithStatus('- [ ] Call status:doing Dana @sam', 'waiting')).toBe('- [ ] Call status:waiting Dana @sam');
    expect(inlineWithStatus('- [ ] Call Dana status:doing', 'todo')).toBe('- [ ] Call Dana');
    expect(inlineWithStatus('- [ ] Call Dana status:doing', 'done')).toBe('- [x] Call Dana');
    expect(inlineWithStatus('- [x] Call Dana', 'doing')).toBe('- [ ] Call Dana status:doing');
    expect(inlineWithStatus('Plain line', 'doing')).toBeNull();
    expect(inlineWithStatus('- [ ] x', 'blocked')).toBeNull();
    expect(editInlineLine('1. [ ] Numbered\r', { kind: 'status', status: 'waiting' })).toBe('1. [ ] Numbered status:waiting\r');
  });
});

describe('through the index and the guarded write path', () => {
  const FILES = { 'a.md': '# A\r\n- [ ] Draft the memo status:doing due:2026-11-24\r\n- [ ] Plain one\r\n- [ ] Ask Sam #waiting\r\n' };
  async function setup() {
    const store = new MemoryStorage(FILES);
    const index = new VaultIndex(store);
    await index.scan();
    return { store, index, id: (t: string) => index.tasks().find((x) => x.title === t)!.id };
  }

  it('shows the status, keeps the word out of the title, and keeps #waiting working', async () => {
    const { index } = await setup();
    const by = Object.fromEntries(index.tasks().map((t) => [t.title, t.status]));
    expect(by).toEqual({ 'Draft the memo': 'doing', 'Plain one': undefined, 'Ask Sam': undefined });
    const hub = hubTasks(index, ALL_PROJECTS);
    expect(Object.fromEntries(hub.map((t) => [t.item.title, t.status]))).toEqual({ 'Draft the memo': 'doing', 'Plain one': 'todo', 'Ask Sam': 'waiting' });
  });

  it('moves one task between statuses with one change on its line, and ticking it removes the word', async () => {
    const { store, index, id } = await setup();
    await setTaskStatus(store, index, id('Plain one'), 'waiting');
    expect(await store.read('a.md')).toBe(FILES['a.md'].replace('Plain one', 'Plain one status:waiting'));
    await setTaskStatus(store, index, id('Plain one'), 'todo');
    expect(await store.read('a.md')).toBe(FILES['a.md']);
    await setTaskDone(store, index, id('Draft the memo'), true);
    expect(await store.read('a.md')).toBe(FILES['a.md'].replace('- [ ] Draft the memo status:doing due', '- [x] Draft the memo due'));
  });

  it('is a bulk action with a preview and Undo', async () => {
    const { store, index, id } = await setup();
    const plan = await planBulk(store, index, [id('Plain one'), id('Ask Sam')], { kind: 'status', status: 'doing' });
    expect(plan.skipped).toBe(0);
    await applyBulk(store, index, plan.edits);
    expect((await store.read('a.md')).split('\r\n').slice(2, 4)).toEqual(['- [ ] Plain one status:doing', '- [ ] Ask Sam #waiting status:doing']);
    await applyBulk(store, index, plan.edits, 'back');
    expect(await store.read('a.md')).toBe(FILES['a.md']);
  });
});
