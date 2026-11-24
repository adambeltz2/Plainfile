import { cells, TABLE_SEP } from './render';

/** A markdown table found in a note: where it sits (0-based line numbers, both included) and what is in its cells. */
export interface TableBlock {
  start: number;
  end: number;
  head: string[];
  align: ('left' | 'center' | 'right' | null)[];
  rows: string[][];
}

const FENCE = /^\s*(```|~~~)/;

/**
 * Every table in the lines of a note: a header row, a separator row (`| --- | :-: |`) and the rows under it, up to the
 * first line without a `|`. Tables inside frontmatter, a fenced code block or an HTML comment are code or notes to
 * yourself, so they are left out. Reading only; nothing is changed.
 */
export function findTables(lines: string[]): TableBlock[] {
  const out: TableBlock[] = [];
  const at = (n: number): string => (lines[n] ?? '').replace(/\r$/, '');
  let i = 0;
  if (at(0) === '---') {
    for (let n = 1; n < lines.length; n++) {
      if (at(n) === '---' || at(n) === '...') {
        i = n + 1;
        break;
      }
    }
  }
  let fence = false;
  let comment = false;
  for (; i < lines.length; i++) {
    const l = at(i);
    if (FENCE.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (comment || l.trimStart().startsWith('<!--')) {
      comment = !(comment ? l : l.slice(l.indexOf('<!--') + 4)).includes('-->');
      continue;
    }
    if (!l.includes('|') || i + 1 >= lines.length || !TABLE_SEP.test(at(i + 1))) continue;
    const head = cells(l);
    const sep = cells(at(i + 1));
    if (sep.length !== head.length) continue; // GFM: a table's header and separator have the same number of cells
    const align = sep.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
    const rows: string[][] = [];
    let end = i + 1;
    while (end + 1 < lines.length && at(end + 1).includes('|') && at(end + 1).trim()) rows.push(cells(at(++end)));
    out.push({ start: i, end, head, align, rows });
    i = end;
  }
  return out;
}

/** A starter table for the `/table` command, and the text of its first header cell, so typing replaces it. */
export function tableSkeleton(columns = 3, rows = 2): { text: string; select: { from: number; to: number } } {
  const head = `| ${Array.from({ length: columns }, (_, c) => `Column ${c + 1}`).join(' | ')} |`;
  const sep = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
  const blank = `|${Array.from({ length: columns }, () => '  ').join('|')}|`;
  const text = [head, sep, ...Array.from({ length: rows }, () => blank)].join('\n');
  return { text, select: { from: 2, to: 2 + 'Column 1'.length } };
}
