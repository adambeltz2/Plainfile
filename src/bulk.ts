import { addFrontmatterListItem, setFrontmatterField } from './frontmatter';
import type { VaultIndex } from './index';
import { STATUSES, type Status } from './fields';
import { inlineWithStatus, stripInlineStatus } from './inline-status';
import { PRIORITY_EMOJI } from './priority';
import { ConflictError, type VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

/**
 * One change applied to many tasks at once. It is worked out first and shown as the lines that would
 * change (nothing is written), then written one note at a time, each guarded by what the note held when
 * it was planned. The same edits reversed give Undo.
 */
export type BulkAction =
  | { kind: 'done'; done: boolean }
  | { kind: 'status'; status: Status }
  | { kind: 'due'; date: string | null }
  | { kind: 'priority'; letter: string | null }
  | { kind: 'person'; name: string }
  | { kind: 'tag'; tag: string };

export interface FileEdit {
  path: string;
  before: string;
  after: string;
  /** How many selected tasks this note holds. */
  tasks: number;
  /** The first line that changes, before and after, for the preview. */
  line: number;
  was: string;
  now: string;
}

export interface BulkPlan {
  edits: FileEdit[];
  /** Selected tasks the action cannot change, such as setting "doing" on a checkbox line. */
  skipped: number;
}

const CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX](\])/;
const DUE = /(#?\bdue:)\d{4}-\d{2}-\d{2}/i;
const AFTER_BOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\] )(?:\([A-Z]\) ?)?/;

/** A line with its priority set to a letter, or removed. A line with nothing after the checkbox cannot take one. */
function withPriority(body: string, letter: string | null): string | null {
  const m = AFTER_BOX.exec(body);
  if (!m) return null;
  const text = body.slice(m[0].length).replace(PRIORITY_EMOJI, '').replace(/^\s+/, '');
  return letter === null ? m[1] + text : `${m[1]}(${letter})${text ? ' ' + text : ''}`;
}

