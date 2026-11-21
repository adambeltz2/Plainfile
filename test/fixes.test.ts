import { describe, expect, it } from 'vitest';
import { lineDiff } from '../src/diff';
import { bestLinkTarget, retargetWikiLink } from '../src/fixes';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';
import { StaleError } from '../src/writeback';

async function setup(files: Record<string, string>) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}

describe('retargetWikiLink', () => {
  it('changes only the link target and keeps the alias and the rest of the line', async () => {
    const text = '# T\r\nSee [[pricing-reserach|the research]] and [[other]].  \r\nend';
    const { store, index } = await setup({ 'a.md': text, 'pricing-research.md': 'x' });
    const r = await retargetWikiLink(store, index, 'a.md', 2, 'pricing-reserach', 'pricing-research');
    expect(r.after).toBe('See [[pricing-research|the research]] and [[other]].  ');
    expect(await store.read('a.md')).toBe(text.replace('pricing-reserach', 'pricing-research'));
    expect(index.backlinks('pricing-research.md')).toEqual([{ from: 'a.md', line: 2 }]);
  });

  it('fixes every copy of the same bad target on the line', async () => {
    const { store, index } = await setup({ 'a.md': '[[x]] and [[x]]', 'y.md': '' });
    await retargetWikiLink(store, index, 'a.md', 1, 'x', 'y');
    expect(await store.read('a.md')).toBe('[[y]] and [[y]]');
  });

  it('refuses when the link is no longer on that line', async () => {
    const { store, index } = await setup({ 'a.md': 'See [[old]]' });
    store.external('a.md', 'Changed [[else]]');
    await expect(retargetWikiLink(store, index, 'a.md', 1, 'old', 'new')).rejects.toBeInstanceOf(StaleError);
    expect(await store.read('a.md')).toBe('Changed [[else]]');
  });

  it('refuses to overwrite a file modified between read and write', async () => {
    const { store, index } = await setup({ 'a.md': 'See [[old]]' });
    const realWrite = store.write.bind(store);
    store.write = async (p, c, m) => {
      store.external(p, 'See [[old]] plus a sync edit');
      return realWrite(p, c, m);
    };
    await expect(retargetWikiLink(store, index, 'a.md', 1, 'old', 'new')).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('bestLinkTarget', () => {
  it('uses the file name when unique and the path when it is not', async () => {
    const { index } = await setup({ 'a/x.md': '', 'b/x.md': '', 'c/solo.md': '', 'src.md': '' });
    expect(bestLinkTarget(index, 'src.md', 'c/solo.md')).toBe('solo');
    expect(bestLinkTarget(index, 'src.md', 'a/x.md')).toBe('a/x');
  });
});

describe('lineDiff', () => {
  it('finds the changed block between two versions', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual({ start: 2, removed: ['b'], added: ['B'] });
    expect(lineDiff('a\nc', 'a\nb\nc')).toEqual({ start: 2, removed: [], added: ['b'] });
    expect(lineDiff('same', 'same')).toBeNull();
  });
});
