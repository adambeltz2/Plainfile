import type { VaultIndex } from './index';
import { ExistsError, type VaultStorage } from './storage';
import type { ChangeResult } from './writeback';

export const INBOX_FILE = 'inbox/Inbox.md';

/** One line of task text: no line breaks, no leading list or checkbox markup. */
export function cleanTaskText(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?/, '')
    .trim();
}

/**
 * Quick add: append `- [ ] text due:date` to the Inbox note, creating it if needed.
 * Existing content and line endings are untouched. The write is guarded like any other,
 * so if the file changed since it was read, nothing is written.
 */
export async function addTask(
  storage: VaultStorage,
  index: VaultIndex,
  input: { text: string; due?: string },
  path: string = INBOX_FILE,
): Promise<ChangeResult> {
  const text = cleanTaskText(input.text);
  if (!text) throw new Error('Type something for the task first.');
  const task = `- [ ] ${text}${input.due && !/\bdue:/i.test(text) ? ` due:${input.due}` : ''}`;

  try {
    const content = `# Inbox\n\n${task}\n`;
    await storage.create(path, content);
    await index.refreshFile(path);
    return { path, line: 3, before: '', after: task, written: true };
  } catch (e) {
    if (!(e instanceof ExistsError)) throw e;
  }

  const stat = await storage.stat(path);
  const old = await storage.read(path);
  const eol = old.includes('\r\n') ? '\r\n' : '\n';
  const sep = old === '' || old.endsWith('\n') ? '' : eol;
  await storage.write(path, `${old}${sep}${task}${eol}`, stat.mtime);
  await index.refreshFile(path);
  const line = old === '' ? 1 : old.replace(/\r?\n$/, '').split('\n').length + 1;
  return { path, line, before: '', after: task, written: true };
}
