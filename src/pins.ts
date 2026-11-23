import type { VaultIndex } from './index';
import type { Note } from './parse';

/** A note pinned with `pinned: true` in its frontmatter (⋯ More, Pin to top). Pinning is just that one line. */
export function isPinnedNote(n: Note): boolean {
  return n.frontmatter.pinned === true || String(n.frontmatter.pinned).toLowerCase() === 'true';
}

export function pinnedNotes(index: VaultIndex): Note[] {
  return [...index.notes.values()].filter(isPinnedNote).sort((a, b) => a.title.localeCompare(b.title));
}
