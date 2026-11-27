import { addFrontmatterListItem } from './frontmatter';
import { moveHistory } from './history';
import { dirname, type VaultIndex } from './index';
import type { LinkRef, Note } from './parse';
import type { VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

/** One line in one file that will change because a note was renamed. */
export interface RenameEdit {
  id: string;
  path: string;
  line: number;
  before: string;
  after: string;
}

export interface RenamePlan {
  from: string;
  to: string;
  oldName: string;
  newName: string;
  edits: RenameEdit[];
  /** Links that point at the note but could not be located in the text, so they will not be updated. */
  warnings: string[];
  /** True when another note already has the new name, so updated links use the folder path. */
  nameClash: boolean;
}

export interface RenameOptions {
  /** Edit ids to apply. Unchecked links are left alone. */
  include: ReadonlySet<string>;
  /** Keep the old name under `aliases:` in the renamed note so old links still resolve. */
  keepAlias: boolean;
}

export interface RenameResult {
  from: string;
  to: string;
  changes: ChangeResult[];
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripCR = (l: string): string => (l.endsWith('\r') ? l.slice(0, -1) : l);
const baseName = (p: string): string => (p.split('/').pop() ?? p).replace(/\.md$/i, '');

function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/\.md$/i, '')
    .replace(/[\\/:?*"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Collect {
  oldPath: string;
  oldName: string;
  newPath: string;
  newName: string;
  clash: boolean;
  /** Does this link refer to the old note? */
  matches: (source: Note, link: LinkRef) => boolean;
}

/** Work out, line by line, how each link to the old note must change. */
function collectEdits(index: VaultIndex, c: Collect): { edits: RenameEdit[]; warnings: string[] } {
  const lines = new Map<string, { path: string; line: number; before: string; after: string }>();
  const warnings: string[] = [];

  for (const n of [...index.notes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const text = n.text.split('\n');
    for (const l of n.links) {
      if (!c.matches(n, l)) continue;
      const key = `${n.path}:${l.line}`;
      const entry = lines.get(key) ?? { path: n.path, line: l.line, before: stripCR(text[l.line - 1] ?? ''), after: stripCR(text[l.line - 1] ?? '') };
      let replaced: string | undefined;

      if (l.kind === 'wiki') {
        const hasMd = /\.md$/i.test(l.target);
        const segs = l.target.trim().replace(/\.md$/i, '').split('/');
        const last = segs.pop() ?? '';
        if (last.toLowerCase() !== c.oldName.toLowerCase()) continue; // reached through its title or an alias: still works
        const next = c.clash ? c.newPath.replace(/\.md$/i, '') : [...segs, c.newName].join('/');
        const re = new RegExp(`\\[\\[${esc(l.target)}(?=[\\]|#])`, 'g');
        if (re.test(entry.after)) replaced = entry.after.replace(re, () => `[[${next}${hasMd ? '.md' : ''}`);
      } else {
        const slash = l.target.lastIndexOf('/');
        const newRel = `${l.target.slice(0, slash + 1)}${c.newName}.md`;
        for (const [cand, to] of [
          [l.target, newRel],
          [encodeURI(l.target), encodeURI(newRel)],
        ] as const) {
          const re = new RegExp(`\\]\\(${esc(cand)}(?=[)#\\s])`, 'g');
          if (re.test(entry.after)) {
            replaced = entry.after.replace(re, () => `](${to}`);
            break;
          }
        }
      }

      if (replaced !== undefined) {
        entry.after = replaced;
        lines.set(key, entry);
      } else if (entry.after === entry.before) {
        warnings.push(`${n.path}:${l.line} has a link that could not be located in the text, so it will not be updated.`);
      }
    }
  }
  const edits = [...lines.values()]
    .filter((e) => e.after !== e.before)
    .map((e) => ({ id: `${e.path}:${e.line}`, path: e.path, line: e.line, before: e.before, after: e.after }));
  return { edits, warnings };
}

/** What renaming a note inside the app would change. Writes nothing. */
export function planRename(index: VaultIndex, from: string, rawName: string): RenamePlan {
  const note = index.notes.get(from);
  if (!note) throw new Error(`No such note: ${from}`);
  const newName = cleanName(rawName);
  if (!newName) throw new Error('Type a new name.');
  const dir = dirname(from);
  const to = `${dir ? `${dir}/` : ''}${newName}.md`;
  if (to === from) throw new Error('That is the current name.');
  if ([...index.files].some((f) => f.toLowerCase() === to.toLowerCase())) throw new Error(`${to} already exists.`);
  const clash = [...index.notes.values()].some((n) => n.path !== from && n.name.toLowerCase() === newName.toLowerCase());
  const { edits, warnings } = collectEdits(index, {
    oldPath: from,
    oldName: note.name,
    newPath: to,
    newName,
    clash,
    matches: (n, l) => index.resolveLink(n, l).path === from,
  });
  return { from, to, oldName: note.name, newName, edits, warnings, nameClash: clash };
}

/** Apply link edits, one guarded write per file. Each edit must still match the line it was planned from. */
export async function applyEdits(storage: VaultStorage, index: VaultIndex, edits: RenameEdit[]): Promise<ChangeResult[]> {
  const byFile = new Map<string, RenameEdit[]>();
  for (const e of edits) byFile.set(e.path, [...(byFile.get(e.path) ?? []), e]);
  const out: ChangeResult[] = [];
  for (const [path, list] of byFile) {
    const stat = await storage.stat(path);
    const lines = (await storage.read(path)).split('\n');
    for (const e of list) {
      const raw = lines[e.line - 1];
      if (raw === undefined || stripCR(raw) !== e.before) throw new StaleError(path, e.line);
      lines[e.line - 1] = raw.endsWith('\r') ? `${e.after}\r` : e.after;
    }
    await storage.write(path, lines.join('\n'), stat.mtime);
    await index.refreshFile(path);
    for (const e of list) out.push({ path, line: e.line, before: e.before, after: e.after, written: true });
  }
  return out;
}

/**
 * Rename a note and update the links to it. Order matters, so a failure part-way never
 * loses anything: the new file is created first, links in other files are rewritten next
 * (each guarded), and the old file is removed last.
 */
export async function applyRename(storage: VaultStorage, index: VaultIndex, plan: RenamePlan, opts: RenameOptions): Promise<RenameResult> {
  const chosen = plan.edits.filter((e) => opts.include.has(e.id));
  const oldStat = await storage.stat(plan.from);
  const lines = (await storage.read(plan.from)).split('\n');

  const changes: ChangeResult[] = [];
  for (const e of chosen.filter((x) => x.path === plan.from)) {
    const raw = lines[e.line - 1];
    if (raw === undefined || stripCR(raw) !== e.before) throw new StaleError(plan.from, e.line);
    lines[e.line - 1] = raw.endsWith('\r') ? `${e.after}\r` : e.after;
    changes.push({ path: plan.to, line: e.line, before: e.before, after: e.after, written: true });
  }
  let content = lines.join('\n');
  if (opts.keepAlias) content = addFrontmatterListItem(content, 'aliases', plan.oldName);

  await storage.create(plan.to, content);
  changes.push(
    ...(await applyEdits(
      storage,
      index,
      chosen.filter((x) => x.path !== plan.from),
    )),
  );
  await storage.remove(plan.from, oldStat.mtime);
  await moveHistory(storage, plan.from, plan.to);
  await index.scan();
  return { from: plan.from, to: plan.to, changes };
}

/**
 * A note was renamed outside the app, so links to its old name now point nowhere.
 * Work out the edits that make them point at the new file. Writes nothing.
 */
export function planOutsideRename(index: VaultIndex, oldPath: string, newPath: string): RenamePlan {
  const oldName = baseName(oldPath);
  const newName = baseName(newPath);
  const clash = [...index.notes.values()].some((n) => n.path !== newPath && n.name.toLowerCase() === newName.toLowerCase());
  const { edits, warnings } = collectEdits(index, {
    oldPath,
    oldName,
    newPath,
    newName,
    clash,
    matches: (n, l) => {
      if (index.resolveLink(n, l).path) return false;
      if (l.kind === 'wiki') return (l.target.trim().replace(/\.md$/i, '').split('/').pop() ?? '').toLowerCase() === oldName.toLowerCase();
      const joined = `${dirname(n.path) ? `${dirname(n.path)}/` : ''}${l.target}`;
      return baseName(l.target).toLowerCase() === oldName.toLowerCase() && joined.toLowerCase().endsWith(oldPath.toLowerCase().split('/').slice(-1)[0] ?? '');
    },
  });
  return { from: oldPath, to: newPath, oldName, newName, edits, warnings, nameClash: clash };
}

export async function applyOutsideRename(storage: VaultStorage, index: VaultIndex, plan: RenamePlan, opts: RenameOptions): Promise<RenameResult> {
  const changes = await applyEdits(
    storage,
    index,
    plan.edits.filter((e) => opts.include.has(e.id)),
  );
  if (opts.keepAlias) {
    const stat = await storage.stat(plan.to);
    const text = await storage.read(plan.to);
    const next = addFrontmatterListItem(text, 'aliases', plan.oldName);
    if (next !== text) await storage.write(plan.to, next, stat.mtime);
  }
  await index.scan();
  return { from: plan.from, to: plan.to, changes };
}

/** Letters and digits only, lower case: "Pricing research", "pricing-research" and "Pricing_Research" are the same name. */
const plainName = (v: string): string => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * When a note's `title:` and its file name say different things, the file name it would take to match, else undefined.
 * Only a title written in the note counts, and an `index` note (a project) is named for its folder, so neither is flagged.
 */
export function nameForTitle(n: Pick<Note, 'title' | 'name' | 'frontmatter'>): string | undefined {
  const t = typeof n.frontmatter.title === 'string' || typeof n.frontmatter.title === 'number' ? String(n.frontmatter.title).trim() : '';
  if (!t || n.name.toLowerCase() === 'index' || plainName(t) === plainName(n.name)) return undefined;
  const name = t
    .replace(/[\\/:?*"<>|#[\]^]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[\s.-]+$/g, '')
    .slice(0, 80);
  return name && plainName(name) !== plainName(n.name) ? name : undefined;
}
