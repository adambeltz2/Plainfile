import { describe, expect, it } from 'vitest';
import { DropboxError, DropboxStorage } from '../src/dropbox-storage';
import { VaultIndex } from '../src/index';
import { ConflictError } from '../src/storage';
import { FakeDropbox } from './helpers/fake-dropbox';

const make = (fake: FakeDropbox, root = '', getToken: (refresh?: boolean) => Promise<string> = async () => 'good') =>
  new DropboxStorage({ getToken, root, fetch: fake.fetch });

describe('DropboxStorage specifics', () => {
  it('lists across several pages with the cursor, and reports progress', async () => {
    const fake = new FakeDropbox();
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`n/note-${i}.md`] = `Note ${i}`;
    fake.seed(files);
    const seen: number[] = [];
    const list = await make(fake).list({ onProgress: (p) => seen.push(p.found) });
    expect(list).toHaveLength(10);
    expect(fake.calls.filter((c) => c === '/files/list_folder/continue').length).toBeGreaterThanOrEqual(2);
    expect(seen.at(-1)).toBe(10);
  });

  it('opens a whole vault through VaultIndex', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': '# A\n- [ ] Task due:2026-11-21', 'sub/b.md': 'See [[a]]' });
    const index = new VaultIndex(make(fake));
    await index.scan();
    expect(index.notes.size).toBe(2);
    expect(index.tasks()).toHaveLength(1);
    expect(index.backlinks('a.md')).toHaveLength(1);
  });

  it('refreshes the token once after a 401 and then carries on', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': 'x' });
    const asked: boolean[] = [];
    const s = make(fake, '', async (refresh) => {
      asked.push(!!refresh);
      return refresh ? 'good' : 'expired';
    });
    expect(await s.read('a.md')).toBe('x');
    expect(asked).toEqual([false, true]);
    await expect(make(fake, '', async () => 'never').read('a.md')).rejects.toBeInstanceOf(DropboxError);
  });

  it('waits and retries when Dropbox says slow down', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': 'x' });
    fake.rateLimitOnce = true;
    expect(await make(fake).read('a.md')).toBe('x');
  });

  it('handles names with spaces and accents in the request header', async () => {
    const fake = new FakeDropbox();
    const s = make(fake);
    await s.create('Notes/Ünïcode naïve 3.md', 'hello');
    expect(await s.read('Notes/Ünïcode naïve 3.md')).toBe('hello');
    expect((await s.list()).map((f) => f.path)).toEqual(['Notes/Ünïcode naïve 3.md']);
  });

  it('notices an edit made elsewhere in the same second, and never overwrites it', async () => {
    const fake = new FakeDropbox();
    const mine = make(fake);
    await mine.create('a.md', 'one');
    const seen = await mine.stat('a.md');
    // Another device writes straight to Dropbox within the same second.
    const other = make(fake);
    await other.write('a.md', 'two', seen.mtime);
    const after = await mine.stat('a.md');
    expect(after.mtime).not.toBe(seen.mtime);
    await expect(mine.write('a.md', 'mine', seen.mtime)).rejects.toBeInstanceOf(ConflictError);
    expect(await mine.read('a.md')).toBe('two');
  });

  it('only sees its own folder, with paths relative to it', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'Notes/Vault/a.md': 'in', 'Notes/Other/b.md': 'out', 'Notes/Vault/.plainfile/h.md': 'hidden' });
    const s = make(fake, '/Notes/Vault');
    expect((await s.list()).map((f) => f.path)).toEqual(['a.md']);
    expect(await s.read('a.md')).toBe('in');
    expect((await s.listDir('.plainfile')).map((f) => f.path)).toEqual(['.plainfile/h.md']);
  });

  it('a missing file is reported as not found', async () => {
    const s = make(new FakeDropbox());
    await expect(s.read('nope.md')).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(s.stat('nope.md')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('incremental listing', () => {
  it('lists everything once, then asks only for what changed, including deletes and new files', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': 'A', 'sub/b.md': 'B', 'sub/deep/c.md': 'C', 'keep.md': 'K' });
    const mine = make(fake);
    expect((await mine.list()).map((f) => f.path).sort()).toEqual(['a.md', 'keep.md', 'sub/b.md', 'sub/deep/c.md']);
    const full = () => fake.calls.filter((c) => c === '/files/list_folder').length;
    expect(full()).toBe(1);

    // Another device changes things.
    const other = make(fake);
    await other.create('new.md', 'N');
    const a = await other.stat('a.md');
    await other.write('a.md', 'A2', a.mtime);
    await other.remove('keep.md', (await other.stat('keep.md')).mtime);
    fake.files.delete('/sub/b.md');
    fake.files.delete('/sub/deep/c.md');
    (fake as unknown as { log: unknown[] }).log.push({ seq: (fake as unknown as { seq: number }).seq++, lower: '/sub', display: '/sub' }); // the folder itself was deleted

    const before = fake.calls.length;
    const second = await mine.list();
    expect(second.map((f) => f.path).sort()).toEqual(['a.md', 'new.md']);
    expect(full()).toBe(1); // no second full listing
    expect(fake.calls.slice(before)).toEqual(['/files/list_folder/continue']);
    expect(second.find((f) => f.path === 'a.md')!.mtime).toBe((await other.stat('a.md')).mtime);
    // Nothing changed: still one small request, same answer.
    expect((await mine.list()).map((f) => f.path).sort()).toEqual(['a.md', 'new.md']);
    expect(full()).toBe(1);
  });

  it('lists the whole folder again if Dropbox no longer accepts the cursor', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': 'A' });
    const mine = make(fake);
    await mine.list();
    await make(fake).create('b.md', 'B');
    fake.resetNext = true;
    expect((await mine.list()).map((f) => f.path).sort()).toEqual(['a.md', 'b.md']);
    expect(fake.calls.filter((c) => c === '/files/list_folder').length).toBe(2);
  });

  it('keeps hidden items out and still counts them', async () => {
    const fake = new FakeDropbox();
    fake.seed({ 'a.md': 'A', '.plainfile/h.md': 'x' });
    const mine = make(fake);
    let hidden = -1;
    await mine.list({ onHidden: (n) => (hidden = n) });
    expect(hidden).toBe(1);
    await make(fake).create('.plainfile/more.md', 'y');
    await mine.list({ onHidden: (n) => (hidden = n) });
    expect((await mine.list()).map((f) => f.path)).toEqual(['a.md']);
    expect(hidden).toBe(2);
  });
});
