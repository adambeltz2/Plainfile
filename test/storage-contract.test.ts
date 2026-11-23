import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { DropboxStorage } from '../src/dropbox-storage';
import { addTaskNote } from '../src/capture';
import { setPriority } from '../src/home';
import { MemoryStorage } from '../src/memory-storage';
import { applyMove, planMove } from '../src/move';
import { NodeStorage } from '../src/node-storage';
import { planDelete, deleteNote } from '../src/delete';
import { applyRename, planRename } from '../src/rename';
import { ConflictError, ExistsError, type VaultStorage } from '../src/storage';
import { setTaskDone } from '../src/writeback';
import { FakeDropbox } from './helpers/fake-dropbox';

/**
 * The storage contract. Every adapter (in memory, a folder on disk, the browser's folder access, and
 * any future Dropbox, Google Drive or OneDrive adapter) must pass these same tests, so the parser, index
 * and write-back code can rely on it. To add an adapter, add one line to ADAPTERS.
 */
interface Adapter {
  name: string;
  make: (files: Record<string, string>) => Promise<VaultStorage>;
}

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

const ADAPTERS: Adapter[] = [
  { name: 'MemoryStorage', make: async (files) => new MemoryStorage(files) },
  {
    name: 'NodeStorage (a real folder)',
    make: async (files) => {
      const root = await mkdtemp(join(tmpdir(), 'plainfile-contract-'));
      dirs.push(root);
      const s = new NodeStorage(root);
      for (const [p, t] of Object.entries(files)) await s.create(p, t);
      return s;
    },
  },
  {
    name: 'DropboxStorage (the whole Dropbox)',
    make: async (files) => {
      const fake = new FakeDropbox();
      const s = new DropboxStorage({ getToken: async () => 'good', fetch: fake.fetch });
      for (const [p, t] of Object.entries(files)) await s.create(p, t);
      return s;
    },
  },
  {
    name: 'DropboxStorage (a folder inside Dropbox)',
    make: async (files) => {
      const fake = new FakeDropbox();
      fake.seed({ 'Other/keep.md': 'not in the vault', 'Vault2/x.md': 'neither' });
      const s = new DropboxStorage({ getToken: async () => 'good', root: '/Notes/Vault', fetch: fake.fetch });
      for (const [p, t] of Object.entries(files)) await s.create(p, t);
      return s;
    },
  },
];

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

