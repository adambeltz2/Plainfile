import type { TaskItem, VaultIndex } from './index';
import { localDateOf, localToday } from './dates';
import type { Note } from './parse';
import { byPriority } from './priority';

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const byDue = (a: TaskItem, b: TaskItem) =>
  byPriority(a.priority, b.priority) || (a.due ?? '').localeCompare(b.due ?? '') || a.path.localeCompare(b.path) || a.line - b.line;

export interface TodayView {
  overdue: TaskItem[];
  today: TaskItem[];
  thisWeek: TaskItem[];
}

/**
 * The Today list: open tasks that are late, due today, or due in the next 7 days.
 * `keep` lists task ids to show even though they are done, so a task you just ticked
 * stays on screen (struck through) instead of vanishing under your cursor.
 */
export function todayView(tasks: TaskItem[], today: string, keep?: ReadonlySet<string>): TodayView {
  const open = tasks.filter((t) => (!t.done || keep?.has(t.id)) && t.due);
  const week = addDays(today, 7);
  return {
    overdue: open.filter((t) => t.due! < today).sort(byDue),
    today: open.filter((t) => t.due === today).sort(byDue),
    thisWeek: open.filter((t) => t.due! > today && t.due! <= week).sort(byDue),
  };
}

export interface ParsedQuery {
  words: string[];
  tags: string[];
  folders: string[];
  types: string[];
  is: string[];
  who: string[];
  due: { op: '<' | '>' | '='; date: string }[];
  /** `modified:` and `created:` tests, already worked out against today. `since` means on or after. */
  modified: DateTest[];
  created: DateTest[];
}

export interface DateTest {
  op: '<' | '>' | '=' | 'since';
  date: string;
}

/**
 * A day word for modified: and created:  today, yesterday, week, month, 3d (the last 3 days), 2w,
 * a date, or <date and >date. Returns undefined for something it cannot read.
 */
export function parseDateTest(v: string, today: string): DateTest | undefined {
  if (v === 'today') return { op: '=', date: today };
  if (v === 'yesterday') return { op: '=', date: addDays(today, -1) };
  if (v === 'week') return { op: 'since', date: addDays(today, -7) };
  if (v === 'month') return { op: 'since', date: addDays(today, -30) };
  const rel = /^(\d{1,3})([dw])$/.exec(v);
  if (rel) return { op: 'since', date: addDays(today, -Number(rel[1]) * (rel[2] === 'w' ? 7 : 1)) };
  const m = /^([<>]?)(\d{4}-\d{2}-\d{2})$/.exec(v);
  if (m) return { op: (m[1] || '=') as DateTest['op'], date: m[2]! };
  return undefined;
}

function dateOk(day: string | undefined, tests: DateTest[]): boolean {
  return tests.every((t) => !!day && (t.op === '<' ? day < t.date : t.op === '>' ? day > t.date : t.op === 'since' ? day >= t.date : day === t.date));
}

