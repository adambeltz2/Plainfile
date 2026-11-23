import { describe, expect, it } from 'vitest';
import { addDefaultFrontmatter, setProjects, addFrontmatterListItem, frontmatterText, setFrontmatterField } from '../src/frontmatter';
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

describe('addDefaultFrontmatter', () => {
  it('adds a starter block above the note and leaves the note byte for byte', () => {
    const body = '# Plan\n\nText with [[link]] and - [ ] task\n';
    const out = addDefaultFrontmatter(body, 'Plan', '2026-11-21');
    expect(out).toBe(`---\ntitle: Plan\ncreated: 2026-11-21\ntags: []\n---\n${body}`);
    expect(out.endsWith(body)).toBe(true);
  });
  it("uses the note's own line endings and quotes a title that needs it", () => {
    const out = addDefaultFrontmatter('Line one\r\nLine two\r\n', 'Q3: plan', '2026-11-21');
    expect(out).toBe('---\r\ntitle: "Q3: plan"\r\ncreated: 2026-11-21\r\ntags: []\r\n---\r\nLine one\r\nLine two\r\n');
  });
  it('works on an empty note and never touches a note that already has frontmatter', () => {
    expect(addDefaultFrontmatter('', 'x', '2026-11-21')).toBe('---\ntitle: x\ncreated: 2026-11-21\ntags: []\n---\n');
    const has = '---\ntitle: Keep\n---\nBody\n';
    expect(addDefaultFrontmatter(has, 'x', '2026-11-21')).toBe(has);
  });
});

describe('setProjects', () => {
  it('writes one project as a plain value, several as a list, and none by removing the key', () => {
    const base = '---\ntitle: N\ntags: [a]\n---\nBody\n';
    const one = setProjects(base, ['site']);
    expect(one).toBe('---\ntitle: N\ntags: [a]\nproject: site\n---\nBody\n');
    const two = setProjects(one, ['site', 'Kitchen Remodel']);
    expect(two).toBe('---\ntitle: N\ntags: [a]\nproject: [site, Kitchen Remodel]\n---\nBody\n');
    expect(setProjects(two, ['site'])).toBe(one);
    expect(setProjects(one, [])).toBe(base);
  });
  it('creates frontmatter for a note that has none, keeps CRLF, and ignores repeats', () => {
    expect(setProjects('Body\n', ['site'])).toBe('---\nproject: site\n---\nBody\n');
    expect(setProjects('---\r\ntitle: N\r\n---\r\nB\r\n', ['a', 'A'])).toBe('---\r\ntitle: N\r\nproject: a\r\n---\r\nB\r\n');
  });
});

describe('a key with nothing after the colon', () => {
  it('gets a space when it is given a value, for a plain value and for a list', () => {
    expect(setFrontmatterField('---\nproject:\ntags: []\n---\nB', 'project', 'site')).toBe('---\nproject: site\ntags: []\n---\nB');
    expect(addFrontmatterListItem('---\ntags:\n---\nB', 'tags', 'a')).toContain('tags:\n  - a');
    expect(addFrontmatterListItem('---\nproject:x\n---\nB', 'project', 'y')).toBe('---\nproject: [x, y]\n---\nB');
  });
});

import { titleFrontmatter } from '../src/frontmatter';
describe('titleFrontmatter', () => {
  it('changes only the title line, quoting only when needed', () => {
    const doc = '---\ntitle: AA\ncreated: 2026-11-21\n---\nBody\n';
    expect(titleFrontmatter(doc, 'New name')).toBe('---\ntitle: New name\ncreated: 2026-11-21\n---\nBody\n');
    expect(titleFrontmatter(doc, 'Plan: v2')).toBe('---\ntitle: "Plan: v2"\ncreated: 2026-11-21\n---\nBody\n');
    expect(titleFrontmatter('---\ntitle: "Old"\n---\nB', 'Say "hi"')).toBe('---\ntitle: "Say \\"hi\\""\n---\nB');
    expect(titleFrontmatter('---\r\ntitle: Old\r\n---\r\nB', 'New')).toBe('---\r\ntitle: New\r\n---\r\nB');
    expect(titleFrontmatter('# Heading\nBody', 'Fresh')).toBe('---\ntitle: Fresh\n---\n# Heading\nBody');
  });
});
