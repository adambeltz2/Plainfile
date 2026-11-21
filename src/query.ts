import type { TaskItem, VaultIndex } from './index';
import type { Note } from './parse';

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const byDue = (a: TaskItem, b: TaskItem) => (a.due ?? '').localeCompare(b.due ?? '') || a.path.localeCompare(b.path) || a.line - b.line;

export interface TodayView {
  overdue: TaskItem[];
  today: TaskItem[];
  thisWeek: TaskItem[];
}

/** The Today list: open tasks that are late, due today, or due in the next 7 days. */
export function todayView(tasks: TaskItem[], today: string): TodayView {
  const open = tasks.filter((t) => !t.done && t.due);
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
}

/** Words plus operators: tag:x  #x  folder:x  type:x  is:task|note|open|done  due:<date  @name  "a phrase" */
export function parseQuery(q: string): ParsedQuery {
  const p: ParsedQuery = { words: [], tags: [], folders: [], types: [], is: [], who: [], due: [] };
  for (const tok of q.match(/"[^"]+"|\S+/g) ?? []) {
    const l = tok.toLowerCase();
    if (l.startsWith('tag:')) p.tags.push(l.slice(4));
    else if (l.startsWith('#') && l.length > 1) p.tags.push(l.slice(1));
    else if (l.startsWith('folder:')) p.folders.push(l.slice(7));
    else if (l.startsWith('type:')) p.types.push(l.slice(5));
    else if (l.startsWith('is:')) p.is.push(l.slice(3));
    else if (l.startsWith('due:')) {
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
}

function dueOk(due: string | undefined, p: ParsedQuery): boolean {
  return p.due.every((d) => !!due && (d.op === '<' ? due < d.date : d.op === '>' ? due > d.date : due === d.date));
}

function noteMatches(n: Note, p: ParsedQuery): boolean {
  if (p.due.length || p.is.some((x) => x === 'task' || x === 'open' || x === 'done')) return false;
  if (p.tags.some((t) => !n.tags.includes(t))) return false;
  if (p.folders.some((f) => !n.path.toLowerCase().startsWith(f))) return false;
  if (p.types.some((t) => t !== n.type?.toLowerCase())) return false;
  const hay = `${n.title}\n${n.text}\n${n.path}\n${n.tags.join(' ')}`.toLowerCase();
  if (p.who.some((w) => !hay.includes(w.slice(1)))) return false;
  return p.words.every((w) => hay.includes(w));
}

function taskMatches(t: TaskItem, n: Note | undefined, p: ParsedQuery): boolean {
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

export function search(index: VaultIndex, q: string): SearchHit[] {
  const p = parseQuery(q);
  const hits: SearchHit[] = [];
  for (const n of index.notes.values()) {
    if (noteMatches(n, p)) hits.push({ kind: 'note', path: n.path, title: n.title, snippet: snippet(n.text, p.words), tags: n.tags });
  }
  for (const t of index.tasks()) {
    if (taskMatches(t, index.notes.get(t.path), p)) {
      hits.push({ kind: 'task', path: t.path, title: t.title, line: t.line, tags: t.tags, due: t.due, done: t.done, id: t.id });
    }
  }
  return hits;
}
