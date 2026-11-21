import { frontmatterText, setFrontmatterField } from './frontmatter';
import { dirname, joinPath, type VaultIndex } from './index';
import { applyEdits, type RenameEdit } from './rename';
import { ExistsError, type VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

/**
 * Moving a note to another folder, and duplicating one. A move uses the same safe order as a rename:
 * the new file is created first, links that would break are rewritten (each write guarded), and the
 * old file is removed last, so a failure part-way never loses the note.
 */

export interface MovePlan {
  from: string;
  to: string;
  /** Links in other notes that would break and are rewritten. */
  inbound: RenameEdit[];
  /** Relative links and images inside the moved note that are rewritten so they still reach their target. */
  outbound: RenameEdit[];
  warnings: string[];
}

export interface MoveResult {
  from: string;
  to: string;
  changes: ChangeResult[];
}

const stripCR = (l: string): string => (l.endsWith('\r') ? l.slice(0, -1) : l);
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const external = (t: string): boolean => /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t);

/** A folder path as typed: no leading or trailing slash, no `..`, no hidden folders, no characters a file system refuses. */
export function cleanFolder(raw: string): string {
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim().replace(/[:?*"<>|]/g, '-'))
    .filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) throw new Error('A folder name cannot contain "..".');
  if (parts.some((p) => p.startsWith('.'))) throw new Error('Folders that start with a dot are hidden from Plainfile.');
  return parts.join('/');
}

/** The path to `target` as written from inside `fromDir`, such as `../people/dana.md`. */
export function relativePath(fromDir: string, target: string): string {
  const a = fromDir.split('/').filter(Boolean);
  const b = target.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...Array<string>(a.length - i).fill('..'), ...b.slice(i)].join('/') || target;
}

