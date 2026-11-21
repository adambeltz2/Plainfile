import { describe, expect, it } from 'vitest';
import { DropboxError, DropboxStorage } from '../src/dropbox-storage';
import { VaultIndex } from '../src/index';
import { ConflictError } from '../src/storage';
import { FakeDropbox } from './helpers/fake-dropbox';

const make = (fake: FakeDropbox, root = '', getToken: (refresh?: boolean) => Promise<string> = async () => 'good') => new DropboxStorage({ getToken, root, fetch: fake.fetch });

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
