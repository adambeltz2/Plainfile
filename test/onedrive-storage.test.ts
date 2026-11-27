import { describe, expect, it } from 'vitest';
import { OneDriveError, OneDriveStorage } from '../src/onedrive-storage';
import { VaultIndex } from '../src/index';
import { ConflictError, ExistsError } from '../src/storage';
import { FakeOneDrive } from './helpers/fake-onedrive';

const make = (fake: FakeOneDrive, root = '', getToken: (refresh?: boolean) => Promise<string> = async () => 'good', chunkBytes?: number) =>
  new OneDriveStorage({ getToken, root, fetch: fake.fetch, chunkBytes });

describe('OneDriveStorage specifics', () => {
  it('lists every folder, across several pages, and reports progress', async () => {
    const fake = new FakeOneDrive();
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`n/note-${i}.md`] = `Note ${i}`;
    files['n/deep/er/more.md'] = 'deep';
    files['top.md'] = 'top';
    fake.seed(files);
    const seen: number[] = [];
    const list = await make(fake).list({ onProgress: (p) => seen.push(p.found) });
    expect(list.map((f) => f.path).sort()).toEqual([...Object.keys(files)].sort());
    expect(fake.calls.filter((c) => c.includes('skip=')).length).toBeGreaterThanOrEqual(2); // asked for the next page
    expect(seen.at(-1)).toBe(12);
  });

  it('skips hidden folders and files and says how many', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'a.md': 'a', '.git/config': 'x', 'sub/.hidden.md': 'h', 'sub/b.md': 'b' });
    let hidden = 0;
    const list = await make(fake).list({ onHidden: (n) => (hidden = n) });
    expect(list.map((f) => f.path).sort()).toEqual(['a.md', 'sub/b.md']);
    expect(hidden).toBe(2);
  });

  it('uses a folder inside the drive as the vault, and nothing outside it', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'Notes/Hello.md': '# Hello', 'Notes/sub/Deep.md': 'See [[Hello]]', 'Other/Skip.md': 'not mine' });
    const s = make(fake, 'Notes');
    expect((await s.list()).map((f) => f.path).sort()).toEqual(['Hello.md', 'sub/Deep.md']);
    await s.create('new/One.md', 'one');
    expect(fake.text('Notes/new/One.md')).toBe('one');
    expect(fake.text('new/One.md')).toBeUndefined();
  });

  it('opens a whole vault through VaultIndex', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'a.md': '# A\n- [ ] Task due:2026-11-21', 'sub/b.md': 'See [[a]]' });
    const index = new VaultIndex(make(fake));
    await index.scan();
    expect(index.notes.size).toBe(2);
    expect(index.tasks()).toHaveLength(1);
    expect(index.backlinks('a.md')).toHaveLength(1);
  });

  it('refreshes the token once after a 401 and then carries on', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'a.md': 'x' });
    const asked: boolean[] = [];
    const s = make(fake, '', async (refresh) => {
      asked.push(!!refresh);
      return refresh ? 'good' : 'expired';
    });
    expect(await s.read('a.md')).toBe('x');
    expect(asked).toEqual([false, true]);
    await expect(make(fake, '', async () => 'never').read('a.md')).rejects.toBeInstanceOf(OneDriveError);
  });

  it('waits and retries when OneDrive says slow down', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'a.md': 'x' });
    fake.rateLimitOnce = true;
    expect(await make(fake).read('a.md')).toBe('x');
  });

  it('handles names with spaces, accents, # and % in the address', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake);
    for (const name of ['Notes/Ünïcode naïve 3.md', 'Notes/100% #1 plan.md']) {
      await s.create(name, 'hello');
      expect(await s.read(name)).toBe('hello');
    }
    expect((await s.list()).map((f) => f.path).sort()).toEqual(['Notes/100% #1 plan.md', 'Notes/Ünïcode naïve 3.md']);
  });

  it('never sends the access token to the upload address', async () => {
    const fake = new FakeOneDrive();
    await make(fake).create('a.md', 'one');
    expect(fake.authOnUpload).toBe(false);
  });

  it('notices an edit made elsewhere in the same instant, and never overwrites it', async () => {
    const fake = new FakeOneDrive();
    const mine = make(fake);
    await mine.create('a.md', 'one');
    const seen = await mine.stat('a.md');
    fake.seed({ 'a.md': 'two (from another device)' }); // same clock, new eTag
    const after = await mine.stat('a.md');
    expect(after.mtime).not.toBe(seen.mtime);
    await expect(mine.write('a.md', 'mine', seen.mtime)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.text('a.md')).toBe('two (from another device)');
  });

  it('refuses a replace that OneDrive says is out of date (If-Match), even if it looked current', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake);
    await s.create('a.md', 'one');
    const seen = await s.stat('a.md');
    // The file changes between the read of its eTag and the upload: OneDrive's own check stops it.
    const realFetch = fake.fetch;
    let bumped = false;
    const racing = new OneDriveStorage({
      getToken: async () => 'good',
      fetch: async (input, init) => {
        if (!bumped && String(input).endsWith('/createUploadSession')) {
          bumped = true;
          fake.seed({ 'a.md': 'other' });
        }
        return realFetch(input, init);
      },
    });
    await expect(racing.write('a.md', 'mine', seen.mtime)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.text('a.md')).toBe('other');
  });

  it('refuses to delete a file that changed since it was read', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake);
    await s.create('a.md', 'one');
    const seen = await s.stat('a.md');
    fake.seed({ 'a.md': 'changed' });
    await expect(s.remove('a.md', seen.mtime)).rejects.toBeInstanceOf(ConflictError);
    expect(fake.text('a.md')).toBe('changed');
  });

  it('refuses to make a file over one that appeared meanwhile', async () => {
    const fake = new FakeOneDrive();
    fake.seed({ 'a.md': 'there' });
    await expect(make(fake).create('a.md', 'mine')).rejects.toBeInstanceOf(ExistsError);
    expect(fake.text('a.md')).toBe('there');
  });

  it('sends a large file in fragments of 320 KiB multiples, and gets every byte back', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake, '', undefined, 320 * 1024);
    const big = new Uint8Array(320 * 1024 * 2 + 1234).map((_, i) => i % 251);
    await s.createBinary('_attachments/big.png', big);
    expect(fake.ranges).toEqual([`bytes 0-327679/${big.length}`, `bytes 327680-655359/${big.length}`, `bytes 655360-${big.length - 1}/${big.length}`]);
    expect(await s.readBinary('_attachments/big.png')).toEqual(big);
  });

  it('writes an empty file, and empties a file', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake);
    await s.create('empty.md', '');
    expect(fake.text('empty.md')).toBe('');
    await s.create('full.md', 'text');
    const seen = await s.stat('full.md');
    await s.write('full.md', '', seen.mtime);
    expect(fake.text('full.md')).toBe('');
  });

  it('removes folders only when nothing but empty folders is inside', async () => {
    const fake = new FakeOneDrive();
    const s = make(fake);
    await s.create('old/a/b/keep.md', 'keep');
    await s.create('old/empty/x.md', 'x');
    const seen = await s.stat('old/empty/x.md');
    await s.remove('old/empty/x.md', seen.mtime);
    await s.removeEmptyFolders('old');
    expect(fake.text('old/a/b/keep.md')).toBe('keep'); // a folder with a file is never removed
    expect(fake.entries.has('old/empty')).toBe(false); // the empty one is
    await s.remove('old/a/b/keep.md', (await s.stat('old/a/b/keep.md')).mtime);
    await s.removeEmptyFolders('old');
    expect(fake.entries.has('old')).toBe(false);
  });
});