/** One checkbox line after the action, or null if the action does not apply to a line. */
export function editInlineLine(line: string, a: BulkAction): string | null {
  const cr = line.endsWith('\r') ? '\r' : '';
  const body = cr ? line.slice(0, -1) : line;
  let out: string | null = null;
  if (a.kind === 'done') {
    const ticked = CHECKBOX.test(body) ? body.replace(CHECKBOX, (_m, a1: string, a2: string) => `${a1}${a.done ? 'x' : ' '}${a2}`) : null;
    out = ticked !== null && a.done ? stripInlineStatus(ticked) : ticked; // a finished task no longer says "doing"
  } else if (a.kind === 'status') out = inlineWithStatus(body, a.status);
  else if (a.kind === 'priority') out = withPriority(body, a.letter);
  else if (a.kind === 'due') {
    if (a.date === null) out = body.replace(/\s*#?\bdue:\d{4}-\d{2}-\d{2}/i, '');
    else out = DUE.test(body) ? body.replace(DUE, (_m, k: string) => `${k}${a.date}`) : `${body.replace(/\s+$/, '')} due:${a.date}`;
  } else if (a.kind === 'person') {
    const n = a.name.replace(/^@/, '').trim().replace(/\s+/g, '-');
    out = !n || new RegExp(`(^|\\s)@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i').test(body) ? body : `${body.replace(/\s+$/, '')} @${n}`;
  } else {
    const t = a.tag.replace(/^#/, '').trim().replace(/\s+/g, '-');
    out = !t || new RegExp(`(^|\\s)#${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`, 'i').test(body) ? body : `${body.replace(/\s+$/, '')} #${t}`;
  }
  return out === null ? null : out + cr;
}

/** A task note's text after the action. */
export function editFileText(text: string, a: BulkAction): string | null {
  switch (a.kind) {
    case 'done':
      return setFrontmatterField(text, 'status', a.done ? 'done' : 'todo');
    case 'status':
      return setFrontmatterField(text, 'status', a.status);
    case 'due':
      return setFrontmatterField(text, 'due', a.date);
    case 'priority':
      return setFrontmatterField(text, 'priority', a.letter);
    case 'person':
      return addFrontmatterListItem(text, 'people', a.name.replace(/^@/, '').trim().replace(/\s+/g, '-'));
    case 'tag':
      return addFrontmatterListItem(text, 'tags', a.tag.replace(/^#/, '').trim().replace(/\s+/g, '-'));
  }
}

export function checkAction(a: BulkAction): string | null {
  if (a.kind === 'status' && !STATUSES.includes(a.status)) return 'That is not a status.';
  if (a.kind === 'due' && a.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return 'Pick a date.';
  if (a.kind === 'priority' && a.letter !== null && !/^[A-Z]$/.test(a.letter)) return 'A priority is one capital letter, A to Z.';
  if (a.kind === 'person' && !a.name.replace(/^@/, '').trim()) return 'Type a name.';
  if (a.kind === 'tag' && !a.tag.replace(/^#/, '').trim()) return 'Type a tag.';
  return null;
}

/** Work out the edits for these task ids. Reads each note once and writes nothing. */
export async function planBulk(storage: VaultStorage, index: VaultIndex, ids: string[], action: BulkAction): Promise<BulkPlan> {
  const bad = checkAction(action);
  if (bad) throw new Error(bad);
  const byPath = new Map<string, { lines: number[]; file: boolean }>();
  let skipped = 0;
  for (const id of ids) {
    const t = index.getTask(id);
    if (!t) {
      skipped++;
      continue;
    }
    const e = byPath.get(t.path) ?? { lines: [], file: t.kind === 'file' };
    if (t.kind === 'file') e.file = true;
    else e.lines.push(t.line);
    byPath.set(t.path, e);
  }
  const edits: FileEdit[] = [];
  for (const [path, { lines, file }] of [...byPath].sort((a, b) => a[0].localeCompare(b[0]))) {
    const before = await storage.read(path);
    let after = before;
    let changedTasks = 0;
    if (file) {
      const next = editFileText(after, action);
      if (next !== null && next !== after) {
        after = next;
        changedTasks++;
      } else if (next === null) skipped++;
    }
    if (lines.length) {
      const all = after.split('\n');
      for (const n of lines) {
        const cur = all[n - 1];
        if (cur === undefined) {
          skipped++;
          continue;
        }
        const next = editInlineLine(cur, action);
        if (next === null) skipped++;
        else if (next !== cur) {
          all[n - 1] = next;
          changedTasks++;
        }
      }
      after = all.join('\n');
    }
    if (after === before) continue;
    const a = before.split('\n');
    const b = after.split('\n');
    let s = 0;
    while (s < a.length && s < b.length && a[s] === b[s]) s++;
    edits.push({ path, before, after, tasks: changedTasks, line: s + 1, was: (a[s] ?? '').replace(/\r$/, ''), now: (b[s] ?? '').replace(/\r$/, '') });
  }
  return { edits, skipped };
}

/** Write the edits. A note that is no longer what was planned stops everything after it, and nothing is overwritten. */
export async function applyBulk(
  storage: VaultStorage,
  index: VaultIndex,
  edits: FileEdit[],
  direction: 'forward' | 'back' = 'forward',
): Promise<ChangeResult[]> {
  const out: ChangeResult[] = [];
  for (const e of edits) {
    const want = direction === 'forward' ? e.before : e.after;
    const to = direction === 'forward' ? e.after : e.before;
    const stat = await storage.stat(e.path);
    const text = await storage.read(e.path);
    if (text !== want) throw new StaleError(e.path, e.line);
    try {
      await storage.write(e.path, to, stat.mtime);
    } catch (err) {
      if (err instanceof ConflictError) throw err;
      throw err;
    }
    await index.refreshFile(e.path);
    out.push({ path: e.path, line: e.line, before: direction === 'forward' ? e.was : e.now, after: direction === 'forward' ? e.now : e.was, written: true });
  }
  return out;
}
