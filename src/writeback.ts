import type { TaskItem, VaultIndex } from './index';
import type { Note } from './parse';
import { withCompletion } from './completion';
import { nextCopy, nextDue } from './recur';
import { inlineWithStatus, stripInlineStatus } from './inline-status';
import { normalizeStatus } from './fields';
import { setFrontmatterField } from './frontmatter';
import type { VaultStorage } from './storage';

/** The file no longer looks the way the index last saw it. Rescan and try again. */
export class StaleError extends Error {
  constructor(
    public path: string,
    public line: number,
  ) {
    super(`${path}:${line} changed since the last scan`);
    this.name = 'StaleError';
  }
}

export interface ChangeResult {
  path: string;
  line: number;
  before: string;
  after: string;
  /** False when the task was already in the requested state and nothing was written. */
  written: boolean;
  /** A second changed line in the same file, such as `completed:` in a task note's frontmatter. */
  also?: { line: number; before: string; after: string };
}

export interface TaskStatusOptions {
  /** Frontmatter status written when a file task is completed. */
  doneStatus?: string;
  /** Frontmatter status written when a completed file task is reopened. */
  reopenStatus?: string;
  /** Today's date. When given, finishing a task also writes the day it was finished, and reopening it removes that. */
  completedOn?: string;
}

/**
 * Edit one line of a file, guarded. `compute` gets the line (without its line ending)
 * and returns the new text for it, or null if nothing needs to change. Everything else
 * in the file, including line endings, stays byte for byte the same.
 */
