import { moveHistory } from './history';
import { dirname, joinPath, type VaultIndex } from './index';
import { cleanFolder, relativePath } from './move';
import { applyEdits, type RenameEdit } from './rename';
import { ExistsError, type VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

/**
 * Moving a whole folder (a project, say, to or from `archive/`). Every file under it moves, notes and attachments
 * alike, and every link that would stop working is rewritten, in the moved notes and in all the others.
 *
 * It is worked out as one plan from the current files, so there is no half-moved state to reason about. Applying it
 * is ordered so nothing is ever lost: new copies are created first, links in other notes are rewritten next (each
 * write guarded by the file's modified time), and the old files are removed last. If something fails part-way, the
 * copies made so far are removed again and the old files are untouched.
 *
 * Links by plain name (`[[Kickoff]]`) keep working wherever a note goes, so only path links are rewritten: `[[a/b]]`,
 * `[text](../a/b.md)` and images. A moved note whose name another note also has is reported, because a plain-name
 * link to it could start meaning the other note.
 */
export interface FolderMovePlan {
  from: string;
  to: string;
  /** Every file that moves, old path to new path. */
  files: { from: string; to: string; note: boolean }[];
  /** Line edits to links, keyed by the note's current path. Edits in moved notes are applied as the note is copied. */
  edits: RenameEdit[];
  /** How many notes outside the folder get an edit. */
  outsideNotes: number;
  warnings: string[];
}

export interface FolderMoveResult {
  from: string;
  to: string;
  moved: number;
  changes: ChangeResult[];
}

const stripCR = (l: string): string => (l.endsWith('\r') ? l.slice(0, -1) : l);
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const external = (t: string): boolean => /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t);

/** Replace one `](old` with `](new` in a line, trying the plain and the percent-encoded spelling. */
export function retarget(line: string, oldTarget: string, newTarget: string): string | undefined {
  for (const [cand, repl] of [
    [oldTarget, newTarget],
    [encodeURI(oldTarget), encodeURI(newTarget)],
  ] as const) {
    const re = new RegExp(`\\]\\(${esc(cand)}(?=[)#\\s])`, 'g');
    if (re.test(line)) return line.replace(re, () => `](${repl}`);
  }
  return undefined;
}

