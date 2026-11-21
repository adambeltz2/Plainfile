import { describe, expect, it } from 'vitest';
import { addFrontmatterListItem, frontmatterText, setFrontmatterField } from '../src/frontmatter';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { setTaskStatus } from '../src/writeback';

describe('setFrontmatterField', () => {
  const doc = '---\ntitle: "Hello"   # keep\nstatus: doing\ntags: [a]\n---\nBody stays.\n';

  it('changes one value and leaves everything else alone', () => {
    expect(setFrontmatterField(doc, 'status', 'done')).toBe(doc.replace('doing', 'done'));
  });
  it('keeps quotes and trailing comments', () => {
    expect(setFrontmatterField(doc, 'title', 'Hi')).toBe(doc.replace('"Hello"', '"Hi"'));
  });
  it('adds a missing key before the closing fence', () => {
    expect(setFrontmatterField(doc, 'due', '2026-11-24')).toBe(doc.replace('tags: [a]\n', 'tags: [a]\ndue: 2026-11-24\n'));
  });
  it('removes a key, including a block list under it', () => {
    const t = '---\ntitle: x\ntags:\n  - a\n  - b\ndue: 1\n---\n';
    expect(setFrontmatterField(t, 'tags', null)).toBe('---\ntitle: x\ndue: 1\n---\n');
  });
  it('creates frontmatter when there is none, using the file line endings', () => {
    expect(setFrontmatterField('# Hi\r\nText', 'status', 'todo')).toBe('---\r\nstatus: todo\r\n---\r\n# Hi\r\nText');
  });
  it('keeps CRLF on the edited line', () => {
    const t = '---\r\nstatus: todo\r\n---\r\nx';
    expect(setFrontmatterField(t, 'status', 'done')).toBe('---\r\nstatus: done\r\n---\r\nx');
  });
});

describe('addFrontmatterListItem', () => {
  it('appends to a flow list, a block list or a missing key, and skips duplicates', () => {
    expect(addFrontmatterListItem('---\naliases: [a]\n---\n', 'aliases', 'b')).toBe('---\naliases: [a, b]\n---\n');
    expect(addFrontmatterListItem('---\naliases: []\n---\n', 'aliases', 'b')).toBe('---\naliases: [b]\n---\n');
    expect(addFrontmatterListItem('---\naliases:\n  - a\n---\n', 'aliases', 'b')).toBe('---\naliases:\n  - a\n  - b\n---\n');
    expect(addFrontmatterListItem('---\ntitle: x\n---\n', 'aliases', 'b')).toBe('---\ntitle: x\naliases: [b]\n---\n');
    expect(addFrontmatterListItem('---\naliases: [A]\n---\n', 'aliases', 'a')).toBe('---\naliases: [A]\n---\n');
    expect(addFrontmatterListItem('no frontmatter', 'aliases', 'b')).toBe('---\naliases: [b]\n---\nno frontmatter');
  });
});

describe('frontmatterText', () => {
  it('returns the raw frontmatter without fences', () => {
    expect(frontmatterText('---\na: 1\nb: 2\n---\nx')).toBe('a: 1\nb: 2');
    expect(frontmatterText('x')).toBeNull();
  });
});

describe('setTaskStatus', () => {
  it('moves a task file to another status with a one-line edit', async () => {
    const text = '---\ntitle: T\nstatus: todo\n---\nBody\n';
    const store = new MemoryStorage({ 'p/tasks/t.md': text });
    const index = new VaultIndex(store);
    await index.scan();
    const r = await setTaskStatus(store, index, 'p/tasks/t.md:3', 'waiting');
    expect(r).toMatchObject({ before: 'status: todo', after: 'status: waiting', written: true });
    expect(await store.read('p/tasks/t.md')).toBe(text.replace('todo', 'waiting'));
    expect((await setTaskStatus(store, index, 'p/tasks/t.md:3', 'waiting')).written).toBe(false);
  });
});