for (const { name, make } of ADAPTERS) {
  describe(`storage contract: ${name}`, () => {
    it('creates files and folders, reads them back exactly, and reports size and mtime', async () => {
      const s = await make({});
      const e = await s.create('a/b/new note.md', '---\r\ntitle: Ünï\r\n---\r\nline\n');
      expect(e.path).toBe('a/b/new note.md');
      expect(await s.read('a/b/new note.md')).toBe('---\r\ntitle: Ünï\r\n---\r\nline\n');
      const st = await s.stat('a/b/new note.md');
      expect(st.mtime).toBe(e.mtime);
      expect(st.size).toBeGreaterThan(0);
    });

    it('refuses to create over an existing file and leaves it alone', async () => {
      const s = await make({ 'x.md': 'one' });
      await expect(s.create('x.md', 'two')).rejects.toBeInstanceOf(ExistsError);
      expect(await s.read('x.md')).toBe('one');
    });

    it('write replaces content and changes the mtime', async () => {
      const s = await make({ 'x.md': 'one' });
      const before = await s.stat('x.md');
      await tick();
      const after = await s.write('x.md', 'two', before.mtime);
      expect(await s.read('x.md')).toBe('two');
      expect(after.mtime).not.toBe(before.mtime);
      expect((await s.stat('x.md')).mtime).toBe(after.mtime);
    });

    it('write with a stale mtime throws ConflictError and changes nothing', async () => {
      const s = await make({ 'x.md': 'one' });
      const first = await s.stat('x.md');
      await tick();
      await s.write('x.md', 'changed elsewhere', first.mtime);
      await expect(s.write('x.md', 'mine', first.mtime)).rejects.toBeInstanceOf(ConflictError);
      expect(await s.read('x.md')).toBe('changed elsewhere');
    });

    it('remove checks the mtime, then deletes', async () => {
      const s = await make({ 'x.md': 'one' });
      const first = await s.stat('x.md');
      await tick();
      await s.write('x.md', 'two', first.mtime);
      await expect(s.remove('x.md', first.mtime)).rejects.toBeInstanceOf(ConflictError);
      expect(await s.read('x.md')).toBe('two');
      await s.remove('x.md', (await s.stat('x.md')).mtime);
      await expect(s.stat('x.md')).rejects.toBeDefined();
    });

    it('stores and returns bytes exactly, refuses to overwrite, and lists the file with its size', async () => {
      const s = await make({});
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 10, 13, 0, 1]);
      const e = await s.createBinary('_attachments/a/pic.png', png);
      expect(e.size).toBe(png.length);
      expect([...(await s.readBinary('_attachments/a/pic.png'))]).toEqual([...png]);
      await expect(s.createBinary('_attachments/a/pic.png', new Uint8Array([1]))).rejects.toBeInstanceOf(ExistsError);
      expect([...(await s.readBinary('_attachments/a/pic.png'))]).toEqual([...png]);
      expect((await s.list()).find((f) => f.path === '_attachments/a/pic.png')?.size).toBe(png.length);
    });

    it('lists every visible file with forward slashes, skipping hidden folders, however deep', async () => {
      const deep = 'l1/l2/l3/l4/l5/l6/l7/l8/l9/l10/l11/l12/deep.md';
      const s = await make({ 'top.md': 'a', 'f/n.md': 'b', [deep]: 'c', 'img/p.png': 'x', '.plainfile/h.md': 'hidden', '.git/x': 'hidden' });
      const paths = (await s.list()).map((f) => f.path).sort();
      expect(paths).toEqual(['f/n.md', 'img/p.png', deep, 'top.md'].sort());
    });

    it('listDir returns direct children including hidden folders, and nothing for a missing folder', async () => {
      const s = await make({ '.plainfile/trash/a.md': 'x', '.plainfile/trash/b.md': 'y', '.plainfile/other.md': 'z' });
      expect((await s.listDir('.plainfile/trash')).map((f) => f.path).sort()).toEqual(['.plainfile/trash/a.md', '.plainfile/trash/b.md']);
      expect(await s.listDir('nope/nothing')).toEqual([]);
    });

    it('list stays accurate after changes made through the interface', async () => {
      const s = await make({ 'a.md': '1' });
      await s.create('b/c.md', '2');
      await s.remove('a.md', (await s.stat('a.md')).mtime);
      expect((await s.list()).map((f) => f.path)).toEqual(['b/c.md']);
    });
  });

  /**
   * The same user actions on every adapter must leave exactly the same files. This is the safety net for
   * the whole app: any adapter, now or later, behaves like the others, byte for byte.
   */
  describe(`end to end on ${name}`, () => {
    const FILES = {
      'inbox/Kickoff.md': '---\ntitle: Kickoff\n---\n- [ ] Send logos @dana due:2026-11-23\nSee [[Other]] and [r](../ref/Other.md)\r\n',
      'ref/Other.md': '# Other\nback to [[inbox/Kickoff]]\n',
      'plain.md': 'plain [[Kickoff]]',
    };
    async function tree(s: VaultStorage): Promise<Record<string, string>> {
      const out: Record<string, string> = {};
      for (const f of await s.list()) out[f.path] = await s.read(f.path);
      return out;
    }

    it('tick a task, rename, move and delete leave the expected files and nothing else', async () => {
      const s = await make(FILES);
      const index = new VaultIndex(s);
      await index.scan();

      await setTaskDone(s, index, 'inbox/Kickoff.md:4', true);
      expect((await s.read('inbox/Kickoff.md')).split('\n')[3]).toBe('- [x] Send logos @dana due:2026-11-23');
      expect(await s.read('ref/Other.md')).toBe(FILES['ref/Other.md']);

      const made = await addTaskNote(s, index, { title: 'Contract task', due: '2026-11-30', created: '2026-11-21' });
      expect(await s.read(made.path)).toBe('---\ntitle: Contract task\nstatus: todo\ndue: 2026-11-30\ncreated: 2026-11-21\ntags: []\npeople: []\n---\n\n');
      await setTaskDone(s, index, made.taskId, true);
      expect((await s.read(made.path)).split('\n')[2]).toBe('status: done');

      // A priority is one piece of text on the line, and in a task note one frontmatter value.
      const logos = index.tasks().find((t) => t.title === 'Send logos')!;
      await setPriority(s, index, logos, 'A');
      expect((await s.read('inbox/Kickoff.md')).split('\n')[3]).toBe('- [x] (A) Send logos @dana due:2026-11-23');
      await setPriority(s, index, index.getTask(made.taskId)!, 'B');
      expect(await s.read(made.path)).toContain('people: []\npriority: B\n---');
      await setPriority(s, index, index.getTask(made.taskId)!, null);
      await setPriority(
        s,
        index,
        index.tasks().find((t) => t.title === 'Send logos')!,
        null,
      );
      expect((await s.read('inbox/Kickoff.md')).split('\n')[3]).toBe('- [x] Send logos @dana due:2026-11-23');
      expect((await s.read(made.path)).includes('priority')).toBe(false);

      const mv = planMove(index, 'inbox/Kickoff.md', 'projects/site');
      await applyMove(s, index, mv, new Set(mv.inbound.map((e) => e.id)));
      expect(await s.read('ref/Other.md')).toBe('# Other\nback to [[projects/site/Kickoff]]\n');
      expect((await s.read('projects/site/Kickoff.md')).endsWith('[r](../../ref/Other.md)\r\n')).toBe(true);

      const rn = planRename(index, 'ref/Other.md', 'Renamed');
      await applyRename(s, index, rn, { include: new Set(rn.edits.map((e) => e.id)), keepAlias: false });
      expect(Object.keys(await tree(s)).sort()).toEqual(['plain.md', 'projects/site/Kickoff.md', 'ref/Renamed.md', 'tasks/Contract task.md']);

      const del = planDelete(index, 'plain.md', '2026-11-21T00-00-00');
      await deleteNote(s, index, del, { trash: true });
      expect(Object.keys(await tree(s)).sort()).toEqual(['projects/site/Kickoff.md', 'ref/Renamed.md', 'tasks/Contract task.md']);
      expect((await s.listDir('.plainfile/trash')).length).toBe(1);
    });
  });
}
