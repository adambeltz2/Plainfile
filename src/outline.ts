/** One heading in a note: its 1-based line, its level (1 to 6) and its text without markdown marks. */
export interface Heading {
  line: number;
  level: number;
  title: string;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** A heading's text as plain words: links, emphasis and code marks removed. */
function plain(s: string): string {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')
    .trim();
}

/**
 * The headings of a note, in order, for a table of contents. Lines in frontmatter, fenced code and HTML comments
 * are not headings. A heading with no words is left out. Reading only; the note is never changed.
 */
export function outline(text: string): Heading[] {
  const lines = text.split('\n');
  const at = (n: number): string => (lines[n] ?? '').replace(/\r$/, '');
  const out: Heading[] = [];
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
    const m = HEADING.exec(l);
    const title = m ? plain(m[2] ?? '') : '';
    if (m && title) out.push({ line: i + 1, level: (m[1] as string).length, title });
  }
  return out;
}
