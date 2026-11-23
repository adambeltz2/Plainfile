import { describe, expect, it } from 'vitest';
import { linkAt, newNoteForLink } from '../src/linknote';

describe('links in the editor', () => {
  it('finds the link under the cursor', () => {
    const line = 'See [[Local Model Setup|the setup]] and [spec](notes/spec.md#top) or [web](https://x.com).';
    expect(linkAt(line, 10)).toEqual({ kind: 'wiki', target: 'Local Model Setup' });
    expect(linkAt('[[Plan#Goals]]', 3)).toEqual({ kind: 'wiki', target: 'Plan' });
    expect(linkAt(line, line.indexOf('[spec') + 2)).toEqual({ kind: 'md', target: 'notes/spec.md' });
    expect(linkAt(line, line.indexOf('[web') + 2)).toEqual({ kind: 'url', target: 'https://x.com' }); // a web address opens in a new tab
    expect(linkAt(line, 0)).toBeUndefined();
  });
  it('makes a missing note beside the one that links to it', () => {
    const a = newNoteForLink('projects/x/index.md', { kind: 'wiki', target: 'New Idea' }, '2026-11-22');
    expect(a.path).toBe('projects/x/New Idea.md');
    expect(a.content).toBe('---\ntitle: New Idea\ncreated: 2026-11-22\n---\n\n');
    expect(newNoteForLink('a.md', { kind: 'wiki', target: 'people/Sam' }, 'd').path).toBe('people/Sam.md');
    expect(newNoteForLink('notes/a.md', { kind: 'md', target: '../b.md' }, 'd').path).toBe('b.md');
  });
});

describe('web addresses', () => {
  it('finds a bare address, an [text](address) and an <address> under the cursor, and not the full stop after it', () => {
    const line = 'See https://example.com/a. Then [docs](https://docs.test/z) and <https://x.test/y>.';
    expect(linkAt(line, 10)).toEqual({ kind: 'url', target: 'https://example.com/a' });
    expect(linkAt(line, 'See https://example.com/a'.length)).toBeUndefined(); // on the full stop, not the address
    expect(linkAt(line, line.indexOf('docs') + 1)).toEqual({ kind: 'url', target: 'https://docs.test/z' });
    expect(linkAt(line, line.indexOf('x.test') + 1)).toEqual({ kind: 'url', target: 'https://x.test/y' });
    expect(linkAt(line, 1)).toBeUndefined();
    expect(linkAt('click at the end https://a.test', 'click at the end https://a.test'.length)).toBeUndefined(); // end of the line is for the cursor
  });
});
