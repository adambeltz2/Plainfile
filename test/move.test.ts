import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { applyMove, cleanFolder, duplicateNote, folderList, planMove, relativePath } from '../src/move';

async function setup(files: Record<string, string>) {
  const storage = new MemoryStorage(files);
  const index = new VaultIndex(storage);
  await index.scan();
  return { storage, index };
}
const all = (p: { inbound: { id: string }[] }) => new Set(p.inbound.map((e) => e.id));

describe('helpers', () => {
  it('relativePath and cleanFolder', () => {
    expect(relativePath('a/b', 'a/c/x.md')).toBe('../c/x.md');
    expect(relativePath('', 'x/y.md')).toBe('x/y.md');
    expect(relativePath('a', 'a/x.md')).toBe('x.md');
    expect(relativePath('a/b', '_att/i.png')).toBe('../../_att/i.png');
    expect(cleanFolder(' /projects//site/ ')).toBe('projects/site');
    expect(() => cleanFolder('../x')).toThrow();
    expect(() => cleanFolder('.hidden')).toThrow();
  });
  it('folderList counts notes and includes parents', async () => {
    const { index } = await setup({ 'a/b/n.md': 'x', 'a/m.md': 'y', 'top.md': 'z' });
    expect(folderList(index)).toEqual([
      { folder: 'a', notes: 1 },
      { folder: 'a/b', notes: 1 },
    ]);
  });
});

describe('planMove and applyMove', () => {
  const FILES = {
    'inbox/note.md': '---\ntitle: Note\n---\nSee [other](../ref/other.md) and ![img](../_att/i.png) and [[ref/other]].\r\n- [ ] A task due:2026-11-30\n',
    'ref/other.md': 'Other',
    '_att/i.png': 'png',
    'a.md': 'Plain [[note]] and path [[inbox/note]] and md [x](inbox/note.md#top) end',
    'b/c.md': 'Relative [n](../inbox/note.md) here',
  };

  it('rewrites only links that would break, and keeps the rest of every file byte for byte', async () => {
    const { storage, index } = await setup(FILES);
    const plan = planMove(index, 'inbox/note.md', 'projects/site');
    expect(plan.to).toBe('projects/site/note.md');
    expect(plan.inbound.map((e) => [e.path, e.after])).toEqual([
      ['a.md', 'Plain [[note]] and path [[projects/site/note]] and md [x](projects/site/note.md#top) end'],
      ['b/c.md', 'Relative [n](../projects/site/note.md) here'],
    ]);
    expect(plan.outbound.map((e) => e.after)).toEqual(['See [other](../../ref/other.md) and ![img](../../_att/i.png) and [[ref/other]].']);
    await applyMove(storage, index, plan, all(plan));
    expect(await storage.read('projects/site/note.md')).toBe('---\ntitle: Note\n---\nSee [other](../../ref/other.md) and ![img](../../_att/i.png) and [[ref/other]].\r\n- [ ] A task due:2026-11-30\n');
    await expect(storage.read('inbox/note.md')).rejects.toBeDefined();
    expect(await storage.read('a.md')).toBe('Plain [[note]] and path [[projects/site/note]] and md [x](projects/site/note.md#top) end');
    expect(await storage.read('ref/other.md')).toBe('Other');
    expect(index.notes.has('projects/site/note.md')).toBe(true);
    // Every link still resolves.
    expect(index.backlinks('projects/site/note.md').map((b) => b.from).sort()).toEqual(['a.md', 'a.md', 'a.md', 'b/c.md']);
  });

  it('uses full paths for plain name links when the name is shared with another note', async () => {
    const { index } = await setup({ 'x/n.md': 'N', 'y/n.md': 'N2', 'link.md': 'Go [[x/n]] or [[n]]' });
    const plan = planMove(index, 'x/n.md', 'z');
    expect(plan.inbound[0]!.after).toBe('Go [[z/n]] or [[n]]');
  });

  it('undo is a move back, and refuses what it must', async () => {
    const { storage, index } = await setup(FILES);
    const plan = planMove(index, 'inbox/note.md', 'projects/site');
    await applyMove(storage, index, plan, all(plan));
    const back = planMove(index, 'projects/site/note.md', 'inbox');
    await applyMove(storage, index, back, all(back));
    expect(await storage.read('inbox/note.md')).toBe(FILES['inbox/note.md']);
    expect(await storage.read('b/c.md')).toBe(FILES['b/c.md']);
    expect(() => planMove(index, 'inbox/note.md', 'inbox')).toThrow('already in that folder');
    await storage.create('ref/note.md', 'taken');
    await index.scan();
    expect(() => planMove(index, 'inbox/note.md', 'ref')).toThrow('already exists');
    expect(() => planMove(index, 'nope.md', 'ref')).toThrow('No such note');
  });

  it('a link edit that no longer matches stops the move before anything is removed', async () => {
    const { storage, index } = await setup(FILES);
    const plan = planMove(index, 'inbox/note.md', 'projects/site');
    storage.external('a.md', 'changed under us [[inbox/note]]');
    await expect(applyMove(storage, index, plan, all(plan))).rejects.toBeDefined();
    expect(await storage.read('inbox/note.md')).toBe(FILES['inbox/note.md']);
  });

  it('moves to the vault root', async () => {
    const { storage, index } = await setup({ 'a/n.md': 'N' });
    const plan = planMove(index, 'a/n.md', '');
    expect(plan.to).toBe('n.md');
    await applyMove(storage, index, plan, new Set());
    expect(await storage.read('n.md')).toBe('N');
  });
});

describe('duplicateNote', () => {
  it('copies the content exactly beside the original, with a free name', async () => {
    const { storage, index } = await setup({ 'a/n.md': '---\ntitle: N\n---\r\nbody\n' });
    expect(await duplicateNote(storage, index, 'a/n.md')).toBe('a/n copy.md');
    expect(await duplicateNote(storage, index, 'a/n.md')).toBe('a/n copy 2.md');
    expect(await storage.read('a/n copy 2.md')).toBe('---\ntitle: "N copy"\n---\r\nbody\n');
    await storage.create('b/plain.md', 'no frontmatter\r\n');
    await index.scan();
    expect(await duplicateNote(storage, index, 'b/plain.md')).toBe('b/plain copy.md');
    expect(await storage.read('b/plain copy.md')).toBe('no frontmatter\r\n');
  });
});
