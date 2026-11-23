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

import { retargetMarkdownLink } from '../src/fixes';
describe('retargetMarkdownLink', () => {
  it('changes only the address, keeps text, anchor and the rest of the line', async () => {
    const { store, index } = await setup({
      'notes/a.md': 'See [the plan](../plans/pricing-reserach.md#goals) and [other](keep.md).  \r\nTail\n',
      'plans/pricing-research.md': 'x',
      'notes/keep.md': 'y',
    });
    const r = await retargetMarkdownLink(store, index, 'notes/a.md', 1, '../plans/pricing-reserach.md', 'plans/pricing-research.md');
    expect(r).toMatchObject({ written: true, line: 1 });
    expect(await store.read('notes/a.md')).toBe('See [the plan](../plans/pricing-research.md#goals) and [other](keep.md).  \r\nTail\n');
  });
  it('writes a path relative to the linking note, and refuses when the line has changed', async () => {
    const { store, index } = await setup({ 'a.md': 'See [x](old.md).\n', 'deep/er/Target.md': 'x' });
    await retargetMarkdownLink(store, index, 'a.md', 1, 'old.md', 'deep/er/Target.md');
    expect(await store.read('a.md')).toBe('See [x](deep/er/Target.md).\n');
    await expect(retargetMarkdownLink(store, index, 'a.md', 1, 'old.md', 'deep/er/Target.md')).rejects.toThrow(StaleError);
  });
});

import { applyLinkFixes, planLinkFixes } from '../src/fixes';
import { checkHealth } from '../src/health';
describe('fix all', () => {
  it('plans only the links with a close match, shows exact lines, and applies them all', async () => {
    const files = {
      'a.md': 'See [[pricing-reserach|the research]] and [doc](../plans/overveiw.md#top).\nPlain [[nothing-like-it]].\n',
      'plans/pricing-research.md': 'x',
      'plans/overview.md': 'y',
    };
    const { store, index } = await setup(files);
    const report = checkHealth(index);
    const plan = planLinkFixes(index, report.unresolved);
    expect(plan.map((f) => [f.kind, f.line, f.after])).toEqual([
      ['wiki', 1, 'See [[pricing-research|the research]] and [doc](../plans/overveiw.md#top).'],
      ['md', 1, 'See [[pricing-reserach|the research]] and [doc](plans/overview.md#top).'],
    ]);
    const { changes, skipped } = await applyLinkFixes(store, index, plan);
    expect(changes).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(await store.read('a.md')).toBe('See [[pricing-research|the research]] and [doc](plans/overview.md#top).\nPlain [[nothing-like-it]].\n');
    // Nothing is left to fix with a close match.
    expect(planLinkFixes(index, checkHealth(index).unresolved)).toEqual([]);
  });

  it('skips a fix whose line has changed since, instead of forcing it', async () => {
    const { store, index } = await setup({ 'a.md': 'See [[pricing-reserach]].\n', 'pricing-research.md': 'x' });
    const plan = planLinkFixes(index, checkHealth(index).unresolved);
    store.external('a.md', 'Edited: nothing links here now.\n');
    const r = await applyLinkFixes(store, index, plan);
    expect(r).toMatchObject({ skipped: 1, changes: [] });
    expect(await store.read('a.md')).toBe('Edited: nothing links here now.\n');
  });
});
