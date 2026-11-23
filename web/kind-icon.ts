import { KIND_LABEL, noteKind, type NoteKind } from '../src/note-kind';
import type { Note } from '../src/parse';

/** Line drawings in the current text colour, so they follow light and dark and the selected row's inversion. */
const SHAPES: Record<NoteKind, string> = {
  project: '<path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/>',
  person: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.6-2.6 2.5-4 5-4s4.4 1.4 5 4"/>',
  task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8.2l1.8 1.8 3.4-3.8"/>',
  meeting: '<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>',
  journal: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  note: '<path d="M4 2h5.5L12 4.5V14H4z"/><path d="M9.5 2v2.5H12M6 8h4M6 10.5h4"/>',
};

export function kindIconFor(kind: NoteKind): string {
  const label = KIND_LABEL[kind];
  return `<svg class="kind kind-${kind}" role="img" aria-label="${label}" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SHAPES[kind]}</svg>`;
}

/** The icon for a note, or nothing if the note is not known. */
export function kindIcon(n: Note | undefined): string {
  return n ? kindIconFor(noteKind(n)) : '';
}
