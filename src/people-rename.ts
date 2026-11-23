import { applyBulk, type FileEdit } from './bulk';
import { titleFrontmatter } from './frontmatter';
import type { VaultIndex } from './index';
import type { PeopleIndex } from './people';
import { applyRename, planRename, type RenamePlan, type RenameResult } from './rename';
import type { VaultStorage } from './storage';
import type { ChangeResult } from './writeback';

/**
 * Rename a person everywhere. A person is only a name, written as `@name` in text and in the `people:` (or
 * `attendees:`, `owner:`, `assignee:`) fields of notes, plus an optional person note. So a rename rewrites each of
 * those spellings, and renames the person note (with the links to it) when there is one. Writes nothing until applied.
 */
const FM_KEYS = new Set(['people', 'attendees', 'owner', 'assignee']);
const MENTION = /(^|[\s(])@([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;
const FENCE = /^\s*(```|~~~)/;

export interface LineChange {
  path: string;
  line: number;
  before: string;
  after: string;
}

export interface PersonRenamePlan {
  key: string;
  oldName: string;
  /** The new name as typed. */
  newName: string;
  /** How it is written in `@mentions` and `people:` lists: spaces become hyphens. */
  token: string;
  /** One guarded whole-file edit per note, which also gives Undo. */
  edits: FileEdit[];
  /** Every line that changes, for the preview. */
  changes: LineChange[];
  /** The person note and the links to it, if the person has one. */
  note?: RenamePlan;
  /** Set when the new name is another person who already exists: the two become one. */
  joins?: string;
  error?: string;
}

export const personToken = (name: string): string => name.trim().replace(/^@/, '').replace(/\s+/g, '-');

/** One comma-separated run of names (inside `[ ]`, or a bare value), rewriting the ones that are this person. */
function renameInList(inner: string, is: (name: string) => boolean, token: string): string {
  return inner
    .split(',')
    .map((part) => {
      const m = /^(\s*)(["']?)(@?)(.*?)\2(\s*)$/.exec(part);
      if (!m || !m[4] || !is(m[4]) || m[4] === token) return part;
      return `${m[1]}${m[2]}${m[3]}${token}${m[2]}${m[5]}`;
    })
    .join(',');
}

/** The text of a note with this person's name rewritten, line by line. Only lines that name them change. */
function rewrite(text: string, is: (name: string) => boolean, token: string): { after: string; changes: { line: number; before: string; after: string }[] } {
  const lines = text.split('\n');
  const changes: { line: number; before: string; after: string }[] = [];
  const first = (lines[0] ?? '').replace(/\r$/, '');
  let fmEnd = -1;
  if (first === '---') {
    for (let i = 1; i < lines.length; i++) {
      const t = (lines[i] as string).replace(/\r$/, '');
      if (t === '---' || t === '...') {
        fmEnd = i;
        break;
      }
    }
  }
  let key = '';
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    const cr = raw.endsWith('\r') ? '\r' : '';
    const body = cr ? raw.slice(0, -1) : raw;
    let next = body;
    if (i > 0 && i < fmEnd) {
      const m = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(body);
      if (m) {
        key = (m[1] as string).toLowerCase();
        if (FM_KEYS.has(key)) {
          const value = m[2] as string;
          const flow = /^(\s*\[)(.*)(\].*)$/.exec(value);
          if (flow) next = `${body.slice(0, body.length - value.length)}${flow[1]}${renameInList(flow[2] as string, is, token)}${flow[3]}`;
          else if (value.trim() && !value.trim().startsWith('#')) {
            const bare = /^(.*?)(\s+#.*)?$/.exec(value);
            next = `${body.slice(0, body.length - value.length)}${renameInList(bare?.[1] ?? value, is, token)}${bare?.[2] ?? ''}`;
          }
        }
      } else if (FM_KEYS.has(key)) {
        const item = /^(\s*-\s+)(["']?)(@?)(.*?)\2(\s*(?:#.*)?)$/.exec(body);
        if (item && item[4] && is(item[4]) && item[4] !== token) next = `${item[1]}${item[2]}${item[3]}${token}${item[2]}${item[5]}`;
      }
    } else if (i > fmEnd) {
      if (FENCE.test(body)) fence = !fence;
      else if (!fence) next = body.replace(MENTION, (m0, lead: string, name: string) => (is(name) && name !== token ? `${lead}@${token}` : m0));
    }
    if (next !== body) {
      changes.push({ line: i + 1, before: body, after: next });
      lines[i] = next + cr;
    }
  }
  return { after: lines.join('\n'), changes };
}

/** What renaming this person to `newName` would change. Reads the notes that name them; writes nothing. */
export async function planPersonRename(storage: VaultStorage, index: VaultIndex, people: PeopleIndex, key: string, newName: string): Promise<PersonRenamePlan> {
  const person = people.people.find((p) => p.key === key);
  const typed = newName.trim().replace(/^@/, '');
  const token = personToken(typed);
  const base: PersonRenamePlan = { key, oldName: person?.name ?? key, newName: typed, token, edits: [], changes: [] };
  if (!person) return { ...base, error: 'That person is no longer in your notes.' };
  if (!typed) return { ...base, error: 'Type the new name.' };
  if (typed === person.name || token === person.name) return { ...base, error: 'That is already the name.' };

  const other = people.people.find((p) => p.key === people.resolve(typed) && p.key !== key);
  const is = (name: string): boolean => people.resolve(name) === key;

  const paths = new Set<string>();
  for (const n of people.mentions.get(key) ?? []) paths.add(n.path);
  for (const t of people.tasks.get(key) ?? []) paths.add(t.item.path);
  if (person.note) paths.add(person.note.path); // their own note may name them too
  const edits: FileEdit[] = [];
  const changes: LineChange[] = [];
  for (const path of [...paths].sort()) {
    const before = await storage.read(path);
    const { after, changes: cs } = rewrite(before, is, token);
    if (after === before) continue;
    const first = cs[0] as { line: number; before: string; after: string };
    edits.push({ path, before, after, tasks: cs.length, line: first.line, was: first.before, now: first.after });
    for (const c of cs) changes.push({ path, ...c });
  }

  let note: RenamePlan | undefined;
  if (person.note) {
    try {
      note = planRename(index, person.note.path, typed);
    } catch (e) {
      return { ...base, edits, changes, joins: other?.name, error: `The person note cannot be renamed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ...base, edits, changes, note, joins: other?.name };
}

export interface PersonRenameResult {
  changes: ChangeResult[];
  renamed?: RenameResult;
}

/**
 * Apply the rename: the mentions first (one guarded write per note, so a note that changed since the preview stops
 * everything after it), then the person note and the links to it. The note is re-planned at that point so it is
 * worked out against what is on disk now.
 */
export async function applyPersonRename(
  storage: VaultStorage,
  index: VaultIndex,
  plan: PersonRenamePlan,
  opts: { keepAlias: boolean },
): Promise<PersonRenameResult> {
  if (plan.error) throw new Error(plan.error);
  const changes = await applyBulk(storage, index, plan.edits);
  let renamed: RenameResult | undefined;
  if (plan.note) {
    const fresh = planRename(index, plan.note.from, plan.newName);
    renamed = await applyRename(storage, index, fresh, { include: new Set(fresh.edits.map((e) => e.id)), keepAlias: opts.keepAlias });
    // The note's own title shows as the person's name, so it follows the file name.
    const stat = await storage.stat(renamed.to);
    const text = await storage.read(renamed.to);
    const withTitle = titleFrontmatter(text, plan.newName);
    if (withTitle !== text && /^title\s*:/m.test(text.split(/^---\r?$/m)[1] ?? '')) {
      await storage.write(renamed.to, withTitle, stat.mtime);
      await index.refreshFile(renamed.to);
    }
  }
  return { changes, renamed };
}

/** Undo the mentions. The person note's file name is changed back with Rename. */
export async function undoPersonRename(storage: VaultStorage, index: VaultIndex, plan: PersonRenamePlan): Promise<ChangeResult[]> {
  return applyBulk(storage, index, plan.edits, 'back');
}
