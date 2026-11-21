import { describe, expect, it } from 'vitest';
import { parseNote } from '../src/parse';

const meta = { mtime: 1, size: 0 };
const parse = (path: string, text: string) => parseNote(path, text, meta);

describe('parseNote', () => {
  it('reads any markdown file with no frontmatter', () => {
    const n = parse('notes/plain.md', '# Hello\n\nJust text.');
    expect(n.title).toBe('Hello');
    expect(n.frontmatter).toEqual({});
    expect(n.tasks).toEqual([]);
  });

  it('falls back to the file name for the title', () => {
    expect(parse('notes/my-note.md', 'no heading').title).toBe('my-note');
  });

  it('prefers frontmatter title over the first heading', () => {
    expect(parse('a.md', '---\ntitle: From YAML\n---\n# From heading').title).toBe('From YAML');
  });

  it('survives broken YAML and reports it', () => {
    const n = parse('a.md', '---\ntitle: [unclosed\n---\n# Body');
    expect(n.frontmatterError).toBeTruthy();
    expect(n.title).toBe('Body');
  });

  it('only treats --- on the first line as frontmatter', () => {
    const n = parse('a.md', 'intro\n---\ntitle: x\n---\n');
    expect(n.frontmatter).toEqual({});
  });

  it('collects frontmatter and inline tags, lowercased and de-duplicated', () => {
    const n = parse('a.md', '---\ntags: [Launch, "#pricing"]\n---\nSee #launch and #Reading. Not #123 or http://x.com/#frag');
    expect(n.tags.sort()).toEqual(['launch', 'pricing', 'reading']);
  });

  it('parses inline tasks with due dates, people and tags', () => {
    const n = parse('a.md', '- [ ] Send logo files @Dana due:2026-11-23 #launch\n* [x] Done thing\n  - [ ] Nested');
    expect(n.tasks).toHaveLength(3);
    const [a, b, c] = n.tasks;
    expect(a).toMatchObject({ line: 1, title: 'Send logo files', due: '2026-11-23', who: ['@dana'], tags: ['launch'], state: ' ', col: 3 });
    expect(b).toMatchObject({ line: 2, state: 'x', marker: '*' });
    expect(c).toMatchObject({ line: 3, col: 5 });
  });

  it('understands Obsidian Tasks and Dataview dates', () => {
    const n = parse('a.md', '- [ ] One 📅 2026-12-01\n- [ ] Two [due:: 2026-12-02]');
    expect(n.tasks.map((t) => t.due)).toEqual(['2026-12-01', '2026-12-02']);
    expect(n.tasks[0]!.title).toBe('One');
  });

  it('reads the first Notebook app format: #due:date and #followup', () => {
    const n = parse('a.md', '- [ ] Order walnut sample panel #due:2026-09-20\n- Confirm finish with Dana #followup');
    expect(n.tasks[0]).toMatchObject({ title: 'Order walnut sample panel', due: '2026-09-20', tags: [] });
    expect(n.tags).toEqual(['followup']);
  });

  it('ignores checkboxes, links and tags inside code fences and code spans', () => {
    const n = parse('a.md', '```\n- [ ] fenced [[nope]] #nope\n```\nInline `[[also-nope]] #nope` and [[real]].');
    expect(n.tasks).toEqual([]);
    expect(n.links.map((l) => l.target)).toEqual(['real']);
    expect(n.tags).toEqual([]);
  });

  it('extracts wiki links, markdown links and embeds', () => {
    const n = parse('a.md', '[[one|shown]] [[two#section]] [x](../b/c.md#top) [web](https://x.com) ![pic](img/p.png) ![[scan.pdf]]');
    expect(n.links.map((l) => [l.kind, l.target])).toEqual([
      ['wiki', 'one'],
      ['wiki', 'two'],
      ['md', '../b/c.md'],
    ]);
    expect(n.embeds.map((e) => e.target)).toEqual(['scan.pdf', 'img/p.png']);
  });

  it('detects a file task from status in a tasks/ folder', () => {
    const n = parse('p/tasks/x.md', '---\ntitle: X\nstatus: Doing\ndue: 2026-11-24\n---\n');
    expect(n.fileTask).toMatchObject({ status: 'doing', done: false, due: '2026-11-24', statusLine: 3 });
  });

  it('does not treat status outside tasks/ as a task unless type is task', () => {
    expect(parse('notes/x.md', '---\nstatus: draft\n---\n').fileTask).toBeUndefined();
    expect(parse('notes/x.md', '---\ntype: task\nstatus: done\n---\n').fileTask?.done).toBe(true);
  });

  it('handles CRLF files and a byte order mark', () => {
    const n = parse('a.md', '﻿---\r\ntitle: Win\r\n---\r\n- [ ] Task one\r\n');
    expect(n.title).toBe('Win');
    expect(n.tasks[0]).toMatchObject({ line: 4, title: 'Task one' });
  });
});