export function planFolderMove(index: VaultIndex, fromDir: string, toDir: string): FolderMovePlan {
  const from = cleanFolder(fromDir);
  const to = cleanFolder(toDir);
  if (!from) throw new Error('Choose a folder to move.');
  if (from === to) throw new Error('It is already there.');
  if (`${to}/`.startsWith(`${from}/`)) throw new Error('A folder cannot move into itself.');
  const inside = (p: string): boolean => p.startsWith(`${from}/`);
  const map = (p: string): string => (inside(p) ? `${to}${p.slice(from.length)}` : p);

  const files = [...index.files]
    .filter(inside)
    .sort()
    .map((f) => ({ from: f, to: map(f), note: index.notes.has(f) }));
  if (!files.length) throw new Error('That folder has no files to move.');
  const taken = new Set([...index.files].map((f) => f.toLowerCase()));
  for (const f of files) if (taken.has(f.to.toLowerCase())) throw new Error(`${f.to} already exists.`);

  const warnings: string[] = [];
  const movedNames = new Set(files.filter((f) => f.note).map((f) => (index.notes.get(f.from)?.name ?? '').toLowerCase()));
  const elsewhere = new Map<string, string>();
  for (const n of index.notes.values()) if (!inside(n.path) && movedNames.has(n.name.toLowerCase())) elsewhere.set(n.name.toLowerCase(), n.path);
  for (const [name, other] of elsewhere) warnings.push(`A note called “${name}” is also at ${other}. A plain [[${name}]] link may now be ambiguous.`);

  const edits: RenameEdit[] = [];
  const outside = new Set<string>();
  for (const n of [...index.notes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const newDir = dirname(map(n.path));
    const lines = n.text.split('\n');
    const entries = new Map<number, RenameEdit>();
    const entry = (line: number): RenameEdit => {
      let e = entries.get(line);
      if (!e) {
        const t = stripCR(lines[line - 1] ?? '');
        e = { id: `${n.path}:${line}`, path: n.path, line, before: t, after: t };
        entries.set(line, e);
      }
      return e;
    };

    // Relative markdown links and images: written from where the note is now, to where the target will be.
    const refs = [...n.links.filter((l) => l.kind === 'md').map((l) => ({ target: l.target, line: l.line })), ...n.embeds];
    for (const r of refs) {
      if (!r.target || external(r.target) || r.target.startsWith('/') || /^\[\[/.test(r.target)) continue;
      const decoded = (() => {
        try {
          return decodeURI(r.target);
        } catch {
          return r.target;
        }
      })();
      const rel = relativePath(newDir, map(joinPath(dirname(n.path), decoded)));
      if (rel === decoded) continue;
      const e = entry(r.line);
      const next = retarget(e.after, r.target, rel);
      if (next === undefined) warnings.push(`${n.path}:${r.line} has a link that could not be located in the text, so it will not be updated.`);
      else e.after = next;
    }

    // Wiki links that spell out a path, to a note that is moving.
    for (const l of n.links) {
      if (l.kind !== 'wiki' || !l.target.includes('/')) continue;
      const hit = index.resolveLink(n, l).path;
      if (!hit || map(hit) === hit) continue;
      const e = entry(l.line);
      const hasMd = /\.md$/i.test(l.target);
      const re = new RegExp(`\\[\\[${esc(l.target)}(?=[\\]|#])`, 'g');
      if (re.test(e.after)) e.after = e.after.replace(re, () => `[[${map(hit).replace(/\.md$/i, '')}${hasMd ? '.md' : ''}`);
      else warnings.push(`${n.path}:${l.line} has a link that could not be located in the text, so it will not be updated.`);
    }

    for (const e of entries.values()) {
      if (e.after === e.before) continue;
      edits.push(e);
      if (!inside(n.path)) outside.add(n.path);
    }
  }
  return { from, to, files, edits, outsideNotes: outside.size, warnings };
}

/** Do the move described by the plan. Throws, after undoing what it did, if a file has changed since it was planned. */
export async function applyFolderMove(storage: VaultStorage, index: VaultIndex, plan: FolderMovePlan): Promise<FolderMoveResult> {
  const changes: ChangeResult[] = [];
  const created: string[] = [];
  const stats = new Map<string, number>();
  const byNote = new Map<string, RenameEdit[]>();
  for (const e of plan.edits) byNote.set(e.path, [...(byNote.get(e.path) ?? []), e]);
  try {
    for (const f of plan.files) {
      stats.set(f.from, (await storage.stat(f.from)).mtime);
      if (f.note) {
        const lines = (await storage.read(f.from)).split('\n');
        for (const e of byNote.get(f.from) ?? []) {
          const raw = lines[e.line - 1];
          if (raw === undefined || stripCR(raw) !== e.before) throw new StaleError(f.from, e.line);
          lines[e.line - 1] = raw.endsWith('\r') ? `${e.after}\r` : e.after;
          changes.push({ path: f.to, line: e.line, before: e.before, after: e.after, written: true });
        }
        await storage.create(f.to, lines.join('\n'));
      } else {
        await storage.createBinary(f.to, await storage.readBinary(f.from));
      }
      created.push(f.to);
    }
    const movedFrom = new Set(plan.files.map((f) => f.from));
    changes.push(
      ...(await applyEdits(
        storage,
        index,
        plan.edits.filter((e) => !movedFrom.has(e.path)),
      )),
    );
  } catch (e) {
    for (const p of created) {
      try {
        await storage.remove(p, (await storage.stat(p)).mtime);
      } catch {
        /* a copy that will not go is harmless: it is a duplicate, not a loss */
      }
    }
    if (e instanceof ExistsError) throw new Error(`${e.message} Nothing was moved.`);
    throw e;
  }
  for (const f of plan.files) {
    await storage.remove(f.from, stats.get(f.from) ?? (await storage.stat(f.from)).mtime);
    if (f.note) await moveHistory(storage, f.from, f.to);
  }
  await storage.removeEmptyFolders?.(plan.from);
  await index.scan();
  return { from: plan.from, to: plan.to, moved: plan.files.length, changes };
}
