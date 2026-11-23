import { retarget } from './folder-move';
import { dirname, type VaultIndex } from './index';
import { relativePath } from './move';
import type { VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The line with one wiki link's target replaced, or undefined if the link is not on it. */
export function wikiRetargetText(body: string, oldTarget: string, newTarget: string): string | undefined {
  const re = new RegExp(`\\[\\[${escapeRegExp(oldTarget)}(?=[\\]|#])`, 'g');
  return re.test(body) ? body.replace(re, () => `[[${newTarget}`) : undefined;
}

/**
 * Change where one wiki link points, editing only that link's target text and
 * nothing else on the line. [[old|shown]] becomes [[new|shown]]. Guarded the same
 * way as every other write: refused if the file changed since it was read, and
 * StaleError if the link is no longer on that line.
 */
export async function retargetWikiLink(
  storage: VaultStorage,
  index: VaultIndex,
  path: string,
  line: number,
  oldTarget: string,
  newTarget: string,
): Promise<ChangeResult> {
  const stat = await storage.stat(path);
  const lines = (await storage.read(path)).split('\n');
  const raw = lines[line - 1];
  if (raw === undefined) throw new StaleError(path, line);
  const hasCR = raw.endsWith('\r');
  const body = hasCR ? raw.slice(0, -1) : raw;
  const re = new RegExp(`\\[\\[${escapeRegExp(oldTarget)}(?=[\\]|#])`, 'g');
  if (!re.test(body)) throw new StaleError(path, line);
  re.lastIndex = 0;
  const next = body.replace(re, () => `[[${newTarget}`);
  lines[line - 1] = hasCR ? `${next}\r` : next;
  await storage.write(path, lines.join('\n'), stat.mtime);
  await index.refreshFile(path);
  return { path, line, before: body, after: next, written: true };
}

/**
 * Point a markdown link `[text](old.md)` at another note: the address becomes the path from the linking note to
 * `newPath`. Only that address changes; an `#anchor` after it is kept. Guarded by the file's modified time.
 */
export async function retargetMarkdownLink(
  storage: VaultStorage,
  index: VaultIndex,
  path: string,
  line: number,
  oldTarget: string,
  newPath: string,
): Promise<ChangeResult> {
  const stat = await storage.stat(path);
  const lines = (await storage.read(path)).split('\n');
  const raw = lines[line - 1];
  if (raw === undefined) throw new StaleError(path, line);
  const hasCR = raw.endsWith('\r');
  const body = hasCR ? raw.slice(0, -1) : raw;
  const next = retarget(body, oldTarget, relativePath(dirname(path), newPath));
  if (next === undefined) throw new StaleError(path, line);
  lines[line - 1] = hasCR ? `${next}\r` : next;
  await storage.write(path, lines.join('\n'), stat.mtime);
  await index.refreshFile(path);
  return { path, line, before: body, after: next, written: true };
}

/**
 * The shortest wiki link text that reaches `targetPath` from `sourcePath`: the file
 * name when that is unambiguous, otherwise the path without its extension.
 */
export function bestLinkTarget(index: VaultIndex, sourcePath: string, targetPath: string): string {
  const source = index.notes.get(sourcePath);
  const target = index.notes.get(targetPath);
  if (!target) return targetPath.replace(/\.md$/i, '');
  if (source) {
    const r = index.resolveLink(source, { kind: 'wiki', target: target.name, line: 0 });
    if (r.path === targetPath) return target.name;
  }
  return targetPath.replace(/\.md$/i, '');
}

/** One broken link that has a close match, and the exact line before and after fixing it. */
export interface LinkFix {
  kind: 'wiki' | 'md';
  from: string;
  line: number;
  oldTarget: string;
  /** For a wiki link, the new link text; for a markdown link, the path of the note it will point at. */
  newTarget: string;
  before: string;
  after: string;
}

/** The safe fixes: every broken link that has a close match. Nothing is written; the lines are shown first. */
export function planLinkFixes(
  index: VaultIndex,
  unresolved: { from: string; line: number; target: string; kind: 'wiki' | 'md'; suggestionPath?: string }[],
): LinkFix[] {
  const out: LinkFix[] = [];
  for (const u of unresolved) {
    if (!u.suggestionPath) continue;
    const text = index.notes.get(u.from)?.text.split('\n')[u.line - 1];
    if (text === undefined) continue;
    const before = text.replace(/\r$/, '');
    const newTarget = u.kind === 'wiki' ? bestLinkTarget(index, u.from, u.suggestionPath) : u.suggestionPath;
    const after = u.kind === 'wiki' ? wikiRetargetText(before, u.target, newTarget) : retarget(before, u.target, relativePath(dirname(u.from), newTarget));
    if (after !== undefined && after !== before) out.push({ kind: u.kind, from: u.from, line: u.line, oldTarget: u.target, newTarget, before, after });
  }
  return out;
}

/** Apply the planned fixes one at a time, each guarded. A fix that no longer fits is skipped and counted, not forced. */
export async function applyLinkFixes(storage: VaultStorage, index: VaultIndex, fixes: LinkFix[]): Promise<{ changes: ChangeResult[]; skipped: number }> {
  const changes: ChangeResult[] = [];
  let skipped = 0;
  for (const f of fixes) {
    try {
      changes.push(
        f.kind === 'wiki'
          ? await retargetWikiLink(storage, index, f.from, f.line, f.oldTarget, f.newTarget)
          : await retargetMarkdownLink(storage, index, f.from, f.line, f.oldTarget, f.newTarget),
      );
    } catch (e) {
      if (e instanceof StaleError) skipped++;
      else throw e;
    }
  }
  return { changes, skipped };
}
