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

import { deleteCol, deleteRow, insertCol, insertRow, parseTable, setAlign, setCell, sizedTable, writeTable } from '../src/tables';

describe('editing a table as cells', () => {
  const PADDED = [
    '| Item        | Owner | Status  |',
    '| ----------- | :---: | ------: |',
    '| Logo files  | Dana  | Doing   |',
    '| Pricing     | Sam   | Todo    |',
  ];
  const model = () => {
    const t = findTables(PADDED)[0]!;
    return parseTable(t)!;
  };
  it('writes an untouched table exactly as it was, padding and all', () => {
    expect(writeTable(model(), PADDED)).toEqual(PADDED);
  });
  it('changing one cell rewrites that line only', () => {
    const out = writeTable(setCell(model(), 1, 2, 'Doing'), PADDED);
    expect(out).toEqual([PADDED[0], PADDED[1], PADDED[2], '| Pricing | Sam | Doing |']);
  });
  it('the header is a row too, and changing its alignment rewrites only the separator', () => {
    expect(writeTable(setCell(model(), -1, 0, 'Thing'), PADDED)[0]).toBe('| Thing | Owner | Status |');
    const out = writeTable(setAlign(model(), 0, 'left'), PADDED);
    expect(out).toEqual([PADDED[0], '| :--- | :---: | ---: |', PADDED[2], PADDED[3]]);
  });
  it('adds and removes rows without touching the others', () => {
    const added = writeTable(insertRow(model(), 1), PADDED);
    expect(added).toEqual([PADDED[0], PADDED[1], PADDED[2], '|  |  |  |', PADDED[3]]);
    expect(writeTable(deleteRow(model(), 0), PADDED)).toEqual([PADDED[0], PADDED[1], PADDED[3]]);
  });
  it('adds and removes a column, rewriting every row, and keeps at least one column', () => {
    const wider = writeTable(insertCol(model(), 3), PADDED);
    expect(wider).toEqual([
      '| Item | Owner | Status | Column 4 |',
      '| --- | :---: | ---: | --- |',
      '| Logo files | Dana | Doing |  |',
      '| Pricing | Sam | Todo |  |',
    ]);
    const narrower = writeTable(deleteCol(model(), 1), PADDED);
    expect(narrower).toEqual(['| Item | Status |', '| --- | ---: |', '| Logo files | Doing |', '| Pricing | Todo |']);
    let one = model();
    one = deleteCol(deleteCol(one, 0), 0);
    expect(one.head.cells).toHaveLength(1);
    expect(deleteCol(one, 0)).toBe(one);
  });
  it('escapes a pipe and a line break in a cell, and reads them back', () => {
    const out = writeTable(setCell(model(), 0, 0, 'a|b\nc'), PADDED);
    expect(out[2]).toBe('| a\\|b<br>c | Dana | Doing |');
    const again = parseTable(findTables(out)[0]!)!;
    expect(again.rows[0]!.cells[0]).toBe('a|b<br>c');
  });
  it('leaves a table with an extra cell in a row as text, so nothing is dropped', () => {
    expect(parseTable(findTables(['| a | b |', '| - | - |'.replace(/-/g, '---'), '| 1 | 2 | 3 |'])[0]!)).toBeUndefined();
  });
  it('pads a short row, and sizes a starter table', () => {
    const t = parseTable(findTables(['| a | b | c |', '| --- | --- | --- |', '| 1 |'])[0]!)!;
    expect(t.rows[0]!.cells).toEqual(['1', '', '']);
    expect(sizedTable(2, 3)).toEqual(['| Column 1 | Column 2 |', '| --- | --- |', '|  |  |', '|  |  |', '|  |  |']);
    expect(sizedTable(99, 999)).toHaveLength(52);
    expect(findTables(sizedTable(4, 2))[0]?.rows).toHaveLength(2);
  });
});

describe('separator rows', () => {
  it('accepts a single hyphen with colons, as GitHub markdown does', () => {
    const t = findTables(['| a | b | c |', '| :-- | :-: | --: |', '| 1 | 2 | 3 |'])[0]!;
    expect(t.align).toEqual(['left', 'center', 'right']);
    expect(findTables(['| a | b |', '| - | - |', '| 1 | 2 |'])).toHaveLength(1);
  });
});
