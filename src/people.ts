import { listOf, normalizeDate } from './fields';
import { allTasks, daysSince } from './home';
import type { HubTask } from './hub';
import type { VaultIndex } from './index';
import type { Note } from './parse';

/**
 * People, worked out from your own notes: `@dana` on a task, `people:` or `attendees:` in frontmatter, and notes
 * of `type: person`. A person note (title, file name and `aliases:`) joins the different spellings of a name
 * into one person. Nothing is stored and nothing has to be set up.
 */
export const slugName = (s: string): string => s.trim().replace(/^@/, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

const MENTION = /(?:^|[\s(])@([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;

export interface Person {
  /** The name everything is filed under: the person note's file name, or the name as written. */
  key: string;
  /** How to show it: the person note's title, or the name as written. */
  name: string;
  /** The person's own note, if there is one. */
  note?: Note;
  open: number;
  waiting: number;
  overdue: number;
  /** Notes that mention them (people fields, attendees, or @name in the text), not counting their own note. */
  notes: number;
  /** The newest change among notes that mention them (ms), or 0. */
  lastSeen: number;
}

/** Spellings of a name that mean the same person, from person notes. */
function aliasMap(index: VaultIndex): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of index.notes.values()) {
    if (String(n.frontmatter.type ?? '').toLowerCase() !== 'person') continue;
    const key = slugName(n.name);
    for (const s of [n.name, n.title, ...listOf(n.frontmatter.aliases)]) if (slugName(s)) m.set(slugName(s), key);
  }
  return m;
}

/** The people a note names: its people fields and its @mentions. */
function namesIn(n: Note): string[] {
  const out = new Set<string>();
  for (const k of ['people', 'attendees', 'owner', 'assignee']) for (const p of listOf(n.frontmatter[k])) out.add(p);
  const text = n.text.replace(/^---[\s\S]*?\n---/, '');
  for (const m of text.matchAll(MENTION)) out.add(m[1] as string);
  return [...out];
}

export interface PeopleIndex {
  people: Person[];
  /** Tasks by person key. */
  tasks: Map<string, HubTask[]>;
  /** Notes that mention a person, by key. */
  mentions: Map<string, Note[]>;
  resolve: (name: string) => string;
}

export function buildPeople(index: VaultIndex, today: string): PeopleIndex {
  const alias = aliasMap(index);
  const resolve = (s: string): string => {
    const k = slugName(s);
    return alias.get(k) ?? k;
  };
  const display = new Map<string, string>();
  const notes = new Map<string, Note>();
  for (const n of index.notes.values()) {
    if (String(n.frontmatter.type ?? '').toLowerCase() === 'person') {
      const k = slugName(n.name);
      notes.set(k, n);
      display.set(k, n.title);
    }
  }
  const see = (name: string): string => {
    const k = resolve(name);
    if (k && !display.has(k)) display.set(k, name.replace(/^@/, ''));
    return k;
  };
  const tasks = new Map<string, HubTask[]>();
  for (const t of allTasks(index)) {
    for (const p of new Set(t.people.map(see).filter(Boolean))) tasks.set(p, [...(tasks.get(p) ?? []), t]);
  }
  const mentions = new Map<string, Note[]>();
  for (const n of index.notes.values()) {
    const own = String(n.frontmatter.type ?? '').toLowerCase() === 'person' ? slugName(n.name) : '';
    for (const p of new Set(namesIn(n).map(see).filter(Boolean))) if (p !== own) mentions.set(p, [...(mentions.get(p) ?? []), n]);
  }
  const keys = new Set([...display.keys()].filter((k) => tasks.has(k) || mentions.has(k) || notes.has(k)));
  const people: Person[] = [...keys].map((key) => {
    const ts = tasks.get(key) ?? [];
    const open = ts.filter((t) => t.status !== 'done');
    const ms = mentions.get(key) ?? [];
    return {
      key,
      name: display.get(key) ?? key,
      note: notes.get(key),
      open: open.length,
      waiting: open.filter((t) => t.status === 'waiting').length,
      overdue: open.filter((t) => t.due && t.due < today).length,
      notes: ms.filter((n) => !n.fileTask).length,
      lastSeen: ms.reduce((m, n) => Math.max(m, n.mtime), 0),
    };
  });
  people.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return { people, tasks, mentions, resolve };
}

export interface PersonPage {
  person: Person;
  open: HubTask[];
  waiting: HubTask[];
  done: number;
  /** Notes with a date (meetings) that name them, newest first. */
  meetings: Note[];
  /** Other notes that name them, newest first. */
  notes: Note[];
  /** Whole days since they last appeared in a note, if ever. */
  quietDays?: number;
}

export function personPage(p: PeopleIndex, key: string, today: string): PersonPage | undefined {
  const person = p.people.find((x) => x.key === key);
  if (!person) return undefined;
  const ts = p.tasks.get(key) ?? [];
  const ms = (p.mentions.get(key) ?? []).filter((n) => !n.fileTask).sort((a, b) => b.mtime - a.mtime);
  const dated = (n: Note): boolean => !!normalizeDate(n.frontmatter.date);
  const meetings = ms.filter(dated).sort((a, b) => (normalizeDate(b.frontmatter.date) ?? '').localeCompare(normalizeDate(a.frontmatter.date) ?? ''));
  const last = person.lastSeen ? new Date(person.lastSeen).toISOString().slice(0, 10) : undefined;
  return {
    person,
    open: ts.filter((t) => t.status !== 'done' && t.status !== 'waiting').sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.item.title.localeCompare(b.item.title)),
    waiting: ts.filter((t) => t.status === 'waiting'),
    done: ts.filter((t) => t.status === 'done').length,
    meetings,
    notes: ms.filter((n) => !dated(n)),
    quietDays: daysSince(last, today),
  };
}