/** Every folder that holds a file, with how many notes it holds directly. Used to offer places to move to. */
export function folderList(index: VaultIndex): { folder: string; notes: number }[] {
  const m = new Map<string, number>();
  for (const f of index.files) {
    const d = dirname(f);
    for (let p = d; p; p = dirname(p)) if (!m.has(p)) m.set(p, 0);
  }
  for (const n of index.notes.values()) {
    const d = dirname(n.path);
    if (d) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return [...m].map(([folder, notes]) => ({ folder, notes })).sort((a, b) => a.folder.localeCompare(b.folder));
}

/** What moving a note into `destFolder` (the vault root when empty) would change. Writes nothing. */
export function planMove(index: VaultIndex, from: string, destFolder: string): MovePlan {
  const note = index.notes.get(from);
  if (!note) throw new Error(`No such note: ${from}`);
  const dir = cleanFolder(destFolder);
  const file = from.split('/').pop() as string;
  const to = dir ? `${dir}/${file}` : file;
  if (dirname(from) === dir) throw new Error('It is already in that folder.');
  if ([...index.files].some((f) => f.toLowerCase() === to.toLowerCase())) throw new Error(`${to} already exists.`);
  const clash = [...index.notes.values()].some((n) => n.path !== from && n.name.toLowerCase() === note.name.toLowerCase());
  const warnings: string[] = [];

  // Links in other notes.
  const lines = new Map<string, RenameEdit>();
  for (const n of [...index.notes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (n.path === from) continue;
    const text = n.text.split('\n');
    for (const l of n.links) {
      if (index.resolveLink(n, l).path !== from) continue;
      const key = `${n.path}:${l.line}`;
      const entry = lines.get(key) ?? { id: key, path: n.path, line: l.line, before: stripCR(text[l.line - 1] ?? ''), after: stripCR(text[l.line - 1] ?? '') };
      let after: string | undefined;
      if (l.kind === 'wiki') {
        const pathy = l.target.includes('/');
        if (!pathy && !clash) continue; // a plain name keeps working wherever the note goes
        const hasMd = /\.md$/i.test(l.target);
        const next = to.replace(/\.md$/i, '');
        const re = new RegExp(`\\[\\[${esc(l.target)}(?=[\\]|#])`, 'g');
        if (re.test(entry.after)) after = entry.after.replace(re, () => `[[${next}${hasMd ? '.md' : ''}`);
      } else {
        const rel = relativePath(dirname(n.path), to);
        for (const [cand, repl] of [
          [l.target, rel],
          [encodeURI(l.target), encodeURI(rel)],
        ] as const) {
          const re = new RegExp(`\\]\\(${esc(cand)}(?=[)#\\s])`, 'g');
          if (re.test(entry.after)) {
            after = entry.after.replace(re, () => `](${repl}`);
            break;
          }
        }
      }
      if (after !== undefined) {
        entry.after = after;
        lines.set(key, entry);
      } else if (entry.after === entry.before) {
        warnings.push(`${n.path}:${l.line} has a link that could not be located in the text, so it will not be updated.`);
      }
    }
  }
  const inbound = [...lines.values()].filter((e) => e.after !== e.before);

  // Relative links and images inside the note itself.
  const own = note.text.split('\n');
  const out = new Map<string, RenameEdit>();
  const refs = [...note.links.filter((l) => l.kind === 'md').map((l) => ({ target: l.target, line: l.line })), ...note.embeds];
  for (const r of refs) {
    if (!r.target || external(r.target) || r.target.startsWith('/') || /^\[\[/.test(r.target)) continue;
    const abs = joinPath(dirname(from), r.target);
    const rel = relativePath(dir, abs);
    if (rel === r.target) continue;
    const key = `${from}:${r.line}`;
    const entry = out.get(key) ?? { id: key, path: from, line: r.line, before: stripCR(own[r.line - 1] ?? ''), after: stripCR(own[r.line - 1] ?? '') };
    let done = false;
    for (const [cand, repl] of [
      [r.target, rel],
      [encodeURI(r.target), encodeURI(rel)],
    ] as const) {
      const re = new RegExp(`\\]\\(${esc(cand)}(?=[)#\\s])`, 'g');
      if (re.test(entry.after)) {
        entry.after = entry.after.replace(re, () => `](${repl}`);
        done = true;
        break;
      }
    }
    if (done) out.set(key, entry);
  }
  const outbound = [...out.values()].filter((e) => e.after !== e.before);
  return { from, to, inbound, outbound, warnings };
}

/** Move the note. Links in other notes are only rewritten for the edit ids in `include`. */
export async function applyMove(storage: VaultStorage, index: VaultIndex, plan: MovePlan, include: ReadonlySet<string>): Promise<MoveResult> {
  const oldStat = await storage.stat(plan.from);
  const lines = (await storage.read(plan.from)).split('\n');
  const changes: ChangeResult[] = [];
  for (const e of plan.outbound) {
    const raw = lines[e.line - 1];
    if (raw === undefined || stripCR(raw) !== e.before) throw new StaleError(plan.from, e.line);
    lines[e.line - 1] = raw.endsWith('\r') ? `${e.after}\r` : e.after;
    changes.push({ path: plan.to, line: e.line, before: e.before, after: e.after, written: true });
  }
  await storage.create(plan.to, lines.join('\n'));
  changes.push(...(await applyEdits(storage, index, plan.inbound.filter((e) => include.has(e.id)))));
  await storage.remove(plan.from, oldStat.mtime);
  await index.scan();
  return { from: plan.from, to: plan.to, changes };
}

/** A copy of a note beside it, named "Name copy", "Name copy 2" and so on. The content is copied exactly, except that a `title:` in its frontmatter gets " copy" added so the two do not share a title. */
export async function duplicateNote(storage: VaultStorage, index: VaultIndex, from: string): Promise<string> {
  const note = index.notes.get(from);
  if (!note) throw new Error(`No such note: ${from}`);
  const dir = dirname(from);
  const base = (from.split('/').pop() as string).replace(/\.md$/i, '');
  let text = await storage.read(from);
  if (frontmatterText(text)?.split('\n').some((l) => /^title\s*:/.test(l))) text = setFrontmatterField(text, 'title', JSON.stringify(`${note.title} copy`));
  for (let n = 1; n < 200; n++) {
    const path = `${dir ? `${dir}/` : ''}${base} copy${n > 1 ? ` ${n}` : ''}.md`;
    try {
      await storage.create(path, text);
      await index.refreshFile(path);
      return path;
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error('Could not find a free name for the copy.');
}