/** Words plus operators: tag:x  #x  folder:x  type:x  is:task|note|open|done  due:<date  @name  "a phrase" */
export function parseQuery(q: string, today: string = localToday()): ParsedQuery {
  const p: ParsedQuery = { words: [], tags: [], folders: [], types: [], is: [], who: [], due: [], modified: [], created: [] };
  for (const tok of q.match(/"[^"]+"|\S+/g) ?? []) {
    const l = tok.toLowerCase();
    if (l.startsWith('tag:')) p.tags.push(l.slice(4));
    else if (l.startsWith('#') && l.length > 1) p.tags.push(l.slice(1));
    else if (l.startsWith('folder:')) p.folders.push(l.slice(7));
    else if (l.startsWith('type:')) p.types.push(l.slice(5));
    else if (l.startsWith('is:')) p.is.push(l.slice(3));
    else if (l.startsWith('modified:') || l.startsWith('created:')) {
      const mod = l.startsWith('modified:');
      // Something unreadable matches nothing, rather than being ignored and showing everything.
      (mod ? p.modified : p.created).push(parseDateTest(l.slice(mod ? 9 : 8), today) ?? { op: '=', date: 'invalid' });
    } else if (l.startsWith('due:')) {
      const v = l.slice(4);
      const op = v[0] === '<' || v[0] === '>' ? (v[0] as '<' | '>') : '=';
      p.due.push({ op, date: op === '=' ? v : v.slice(1) });
    } else if (l.startsWith('@') && l.length > 1) p.who.push(l);
    else p.words.push(l.replace(/"/g, ''));
  }
  return p;
}

export interface SearchHit {
  kind: 'note' | 'task';
  path: string;
  title: string;
  line?: number;
  snippet?: string;
  tags: string[];
  due?: string;
  done?: boolean;
  id?: string;
  /** Notes only: when the file was last changed (ms since 1970). */
  mtime?: number;
}

function dueOk(due: string | undefined, p: ParsedQuery): boolean {
  return p.due.every((d) => !!due && (d.op === '<' ? due < d.date : d.op === '>' ? due > d.date : due === d.date));
}

function noteCreated(n: Note): string | undefined {
  const c = n.fileTask?.created ?? n.frontmatter.created;
  const s = c === undefined ? '' : String(c).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function noteMatches(n: Note, p: ParsedQuery): boolean {
  if (!dateOk(localDateOf(n.mtime), p.modified) || (p.created.length && !dateOk(noteCreated(n), p.created))) return false;
  if (p.due.length || p.is.some((x) => x === 'task' || x === 'open' || x === 'done')) return false;
  if (p.tags.some((t) => !n.tags.includes(t))) return false;
  if (p.folders.some((f) => !n.path.toLowerCase().startsWith(f))) return false;
  if (p.types.some((t) => t !== n.type?.toLowerCase())) return false;
  const hay = `${n.title}\n${n.text}\n${n.path}\n${n.tags.join(' ')}`.toLowerCase();
  if (p.who.some((w) => !hay.includes(w.slice(1)))) return false;
  return p.words.every((w) => hay.includes(w));
}

function taskMatches(t: TaskItem, n: Note | undefined, p: ParsedQuery): boolean {
  // A task has no modified time of its own, so modified: lists notes only.
  if (p.modified.length) return false;
  if (p.created.length && !dateOk(t.created, p.created)) return false;
  if (p.is.includes('note')) return false;
  if (p.is.includes('open') && t.done) return false;
  if (p.is.includes('done') && !t.done) return false;
  if (!dueOk(t.due, p)) return false;
  const tags = new Set([...t.tags, ...(n?.tags ?? [])]);
  if (p.tags.some((x) => !tags.has(x))) return false;
  if (p.folders.some((f) => !t.path.toLowerCase().startsWith(f))) return false;
  if (p.types.some((x) => x !== 'task' && x !== n?.type?.toLowerCase())) return false;
  if (p.who.some((w) => !t.who.includes(w) && !t.title.toLowerCase().includes(w.slice(1)))) return false;
  const hay = `${t.title} ${t.path} ${[...tags].join(' ')}`.toLowerCase();
  return p.words.every((w) => hay.includes(w));
}

function snippet(text: string, words: string[]): string {
  const lines = text.split('\n');
  const hit = words.length ? lines.find((l) => words.some((w) => l.toLowerCase().includes(w))) : undefined;
  return (hit ?? lines.find((l) => l.trim() && !l.startsWith('---')) ?? '').trim().slice(0, 140);
}

export function search(index: VaultIndex, q: string, today: string = localToday()): SearchHit[] {
  const p = parseQuery(q, today);
  const hits: SearchHit[] = [];
  for (const n of index.notes.values()) {
    if (noteMatches(n, p)) hits.push({ kind: 'note', path: n.path, title: n.title, snippet: snippet(n.text, p.words), tags: n.tags, mtime: n.mtime });
  }
  // A task that is its own note would be listed twice: as the note and as the task. Keep the task, which has the tick box and the
  // date. A note that matched only by its body has no task hit, so it stays.
  const taskNotes = new Set<string>();
  for (const t of index.tasks()) {
    if (taskMatches(t, index.notes.get(t.path), p)) {
      hits.push({ kind: 'task', path: t.path, title: t.title, line: t.line, tags: t.tags, due: t.due, done: t.done, id: t.id });
      if (t.kind === 'file') taskNotes.add(t.path);
    }
  }
  if (taskNotes.size) {
    const keep = hits.filter((h) => h.kind !== 'note' || !taskNotes.has(h.path));
    hits.length = 0;
    hits.push(...keep);
  }
  // Asking about when puts the newest first.
  if (p.modified.length) hits.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  return hits;
}

/** The notes changed most recently, for the Search screen before anything is typed. */
export function recentNotes(index: VaultIndex, limit = 12): SearchHit[] {
  return [...index.notes.values()]
    .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((n) => ({ kind: 'note' as const, path: n.path, title: n.title, snippet: snippet(n.text, []), tags: n.tags, mtime: n.mtime }));
}
