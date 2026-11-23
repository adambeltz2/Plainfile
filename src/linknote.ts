import { dirname, joinPath } from './index';

export interface LinkAt {
  kind: 'wiki' | 'md' | 'url';
  /** A note name or path, or for `url` the whole web address. */
  target: string;
}

/** A web address pasted or typed in the text, without the punctuation that follows it in a sentence. */
export const BARE_URL = /https?:\/\/[^\s<>\]]+/g;
export const trimUrl = (u: string): string => u.replace(/[.,;:!?'")]+$/, '');

/** The link under a position in one line of text: `[[Name]]`, `[[Name|label]]`, `[[Name#Heading]]` or `[label](path.md)`. */
export function linkAt(line: string, col: number): LinkAt | undefined {
  for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const from = m.index ?? 0;
    if (col > from && col < from + m[0].length) {
      const target = (m[1] ?? '').split('|')[0]!.split('#')[0]!.trim();
      return target ? { kind: 'wiki', target } : undefined;
    }
  }
  for (const m of line.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const from = m.index ?? 0;
    if (col > from && col < from + m[0].length) {
      const t = decodeURI((m[1] ?? '').split('#')[0]!);
      if (/^https?:\/\//i.test(m[1] ?? '')) return { kind: 'url', target: m[1] as string };
      if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return undefined; // empty, or some other kind of address
      return { kind: 'md', target: t };
    }
  }
  // A web address on its own, or in <angle brackets>.
  for (const m of line.matchAll(BARE_URL)) {
    const from = m.index ?? 0;
    const url = trimUrl(m[0]);
    if (col > from && col < from + url.length) return { kind: 'url', target: url };
  }
  return undefined;
}

/** Where a missing linked note should be made, and its starting text. It goes beside the note that links to it. */
export function newNoteForLink(from: string, link: LinkAt, today: string): { path: string; content: string; title: string } {
  const clean = link.target.replace(/\.md$/i, '').replace(/^\/+/, '');
  const path =
    link.kind === 'md'
      ? joinPath(dirname(from), link.target.replace(/\.md$/i, '') + '.md')
      : clean.includes('/')
        ? `${clean}.md`
        : joinPath(dirname(from), `${clean}.md`);
  const base = path.split('/').pop()!.replace(/\.md$/, '');
  const title = base.replace(/"/g, '');
  return { path, title, content: `---\ntitle: ${/[:#]/.test(title) ? JSON.stringify(title) : title}\ncreated: ${today}\n---\n\n` };
}