async function editLine(
  storage: VaultStorage,
  index: VaultIndex,
  task: TaskItem,
  expectedRaw: (note: Note) => string | undefined,
  compute: (body: string, note: Note) => string | null,
  /** A change to the rest of the file, made in the same write (for example the `completed:` line). */
  fix?: (text: string) => string,
): Promise<ChangeResult> {
  const note = index.notes.get(task.path);
  if (!note) throw new Error(`no such note: ${task.path}`);

  // stat first, then read, then write with that stat as the guard.
  const stat = await storage.stat(task.path);
  const lines = (await storage.read(task.path)).split('\n');
  const idx = task.line - 1;
  const line = lines[idx];
  if (line === undefined) throw new StaleError(task.path, task.line);
  const hasCR = line.endsWith('\r');
  const body = hasCR ? line.slice(0, -1) : line;
  if (body !== expectedRaw(note)) throw new StaleError(task.path, task.line);

  const next = compute(body, note);
  if (next === null || next === body) return { path: task.path, line: task.line, before: body, after: body, written: false };

  lines[idx] = hasCR ? `${next}\r` : next;
  const edited = lines.join('\n');
  const text = fix ? fix(edited) : edited;
  await storage.write(task.path, text, stat.mtime);
  await index.refreshFile(task.path);
  const result: ChangeResult = { path: task.path, line: task.line, before: body, after: next, written: true };
  if (text !== edited) {
    const a = edited.split('\n');
    const b = text.split('\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const plain = (l: string | undefined): string => (l ?? '').replace(/\r$/, '');
    // A line added or removed (the next copy of a repeating task) is shown as just that line.
    if (b.length === a.length + 1) result.also = { line: i + 1, before: '', after: plain(b[i]) };
    else if (a.length === b.length + 1) result.also = { line: i + 1, before: plain(a[i]), after: '' };
    else result.also = { line: i + 1, before: plain(a[i]), after: plain(b[i]) };
  }
  return result;
}

const indentOf = (l: string): number => (/^[ \t]*/.exec(l)?.[0] ?? '').replace(/\t/g, '    ').length;

/** Where a task's own block ends: the line after it and any more deeply indented lines under it. */
function blockEnd(lines: string[], idx: number): number {
  const indent = indentOf(lines[idx] ?? '');
  let j = idx + 1;
  while (j < lines.length && (lines[j] ?? '').trim() !== '' && indentOf(lines[j] ?? '') > indent) j++;
  return j;
}

const withoutCreated = (l: string): string => l.replace(/\r$/, '').replace(/(\bcreated:\s?|➕\s*)\d{4}-\d{2}-\d{2}/i, '$1');

/** After ticking a repeating checkbox line: the text with the next copy added just below it (and its children). */
function addNextCopy(text: string, idx: number, task: TaskItem, today: string): string {
  const r = task.recur;
  if (!r) return text;
  const lines = text.split('\n');
  const cr = (lines[idx] ?? '').endsWith('\r') ? '\r' : '';
  const body = (lines[idx] ?? '').replace(/\r$/, '');
  const copy = nextCopy(body, nextDue(r, task.due, today), today);
  lines.splice(blockEnd(lines, idx), 0, copy + cr);
  return lines.join('\n');
}

/** After unticking: take away the copy that finishing it made, if it is still there and unchanged. */
function removeNextCopy(text: string, idx: number, task: TaskItem): string {
  const r = task.recur;
  if (!r || !task.completed) return text;
  const lines = text.split('\n');
  const at = blockEnd(lines, idx);
  const body = (lines[idx] ?? '').replace(/\r$/, '');
  const expected = nextCopy(body, nextDue(r, task.due, task.completed), task.completed);
  if (at < lines.length && withoutCreated(lines[at] ?? '') === withoutCreated(expected)) lines.splice(at, 1);
  return lines.join('\n');
}

function replaceStatus(body: string, value: string): string {
  const m = /^(status\s*:\s*)(.*?)(\s+#.*)?$/.exec(body);
  if (!m) throw new Error('not a status line');
  const quote = /^["']/.test(m[2] ?? '') ? (m[2] as string)[0] : '';
  return `${m[1]}${quote}${value}${quote}${m[3] ?? ''}`;
}

/**
 * Finishing a repeating task note: it stays a to-do, its `due:` moves to the next date and `completed:` is cleared, in
 * one guarded write. (The record of when it was done is the file history.) The lines that changed are shown.
 */
async function finishRepeatingNote(storage: VaultStorage, index: VaultIndex, task: TaskItem, on: string): Promise<ChangeResult> {
  const note = index.notes.get(task.path);
  if (!note?.fileTask || !task.recur) throw new Error(`not a repeating task note: ${task.id}`);
  const stat = await storage.stat(task.path);
  const text = await storage.read(task.path);
  const lines = text.split('\n');
  if ((lines[task.line - 1] ?? '').replace(/\r$/, '') !== note.fileTask.statusRaw) throw new StaleError(task.path, task.line);
  let out = setFrontmatterField(text, 'due', nextDue(task.recur, task.due, on));
  out = setFrontmatterField(out, 'status', 'todo');
  out = setFrontmatterField(out, 'completed', null);
  if (out === text) return { path: task.path, line: task.line, before: '', after: '', written: false };
  await storage.write(task.path, out, stat.mtime);
  await index.refreshFile(task.path);
  const b = out.split('\n');
  const plain = (l: string | undefined): string => (l ?? '').replace(/\r$/, '');
  const diffs: { line: number; before: string; after: string }[] = [];
  for (let i = 0; i < Math.max(lines.length, b.length) && diffs.length < 2; i++) {
    if (lines[i] !== b[i]) diffs.push({ line: i + 1, before: lines.length === b.length ? plain(lines[i]) : '', after: plain(b[i]) });
    if (lines.length !== b.length) break;
  }
  const first = diffs[0] as { line: number; before: string; after: string };
  return { path: task.path, line: first.line, before: first.before, after: first.after, written: true, also: diffs[1] };
}

/**
 * Tick or untick a task by editing the smallest possible piece of text:
 * one character for a checkbox line, one value for a task file's `status:` line.
 */
export async function setTaskDone(storage: VaultStorage, index: VaultIndex, id: string, done: boolean, opts: TaskStatusOptions = {}): Promise<ChangeResult> {
  const task = index.getTask(id);
  if (!task) throw new Error(`no such task: ${id}`);

  if (task.kind === 'inline') {
    return editLine(
      storage,
      index,
      task,
      (n) => n.tasks.find((x) => x.line === task.line)?.raw,
      (body, n) => {
        const t = n.tasks.find((x) => x.line === task.line);
        if (!t) throw new StaleError(task.path, task.line);
        const want = done ? 'x' : ' ';
        if ((body[t.col] === 'x' || body[t.col] === 'X' ? 'x' : ' ') === want) return null;
        const next = body.slice(0, t.col) + want + body.slice(t.col + 1);
        return withCompletion(done ? stripInlineStatus(next) : next, done, opts.completedOn); // a finished task no longer says "doing"
      },
      // A repeating task: finishing it adds the next copy below, and reopening it takes that copy away again.
      done
        ? opts.completedOn === undefined
          ? undefined
          : (text) => addNextCopy(text, task.line - 1, task, opts.completedOn!)
        : (text) => removeNextCopy(text, task.line - 1, task),
    );
  }
  if (done && task.recur && opts.completedOn !== undefined && !task.done) return finishRepeatingNote(storage, index, task, opts.completedOn);
  return editLine(
    storage,
    index,
    task,
    (n) => n.fileTask?.statusRaw,
    (body, n) => {
      if (n.fileTask?.done === done) return null;
      return replaceStatus(body, done ? (opts.doneStatus ?? 'done') : (opts.reopenStatus ?? 'todo'));
    },
    opts.completedOn === undefined ? undefined : (text) => setFrontmatterField(text, 'completed', done ? opts.completedOn! : null),
  );
}

/** Set a task file's status to any value, for example when a card moves between board columns. */
export async function setTaskStatus(
  storage: VaultStorage,
  index: VaultIndex,
  id: string,
  status: string,
  opts: { completedOn?: string } = {},
): Promise<ChangeResult> {
  const task = index.getTask(id);
  if (!task) throw new Error(`no such task: ${id}`);
  // Moving a repeating task to done finishes it the same way as ticking it, so the next one is made.
  if (normalizeStatus(status) === 'done' && task.recur && !task.done && opts.completedOn !== undefined)
    return setTaskDone(storage, index, id, true, { completedOn: opts.completedOn });
  if (task.kind === 'inline') {
    // A checkbox line keeps its status as a word on the line: status:doing, status:waiting.
    return editLine(
      storage,
      index,
      task,
      (n) => n.tasks.find((x) => x.line === task.line)?.raw,
      (body) => {
        const next = inlineWithStatus(body, status);
        return next === null ? null : withCompletion(next, normalizeStatus(status) === 'done', opts.completedOn);
      },
    );
  }
  return editLine(
    storage,
    index,
    task,
    (n) => n.fileTask?.statusRaw,
    (body, n) => (n.fileTask?.status === status.toLowerCase() ? null : replaceStatus(body, status)),
    opts.completedOn === undefined
      ? undefined
      : (text) => setFrontmatterField(text, 'completed', normalizeStatus(status) === 'done' ? opts.completedOn! : null),
  );
}
