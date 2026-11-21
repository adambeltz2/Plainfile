import type { VaultIndex } from './index';
import type { VaultStorage } from './storage';
import { StaleError, type ChangeResult } from './writeback';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
