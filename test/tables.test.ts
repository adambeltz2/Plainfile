import { describe, expect, it } from 'vitest';
import { findTables, tableSkeleton } from '../src/tables';
import { setFrontmatterField } from '../src/frontmatter';

const lines = (s: string): string[] => s.split('\n');

describe('finding tables', () => {
  it('reads the header, alignment and rows, and where the table sits', () => {
    const t = findTables(lines('Intro\n\n| Name | Qty | Note |\n| :-- | --: | :---: |\n| Pens | 3 | a \\| b |\n| Ink | 1 | |\n\nAfter'));
    expect(t).toHaveLength(1);
    expect(t[0]).toEqual({
      start: 2,
      end: 5,
      head: ['Name', 'Qty', 'Note'],
      align: ['left', 'right', 'center'],
      rows: [
        ['Pens', '3', 'a | b'],
        ['Ink', '1', ''],
      ],
    });
  });
  it('ends at the first line without a pipe, and finds a second table', () => {
    const t = findTables(lines('| a |\n| --- |\n| 1 |\ntext\n| b | c |\n|---|---|\n| 2 | 3 |'));
    expect(t.map((x) => [x.start, x.end])).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });
  it('works without outer pipes and ignores a CRLF', () => {
    const t = findTables(lines('a | b\r\n--- | ---\r\n1 | 2\r'));
    expect(t[0]?.head).toEqual(['a', 'b']);
    expect(t[0]?.rows).toEqual([['1', '2']]);
  });
  it('leaves out tables in frontmatter, code fences and comments', () => {
    const md =
      '---\ntitle: x\n| a | b |\n| --- | --- |\n---\n```\n| a | b |\n| --- | --- |\n```\n<!--\n| a | b |\n| --- | --- |\n-->\n| real | one |\n| --- | --- |';
    expect(findTables(lines(md)).map((x) => x.head)).toEqual([['real', 'one']]);
  });
  it('does not take a line with a pipe, or a mismatched separator, for a table', () => {
    expect(findTables(lines('a | b\nplain text'))).toEqual([]);
    expect(findTables(lines('| a | b |\n| --- |'))).toEqual([]);
  });
});

describe('the /table starter', () => {
  it('is a table the reader recognises, with the first header cell selected', () => {
    const sk = tableSkeleton();
    expect(sk.text.slice(sk.select.from, sk.select.to)).toBe('Column 1');
    const t = findTables(lines(sk.text));
    expect(t[0]?.head).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(t[0]?.rows).toHaveLength(2);
  });
});

describe('writing a priority in frontmatter', () => {
  const note = '---\ntitle: Call Dana\nstatus: todo\n---\nBody\n';
  it('adds the line and leaves everything else byte-identical', () => {
    expect(setFrontmatterField(note, 'priority', 'B')).toBe('---\ntitle: Call Dana\nstatus: todo\npriority: B\n---\nBody\n');
  });
  it('changes one letter and removes it on None, keeping CRLF', () => {
    const crlf = '---\r\ntitle: X\r\npriority: A # first\r\n---\r\nBody\r\n';
    expect(setFrontmatterField(crlf, 'priority', 'C')).toBe('---\r\ntitle: X\r\npriority: C # first\r\n---\r\nBody\r\n');
    expect(setFrontmatterField(crlf, 'priority', null)).toBe('---\r\ntitle: X\r\n---\r\nBody\r\n');
  });
});
