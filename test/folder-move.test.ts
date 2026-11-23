import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFolderMove, planFolderMove } from '../src/folder-move';
import { listVersions, snapshot } from '../src/history';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { NodeStorage } from '../src/node-storage';
import type { VaultStorage } from '../src/storage';

const FILES: Record<string, string> = {
  'projects/site/index.md':
    '---\ntitle: Site\ntype: project\nactive: true\n---\n![logo](../../_attachments/logo.png)\n- [[Kickoff]]\n- [Notes](notes/b.md)\n![](img.png)\n',
  'projects/site/Kickoff.md': 'Kickoff. Back to [[projects/site/index]] and [the other](notes/b.md#top).\r\n',
  'projects/site/notes/b.md': 'B links up: [index](../index.md) and [people](../../../people/dana.md).\n',
  'people/dana.md':
    'Dana works on [[projects/site/Kickoff]], [site](../projects/site/index.md) and plain [[Kickoff]].\n![shot](../projects/site/img.png)\nAlso [[projects/site/Kickoff.md|alias]].\n',
  'other.md': 'Nothing about the site.\n',
};
const PNG = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 255]);

async function vault(storage: VaultStorage) {
  const index = new VaultIndex(storage);
  await index.scan();
  return index;
}
async function seed(): Promise<MemoryStorage> {
  const s = new MemoryStorage(FILES);
  await s.createBinary('projects/site/img.png', PNG);
  await s.createBinary('_attachments/logo.png', PNG);
  return s;
}

describe('moving a folder', () => {
  it('moves notes and attachments, rewrites path links everywhere, and keeps plain-name links alone', async () => {
    const store = await seed();
    const index = await vault(store);
    const plan = planFolderMove(index, 'projects/site', 'archive/site');
    expect(plan.files.map((f) => f.to)).toEqual(['archive/site/Kickoff.md', 'archive/site/img.png', 'archive/site/index.md', 'archive/site/notes/b.md']);
    expect(plan.outsideNotes).toBe(1);
    await applyFolderMove(store, index, plan);

    expect([...index.files].sort()).toEqual([
      '_attachments/logo.png',
      'archive/site/Kickoff.md',
      'archive/site/img.png',
      'archive/site/index.md',
      'archive/site/notes/b.md',
      'other.md',
      'people/dana.md',
    ]);
    // Inside the folder: only links out of it change.
    expect(await store.read('archive/site/index.md')).toBe(FILES['projects/site/index.md']); // same depth, so no link in it changes
    expect(await store.read('archive/site/Kickoff.md')).toBe('Kickoff. Back to [[archive/site/index]] and [the other](notes/b.md#top).\r\n');
    expect(await store.read('archive/site/notes/b.md')).toBe(FILES['projects/site/notes/b.md']);
    // Outside: path links are rewritten, the plain name is left alone.
    expect(await store.read('people/dana.md')).toBe(
      'Dana works on [[archive/site/Kickoff]], [site](../archive/site/index.md) and plain [[Kickoff]].\n![shot](../archive/site/img.png)\nAlso [[archive/site/Kickoff.md|alias]].\n',
    );
    expect(await store.read('other.md')).toBe(FILES['other.md']);
    expect(await store.readBinary('archive/site/img.png')).toEqual(PNG);
    // Everything still resolves.
    const after = await vault(store);
    for (const n of after.notes.values())
      for (const l of n.links)
        if (l.kind === 'md' && !l.target.startsWith('http')) expect(after.resolveLink(n, l).path, `${n.path} → ${l.target}`).toBeTruthy();
  });

  it('is reversible: moving it back leaves every file exactly as it began', async () => {
    const store = await seed();
    let index = await vault(store);
    await applyFolderMove(store, index, planFolderMove(index, 'projects/site', 'archive/site'));
    index = await vault(store);
    await applyFolderMove(store, index, planFolderMove(index, 'archive/site', 'projects/site'));
    for (const [p, text] of Object.entries(FILES)) expect(await store.read(p), p).toBe(text);
    expect(await store.readBinary('projects/site/img.png')).toEqual(PNG);
    expect([...(await vault(store)).files].some((f) => f.startsWith('archive/'))).toBe(false);
  });

  it('carries version history along', async () => {
    const store = await seed();
    const index = await vault(store);
    await snapshot(store, 'projects/site/Kickoff.md', 'older\n', '2026-11-20T10-00-00');
    await applyFolderMove(store, index, planFolderMove(index, 'projects/site', 'archive/site'));
    expect((await listVersions(store, 'archive/site/Kickoff.md')).length).toBe(1);
    expect(await listVersions(store, 'projects/site/Kickoff.md')).toEqual([]);
  });

  it('refuses bad moves and warns about a clashing name', async () => {
    const store = await seed();
    await store.create('archive/site/index.md', 'already here');
    const index = await vault(store);
    expect(() => planFolderMove(index, 'projects/site', 'archive/site')).toThrow(/already exists/);
    expect(() => planFolderMove(index, 'projects/site', 'projects/site/inner')).toThrow(/into itself/);
    expect(() => planFolderMove(index, 'projects/site', 'projects/site')).toThrow(/already there/);
    expect(() => planFolderMove(index, '', 'x')).toThrow(/Choose a folder/);
    expect(() => planFolderMove(index, 'nothing', 'x')).toThrow(/no files/);
    const s2 = await seed();
    await s2.create('misc/Kickoff.md', 'a different kickoff');
    const plan = planFolderMove(await vault(s2), 'projects/site', 'archive/site');
    expect(plan.warnings.join(' ')).toMatch(/kickoff.*misc\/Kickoff\.md/i);
  });

  it('changes nothing when a file changed since the plan was made', async () => {
    const store = await seed();
    const index = await vault(store);
    const plan = planFolderMove(index, 'projects/site', 'archive/site');
    store.external('people/dana.md', 'Edited by someone else, no links now.\n');
    await expect(applyFolderMove(store, index, plan)).rejects.toThrow();
    expect([...(await vault(store)).files].some((f) => f.startsWith('archive/'))).toBe(false);
    expect(await store.read('projects/site/Kickoff.md')).toBe(FILES['projects/site/Kickoff.md']);
  });
});

describe('on a real folder', () => {
  let root = '';
  afterEach(() => root && rmSync(root, { recursive: true, force: true }));
  it('leaves no empty folder behind', async () => {
    root = mkdtempSync(join(tmpdir(), 'plainfile-fm-'));
    mkdirSync(join(root, 'projects/site/notes'), { recursive: true });
    writeFileSync(join(root, 'projects/site/index.md'), '# Site\n');
    writeFileSync(join(root, 'projects/site/notes/b.md'), 'B\n');
    writeFileSync(join(root, 'projects/other.md'), 'keep me\n');
    const store = new NodeStorage(root);
    const index = await vault(store);
    await applyFolderMove(store, index, planFolderMove(index, 'projects/site', 'archive/site'));
    expect(existsSync(join(root, 'projects/site'))).toBe(false);
    expect(existsSync(join(root, 'projects'))).toBe(true); // other files stay
    expect(readFileSync(join(root, 'archive/site/notes/b.md'), 'utf8')).toBe('B\n');
  });
});
