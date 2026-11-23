import { describe, expect, it } from 'vitest';
import { hideMarkers, imagePaths, parseBlocks, stripFrontmatter, toHtml, toPlain } from '../src/render';

const NOTE = `---
title: Kickoff
tags: [launch]
---
# Kickoff call

Met **Dana** and *Sam* about [[Pricing research|pricing]] and [the plan](plan.md) and [site](https://x.test).

## Decisions
- Launch date is **Dec 8** #launch
- [ ] Send logo files @dana due:2026-11-23 created:2026-11-21
- [x] Share staging link
  - nested item
    1. deep one

1. First
2. Second

> Quoted line
> second line

| Name | Role |
|------|------|
| Dana | Lead |
| Sam | Dev |

\`\`\`
code # not a heading
\`\`\`

---
![shot](../_attachments/a.png) and \`inline code\`
`;

describe('markdown to blocks', () => {
  it('reads headings, paragraphs, nested lists, tasks, quotes, tables, code and rules', () => {
    const b = parseBlocks(NOTE);
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'h', 'list', 'list', 'quote', 'table', 'code', 'hr', 'p']);
    const list = b[3] as Extract<(typeof b)[number], { k: 'list' }>;
    expect(list.items.map((i) => i.task)).toEqual([undefined, ' ', 'x']);
    expect(list.items[2]!.children).toHaveLength(1);
    const nested = list.items[2]!.children[0] as Extract<(typeof b)[number], { k: 'list' }>;
    expect(nested.items[0]!.children[0]).toMatchObject({ k: 'list', ordered: true });
    expect(b[6]).toMatchObject({ k: 'table' });
    expect((b[7] as { s: string }).s).toBe('code # not a heading');
  });

  it('cleans by default: no frontmatter, tags, people or due markers, links as words', () => {
    const html = toHtml(NOTE);
    expect(html).not.toContain('title: Kickoff');
    expect(html).toContain('<h1>Kickoff call</h1>');
    expect(html).toContain('<b>Dana</b>');
    expect(html).toContain('<i>Sam</i>');
    expect(html).toContain('pricing'); // [[Pricing research|pricing]] shows the words
    expect(html).not.toContain('[[');
    expect(html).toContain('the plan'); // a link to a note is text
    expect(html).not.toContain('plan.md');
    expect(html).toContain('<a href="https://x.test">site</a>');
    expect(html).toContain('Launch date is <b>Dec 8</b>');
    expect(html).not.toContain('#launch');
    expect(html).toContain('☐ Send logo files');
    expect(html).not.toContain('@dana');
    expect(html).not.toContain('due:');
    expect(html).toContain('☑ Share staging link');
    expect(html).toContain('<table border="1"');
    expect(html).toContain('<td>Dana</td>');
    expect(html).toContain('<blockquote');
    expect(html).toContain('<pre');
    expect(html).toContain('[image: shot]'); // no data address was given
  });

  it('keeps the markers when asked', () => {
    const html = toHtml(NOTE, { keepMarkers: true });
    expect(html).toContain('#launch');
    expect(html).toContain('@dana');
    expect(html).toContain('due:2026-11-23');
  });

  it('shows an image when its data address is supplied, and escapes anything that is not markup', () => {
    const html = toHtml('![shot](a/b.png)\n\n<script>alert(1)</script> & "q"', { images: new Map([['a/b.png', 'data:image/png;base64,AAA']]) });
    expect(html).toContain('<img src="data:image/png;base64,AAA"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;');
    expect(html).not.toContain('<script>');
    expect(imagePaths('![a](x/y.png) ![b](https://z/i.png) ![[c.png]]').sort()).toEqual(['c.png', 'x/y.png']);
  });

  it('writes plain text for the clipboard', () => {
    const t = toPlain(NOTE);
    expect(t).toContain('Kickoff call');
    expect(t).toContain('☐ Send logo files');
    expect(t).toContain('- Launch date is Dec 8');
    expect(t).toContain('site (https://x.test)');
    expect(t).toContain('Name\tRole');
    expect(t).not.toContain('**');
  });

  it('helpers: strip frontmatter, hide markers, and survive odd input', () => {
    expect(stripFrontmatter('---\na: 1\n---\nBody')).toBe('Body');
    expect(stripFrontmatter('No front')).toBe('No front');
    expect(hideMarkers('Call @dana #launch due:2026-11-23 now 📅 2026-11-23')).toBe('Call now');
    expect(hideMarkers('Email me@x.com and a#hash')).toBe('Email me@x.com and a#hash');
    expect(toHtml('')).toBe('');
    expect(toHtml('***not bold')).toBeDefined();
    expect(toHtml('a | b\nplain')).toContain('<p>');
  });
});

import { readingStats } from '../src/render';
describe('readingStats', () => {
  it('counts the words a reader sees', () => {
    expect(readingStats('')).toEqual({ words: 0, minutes: 0 });
    const md =
      '---\ntitle: Ignore these words\n---\n# Heading two\n\nOne [link text](http://x.com/ignored) and [[Page|alias]] plus ![img](a.png).\n\n```js\nconst notCounted = 1;\n```\n';
    expect(readingStats(md).words).toBe(2 + 1 + 2 + 1 + 1 + 1); // Heading two, One, link text, and, alias, plus
    expect(readingStats('word '.repeat(440)).minutes).toBe(2);
    expect(readingStats('short').minutes).toBe(1);
  });
});

describe('line breaks inside a paragraph', () => {
  const MD = 'Winner:\nA000195757\n\nLosers:\nA000196963\nA000197040\n';
  it('stay line breaks in the pasted HTML, as the editor shows them', () => {
    expect(toHtml(MD)).toBe('<p>Winner:<br>A000195757</p>\n<p>Losers:<br>A000196963<br>A000197040</p>');
  });
  it('stay line breaks in plain text', () => {
    expect(toPlain(MD)).toContain('Losers:\nA000196963\nA000197040');
  });
  it('still hide markers on a line without leaving a stray space', () => {
    expect(toHtml('Call Dana #launch\nthen Sam')).toBe('<p>Call Dana<br>then Sam</p>');
  });
});
