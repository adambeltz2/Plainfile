import type { TaskItem, VaultIndex } from './index';
import type { VaultStorage } from './storage';

/** The file no longer looks the way the index last saw it. Rescan and try again. */
export class StaleError extends Error {
  constructor(public path: string, public line: number) {
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
 * Tick or untick a task by editing the smallest possible piece of text:
 * one character for a checkbox line, one value for a task file's `status:` line.
 * Everything else in the file, including line endings, stays byte-for-byte the same.
 */
export async function setTaskDone(
  storage: VaultStorage,
  index: VaultIndex,
  id: string,
  done: boolean,
  opts: TaskStatusOptions = {},
): Promise<ChangeResult> {
  const task = index.getTask(id);
  if (!task) throw new Error(`no such task: ${id}`);
  const note = index.notes.get(task.path);
  if (!note) throw new Error(`no such note: ${task.path}`);

  // stat first, then read, then write with that stat as the guard.
  const stat = await storage.stat(task.path);
  const text = await storage.read(task.path);
  const lines = text.split('\n');
  const idx = task.line - 1;
  const line = lines[idx];
  if (line === undefined) throw new StaleError(task.path, task.line);
  const hasCR = line.endsWith('\r');
  const body = hasCR ? line.slice(0, -1) : line;

  let next: string;
  if (task.kind === 'inline') {
    const t = note.tasks.find((x) => x.line === task.line);
    if (!t || body !== t.raw) throw new StaleError(task.path, task.line);
    const want = done ? 'x' : ' ';
    if ((body[t.col] === 'x' || body[t.col] === 'X' ? 'x' : ' ') === want) return unchanged(task, body);
    next = body.slice(0, t.col) + want + body.slice(t.col + 1);
  } else {
    const f = note.fileTask;
    if (!f || body !== f.statusRaw) throw new StaleError(task.path, task.line);
    if (f.done === done) return unchanged(task, body);
    const m = /^(status\s*:\s*)(.*?)(\s+#.*)?$/.exec(body);
    if (!m) throw new StaleError(task.path, task.line);
    const quote = /^["']/.test(m[2] ?? '') ? (m[2] as string)[0] : '';
    const value = done ? opts.doneStatus ?? 'done' : opts.reopenStatus ?? 'todo';
    next = `${m[1]}${quote}${value}${quote}${m[3] ?? ''}`;
  }

  lines[idx] = hasCR ? next + '\r' : next;
  await storage.write(task.path, lines.join('\n'), stat.mtime);
  await index.refreshFile(task.path);
  return { path: task.path, line: task.line, before: body, after: next, written: true };
}

function unchanged(task: TaskItem, body: string): ChangeResult {
  return { path: task.path, line: task.line, before: body, after: body, written: false };
}
