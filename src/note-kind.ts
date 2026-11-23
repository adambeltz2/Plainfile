import type { Note } from './parse';
import { isProjectNote } from './projects';

/** What a note is, for the icon beside it in lists. Read from the note itself, so it follows whatever the user changes. */
export type NoteKind = 'project' | 'person' | 'task' | 'meeting' | 'journal' | 'note';

export const KIND_LABEL: Record<NoteKind, string> = {
  project: 'Project',
  person: 'Person',
  task: 'Task',
  meeting: 'Meeting',
  journal: 'Journal',
  note: 'Note',
};

export function noteKind(n: Note): NoteKind {
  const type = (n.type ?? '').toLowerCase();
  if (isProjectNote(n)) return 'project';
  if (n.fileTask || type === 'task') return 'task';
  if (type === 'person' || type === 'people') return 'person';
  if (type === 'meeting') return 'meeting';
  if (type === 'journal' || type === 'daily') return 'journal';
  if (!type) {
    if (/(^|\/)people\//i.test(n.path)) return 'person';
    if (/(^|\/)(journal|daily)\//i.test(n.path)) return 'journal';
    if (/(^|\/)meetings?\//i.test(n.path)) return 'meeting';
  }
  return 'note';
}
