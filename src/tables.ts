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

/* ---------- editing a table as a table ---------- */

export type Align = 'left' | 'center' | 'right' | null;

/** One row of a table. `src` is the line of the table's original text it came from, so an untouched row keeps its own text. */
export interface TRow {
  cells: string[];
  src?: number;
}

/** A table in a note, as cells. Cell text is the markdown of the cell, with `\|` read as `|` and `<br>` as it is written. */
export interface TableModel {
  head: TRow;
  align: Align[];
  /** The separator line's place in the original text, kept while the alignment and columns are unchanged. */
  sepSrc?: number;
  rows: TRow[];
}

const sepCell = (a: Align): string => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---');

/** A cell as written in a line: a `|` is escaped and a line break is a break tag. */
export const escapeCell = (s: string): string => s.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');

/**
 * The lines of a table (header, separator, rows) as cells to edit, or undefined when a visual edit could lose something:
 * a row with more cells than the header has columns would have its extra cells dropped, so such a table is left as text.
 */
export function parseTable(block: TableBlock): TableModel | undefined {
  const n = block.head.length;
  if (!n || block.rows.some((r) => r.length > n)) return undefined;
  const pad = (r: string[]): string[] => [...r, ...Array.from({ length: n - r.length }, () => '')];
  return { head: { cells: [...block.head], src: 0 }, align: [...block.align], sepSrc: 1, rows: block.rows.map((r, i) => ({ cells: pad(r), src: i + 2 })) };
}

/** The table as lines. A row or separator that was not changed is written exactly as it was; a changed one is written compactly. */
export function writeTable(m: TableModel, original: string[]): string[] {
  const line = (cells: string[]): string => `| ${cells.map(escapeCell).join(' | ')} |`;
  const keep = (r: TRow): string => (r.src !== undefined && original[r.src] !== undefined ? (original[r.src] as string) : line(r.cells));
  const sep = m.sepSrc !== undefined && original[m.sepSrc] !== undefined ? (original[m.sepSrc] as string) : `| ${m.align.map(sepCell).join(' | ')} |`;
  return [keep(m.head), sep, ...m.rows.map(keep)];
}

const dirty = (cells: string[]): TRow => ({ cells });
const width = (m: TableModel): number => m.head.cells.length;

/** A new cell text. `r` is -1 for the header. */
export function setCell(m: TableModel, r: number, c: number, text: string): TableModel {
  const old = r < 0 ? m.head : m.rows[r];
  if (!old || old.cells[c] === undefined || old.cells[c] === text) return m;
  const cells = old.cells.map((x, i) => (i === c ? text : x));
  return r < 0 ? { ...m, head: dirty(cells) } : { ...m, rows: m.rows.map((x, i) => (i === r ? dirty(cells) : x)) };
}

/** A blank row at a position among the body rows (0 is above the first). */
export function insertRow(m: TableModel, at: number): TableModel {
  const rows = [...m.rows];
  rows.splice(Math.max(0, Math.min(at, rows.length)), 0, dirty(Array.from({ length: width(m) }, () => '')));
  return { ...m, rows };
}

export function deleteRow(m: TableModel, r: number): TableModel {
  return r < 0 || r >= m.rows.length ? m : { ...m, rows: m.rows.filter((_, i) => i !== r) };
}

/** A blank column at a position (0 is before the first). Every row changes, so every row is rewritten. */
export function insertCol(m: TableModel, at: number): TableModel {
  const i = Math.max(0, Math.min(at, width(m)));
  const add = (cells: string[], fill: string): string[] => [...cells.slice(0, i), fill, ...cells.slice(i)];
  return {
    head: dirty(add(m.head.cells, `Column ${width(m) + 1}`)),
    align: [...m.align.slice(0, i), null, ...m.align.slice(i)],
    rows: m.rows.map((r) => dirty(add(r.cells, ''))),
  };
}

/** Removes a column; a table keeps at least one. */
export function deleteCol(m: TableModel, c: number): TableModel {
  if (width(m) < 2 || c < 0 || c >= width(m)) return m;
  const drop = (cells: string[]): string[] => cells.filter((_, i) => i !== c);
  return { head: dirty(drop(m.head.cells)), align: m.align.filter((_, i) => i !== c), rows: m.rows.map((r) => dirty(drop(r.cells))) };
}

export function setAlign(m: TableModel, c: number, a: Align): TableModel {
  if (c < 0 || c >= width(m) || m.align[c] === a) return m;
  return { ...m, align: m.align.map((x, i) => (i === c ? a : x)), sepSrc: undefined };
}

/** A starter table of a size: a header row, a separator and blank rows. */
export function sizedTable(columns: number, rows: number): string[] {
  const n = Math.max(1, Math.min(12, Math.round(columns) || 1));
  const body = Math.max(0, Math.min(50, Math.round(rows) || 0));
  const head = `| ${Array.from({ length: n }, (_, c) => `Column ${c + 1}`).join(' | ')} |`;
  const sep = `| ${Array.from({ length: n }, () => '---').join(' | ')} |`;
  const blank = `|${Array.from({ length: n }, () => '  ').join('|')}|`;
  return [head, sep, ...Array.from({ length: body }, () => blank)];
}
