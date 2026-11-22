import { dirname, joinPath } from './index';

export interface LinkAt {
  kind: 'wiki' | 'md';
  target: string;
}

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
      if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return undefined; // empty, or a web address
      return { kind: 'md', target: t };
    }
  }
  return undefined;
}

/** Where a missing linked note should be made, and its starting text. It goes beside the note that links to it. */
export function newNoteForLink(from: string, link: LinkAt, today: string): { path: string; content: string; title: string } {
  const clean = link.target.replace(/\.md$/i, '').replace(/^\/+/, '');
  const path = link.kind === 'md' ? joinPath(dirname(from), link.target.replace(/\.md$/i, '') + '.md') : clean.includes('/') ? `${clean}.md` : joinPath(dirname(from), `${clean}.md`);
  const base = path.split('/').pop()!.replace(/\.md$/, '');
  const title = base.replace(/"/g, '');
  return { path, title, content: `---\ntitle: ${/[:#]/.test(title) ? JSON.stringify(title) : title}\ncreated: ${today}\n---\n\n` };
}
