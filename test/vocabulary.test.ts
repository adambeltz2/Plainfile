import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { frontmatterKeys, tagCounts } from '../src/vocabulary';

async function setup(files: Record<string, string>) {
  const index = new VaultIndex(new MemoryStorage(files));
  await index.scan();
  return index;
}

describe('vocabulary', () => {
  it('counts frontmatter keys with sample values, most used first', async () => {
    const index = await setup({
      'a.md': '---\ntitle: A\nstatus: todo\ntags: [x, y]\n---\n',
      'b.md': '---\ntitle: B\nstatus: todo\n---\n',
      'c.md': '---\ntitle: C\nstatus: done\ndue: 2026-12-01\n---\n',
      'd.md': 'no frontmatter',
    });
    const keys = frontmatterKeys(index);
    expect(keys.map((k) => [k.key, k.count])).toEqual([['status', 3], ['title', 3], ['due', 1], ['tags', 1]]);
    expect(keys[0]!.samples).toEqual(['todo', 'done']);
    expect(keys.find((k) => k.key === 'tags')!.samples).toEqual(['[x, y]']);
  });

  it('counts each tag once per note, from frontmatter and from the text', async () => {
    const index = await setup({ 'a.md': '---\ntags: [launch]\n---\nSee #launch and #home', 'b.md': '#launch again' });
    expect(tagCounts(index)).toEqual([
      { tag: 'launch', count: 2 },
      { tag: 'home', count: 1 },
    ]);
  });
});
