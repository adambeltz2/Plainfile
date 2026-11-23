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
  input: {
    text: string;
    due?: string;
    /** Today, written as `created:` so you can see when it was added. */ created?: string;
    tags?: string[];
    people?: string[];
  },
  path: string = INBOX_FILE,
): Promise<ChangeResult> {
  const text = cleanTaskText(input.text);
  if (!text) throw new Error('Type something for the task first.');
  const has = (re: RegExp): boolean => re.test(text);
  const people = (input.people ?? [])
    .map((x) => x.trim().replace(/^@/, '').replace(/\s+/g, '-'))
    .filter((x) => x && !has(new RegExp(`@${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')))
    .map((x) => ` @${x}`)
    .join('');
  const tags = (input.tags ?? [])
    .map((x) => x.trim().replace(/^#/, '').replace(/\s+/g, '-'))
    .filter((x) => x && !has(new RegExp(`#${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`, 'i')))
    .map((x) => ` #${x}`)
    .join('');
  const due = input.due && !has(/\bdue:/i) ? ` due:${input.due}` : '';
  const created = input.created && !has(/\bcreated:/i) ? ` created:${input.created}` : '';
  const task = `- [ ] ${text}${people}${tags}${due}${created}`;

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

/** A file name for a task note: the title, without characters file systems refuse, and not too long. */
export function taskFileName(title: string): string {
  const clean = title
    .replace(/[\\/:?*"<>|#\[\]^]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[\s.-]+$/g, '')
    .slice(0, 80)
    .trim();
  return clean || 'Task';
}

const yamlText = (v: string): string =>
  /^[\w][^:#]*$/.test(v) && !/^(true|false|null|yes|no|~)$/i.test(v) && !/\s$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const flow = (xs: string[]): string => `[${xs.map((x) => (/^[\w][\w./-]*$/.test(x) ? x : `"${x.replace(/"/g, '\\"')}"`)).join(', ')}]`;

export interface TaskNoteInput {
  title: string;
  due?: string;
  /** A to Z, written as `priority:`. */
  priority?: string;
  /** `1w`, `+3d`: written as `repeat:`, so the task comes back when it is finished. */
  repeat?: string;
  created: string;
  tags?: string[];
  people?: string[];
  /** The project name written as `project:`, and the folder whose `tasks/` folder the note goes in. */
  project?: { name: string; dir: string };
}

/**
 * Create a task as its own note: `tasks/<title>.md` (or the project's `tasks/` folder) with `status`, `due`,
 * `created`, `project`, `tags` and `people` in its frontmatter. It shows in Tasks by its due date, on the
 * Board by its status, and in the Inbox view while it is not filed in a project. The result points at the
 * `title:` line, and the task's id is its `status:` line.
 */
export async function addTaskNote(storage: VaultStorage, index: VaultIndex, input: TaskNoteInput): Promise<ChangeResult & { taskId: string }> {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (!title) throw new Error('Type something for the task first.');
  const clean = (xs: string[] | undefined, re: RegExp): string[] => [
    ...new Set((xs ?? []).map((x) => x.trim().replace(re, '').replace(/\s+/g, '-')).filter(Boolean)),
  ];
  const build = (shown: string): string[] => {
    const fm = [`title: ${yamlText(shown)}`, 'status: todo'];
    if (input.due) fm.push(`due: ${input.due}`);
    if (input.priority && /^[A-Z]$/.test(input.priority)) fm.push(`priority: ${input.priority}`);
    if (input.repeat && /^\+?\d{1,3}[dwmy]$/i.test(input.repeat)) fm.push(`repeat: ${input.repeat.toLowerCase()}`);
    fm.push(`created: ${input.created}`);
    if (input.project) fm.push(`project: ${yamlText(input.project.name)}`);
    fm.push(`tags: ${flow(clean(input.tags, /^#/))}`, `people: ${flow(clean(input.people, /^@/))}`);
    return fm;
  };
  const dir = `${input.project?.dir ? `${input.project.dir}/` : ''}tasks`;
  const base = taskFileName(title);
  for (let n = 1; n < 1000; n++) {
    const path = `${dir}/${base}${n > 1 ? ` ${n}` : ''}.md`;
    // A second task with the same name gets " 2" in its title too, so titles stay unique.
    const fm = build(n > 1 ? `${title} ${n}` : title);
    try {
      await storage.create(path, `---\n${fm.join('\n')}\n---\n\n`);
      await index.refreshFile(path);
      return { path, line: 2, before: '', after: fm[0] as string, written: true, taskId: `${path}:3` };
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error('Could not find a free name for that task.');
}
