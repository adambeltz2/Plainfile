import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';
import { StaleError, setTaskDone } from '../src/writeback';

async function setup(files: Record<string, string>) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}

describe('setTaskDone', () => {
  it('changes exactly one character and nothing else', async () => {
    const text = '---\ntitle: T\n---\n\nSome   odd   spacing\n- [ ] First @dana due:2026-11-23\n* [ ] Second\n\ntrailing';
    const { store, index } = await setup({ 'n.md': text });
    const r = await setTaskDone(store, index, 'n.md:6', true);
    expect(r).toMatchObject({ written: true, before: '- [ ] First @dana due:2026-11-23', after: '- [x] First @dana due:2026-11-23' });
    const after = await store.read('n.md');
    expect(after).toBe(text.replace('- [ ] First', '- [x] First'));
    expect(index.getTask('n.md:6')?.done).toBe(true);
  });

  it('unticks, and is a no-op when already in the requested state', async () => {
    const { store, index } = await setup({ 'n.md': '- [x] Done' });
    expect((await setTaskDone(store, index, 'n.md:1', true)).written).toBe(false);
    expect((await setTaskDone(store, index, 'n.md:1', false)).written).toBe(true);
    expect(await store.read('n.md')).toBe('- [ ] Done');
  });

  it('preserves CRLF line endings', async () => {
    const text = '# T\r\n- [ ] One\r\n- [ ] Two\r\n';
    const { store, index } = await setup({ 'n.md': text });
    await setTaskDone(store, index, 'n.md:3', true);
    expect(await store.read('n.md')).toBe('# T\r\n- [ ] One\r\n- [x] Two\r\n');
  });

  it('updates only the status value of a task file, keeping quotes and comments', async () => {
    const text = '---\ntitle: X\nstatus: "doing"   # keep me\ndue: 2026-11-24\n---\nBody stays.\n';
    const { store, index } = await setup({ 'p/tasks/x.md': text });
    const r = await setTaskDone(store, index, 'p/tasks/x.md:3', true);
    expect(r.after).toBe('status: "done"   # keep me');
    expect(await store.read('p/tasks/x.md')).toBe(text.replace('"doing"', '"done"'));
    await setTaskDone(store, index, 'p/tasks/x.md:3', false);
    expect(await store.read('p/tasks/x.md')).toContain('status: "todo"');
  });

  it('refuses to write if the line changed since the last scan', async () => {
    const { store, index } = await setup({ 'n.md': '- [ ] Original' });
    store.external('n.md', '- [ ] Edited elsewhere');
    await expect(setTaskDone(store, index, 'n.md:1', true)).rejects.toBeInstanceOf(StaleError);
    expect(await store.read('n.md')).toBe('- [ ] Edited elsewhere');
  });

  it('refuses to overwrite a file modified between read and write', async () => {
    const { store, index } = await setup({ 'n.md': '- [ ] One' });
    const realWrite = store.write.bind(store);
    store.write = async (p, c, m) => {
      store.external(p, '- [ ] One\nadded by a sync tool');
      return realWrite(p, c, m);
    };
    await expect(setTaskDone(store, index, 'n.md:1', true)).rejects.toBeInstanceOf(ConflictError);
    expect(await store.read('n.md')).toBe('- [ ] One\nadded by a sync tool');
  });

  it('rejects an unknown task id', async () => {
    const { store, index } = await setup({ 'n.md': 'nothing here' });
    await expect(setTaskDone(store, index, 'n.md:9', true)).rejects.toThrow('no such task');
  });
});
