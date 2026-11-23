import type { TaskItem, VaultIndex } from './index';
import type { Note } from './parse';
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
}

export interface TaskStatusOptions {
  /** Frontmatter status written when a file task is completed. */
  doneStatus?: string;
  /** Frontmatter status written when a completed file task is reopened. */
  reopenStatus?: string;
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
  await storage.write(task.path, lines.join('\n'), stat.mtime);
  await index.refreshFile(task.path);
  return { path: task.path, line: task.line, before: body, after: next, written: true };
}

function replaceStatus(body: string, value: string): string {
  const m = /^(status\s*:\s*)(.*?)(\s+#.*)?$/.exec(body);
  if (!m) throw new Error('not a status line');
  const quote = /^["']/.test(m[2] ?? '') ? (m[2] as string)[0] : '';
  return `${m[1]}${quote}${value}${quote}${m[3] ?? ''}`;
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
        return body.slice(0, t.col) + want + body.slice(t.col + 1);
      },
    );
  }
  return editLine(
    storage,
    index,
    task,
    (n) => n.fileTask?.statusRaw,
    (body, n) => {
      if (n.fileTask?.done === done) return null;
      return replaceStatus(body, done ? (opts.doneStatus ?? 'done') : (opts.reopenStatus ?? 'todo'));
    },
  );
}

/** Set a task file's status to any value, for example when a card moves between board columns. */
export async function setTaskStatus(storage: VaultStorage, index: VaultIndex, id: string, status: string): Promise<ChangeResult> {
  const task = index.getTask(id);
  if (!task || task.kind !== 'file') throw new Error(`not a task file: ${id}`);
  return editLine(
    storage,
    index,
    task,
    (n) => n.fileTask?.statusRaw,
    (body, n) => (n.fileTask?.status === status.toLowerCase() ? null : replaceStatus(body, status)),
  );
}
