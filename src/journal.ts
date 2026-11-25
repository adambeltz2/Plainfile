import { normalizeDate } from './fields';
import type { VaultIndex } from './index';
import { noteKind } from './note-kind';
import type { Note } from './parse';

/** One journal entry: the note and the day it is for. */
export interface Journal {
  path: string;
  date: string;
  title: string;
}

/**
 * The day a journal note is for: its `date:`, else a date at the start of its file name, else its title. A journal
 * is a note of `type: journal` (or `daily`), or one in a `journal/` or `daily/` folder; one with no day cannot be
 * placed on a calendar, so it is left out.
 */
export function journalDay(n: Note): string | undefined {
  if (noteKind(n) !== 'journal') return undefined;
  const fromName = /^\d{4}-\d{2}-\d{2}/.exec(n.name)?.[0];
  return normalizeDate(n.frontmatter.date) ?? fromName ?? normalizeDate(n.title);
}

/** Every journal entry, newest day first. Two notes for one day are both listed. */
export function listJournals(index: VaultIndex): Journal[] {
  const out: Journal[] = [];
  for (const n of index.notes.values()) {
    const date = journalDay(n);
    if (date) out.push({ path: n.path, date, title: n.title });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.path.localeCompare(b.path));
}

/** The journal for a day, if there is one. */
export const journalFor = (list: Journal[], date: string): Journal | undefined => list.find((j) => j.date === date);

/** What the Home button should offer: today's journal, else the latest, and whether today's can be started. */
export function homeJournal(list: Journal[], today: string): { open?: Journal; latest: boolean; start: boolean } {
  const t = journalFor(list, today);
  if (t) return { open: t, latest: false, start: false };
  return { open: list[0], latest: !!list[0], start: true };
}
