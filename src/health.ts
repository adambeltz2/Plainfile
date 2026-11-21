import type { VaultIndex } from './index';

export interface HealthReport {
  unresolved: { from: string; line: number; target: string; kind: 'wiki' | 'md'; suggestion?: string; suggestionPath?: string }[];
  ambiguous: { from: string; line: number; target: string; kind: 'wiki' | 'md'; candidates: string[] }[];
  duplicates: { name: string; paths: string[] }[];
  orphans: string[];
  untyped: string[];
  missingEmbeds: { from: string; line: number; target: string }[];
  unusedAttachments: string[];
}

const ATTACHMENT = /\.(png|jpe?g|gif|webp|svg|pdf|heic|mp3|m4a|mp4|mov)$/i;

/**
 * Edit distance between two strings. With `max`, gives up as soon as the distance must exceed it
 * and returns max + 1, which is much faster when only near matches matter.
 */
export function levenshtein(a: string, b: string, max: number = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    let rowMin = prev[0]!;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
      if (prev[j]! < rowMin) rowMin = prev[j]!;
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length]!;
}

/** The path of the note closest to a broken link target, if it is close enough to be a likely typo. */
export function suggestNotePath(index: VaultIndex, target: string): string | undefined {
  const want = (target.split('/').pop() ?? target).replace(/\.md$/i, '').toLowerCase();
  const limit = Math.max(2, Math.floor(want.length * 0.2));
  let best: { path: string; d: number } | undefined;
  for (const n of index.notes.values()) {
    if (Math.abs(n.name.length - want.length) > limit) continue; // too different in length to be a typo
    const d = levenshtein(want, n.name.toLowerCase(), best ? Math.min(limit, best.d) : limit);
    if (d <= limit && (!best || d < best.d)) best = { path: n.path, d };
  }
  return best?.path;
}

/** The note name closest to a broken link target, if it is close enough to be a likely typo. */
export function suggestNote(index: VaultIndex, target: string): string | undefined {
  const p = suggestNotePath(index, target);
  return p ? index.notes.get(p)?.name : undefined;
}

/**
 * Findings only. Nothing here blocks work, and nothing is changed by running it.
 * Pass `suggestions: false` for a quick count, as the navigation badge does.
 */
export function checkHealth(index: VaultIndex, opts: { suggestions?: boolean } = {}): HealthReport {
  const suggestions = opts.suggestions ?? true;
  const r: HealthReport = { unresolved: [], ambiguous: [], duplicates: [], orphans: [], untyped: [], missingEmbeds: [], unusedAttachments: [] };
  const usedFiles = new Set<string>();
  const byName = new Map<string, string[]>();

  for (const n of [...index.notes.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const names = byName.get(n.name.toLowerCase());
    if (names) names.push(n.path);
    else byName.set(n.name.toLowerCase(), [n.path]);

    let outgoing = 0;
    for (const l of n.links) {
      const res = index.resolveLink(n, l);
      if (res.path) outgoing++;
      else if (res.ambiguous) r.ambiguous.push({ from: n.path, line: l.line, target: l.target, kind: l.kind, candidates: res.ambiguous });
      else {
        // Spelling suggestions cost a comparison against every note, so only work them out when asked.
        const suggestionPath = suggestions ? suggestNotePath(index, l.target) : undefined;
        r.unresolved.push({
          from: n.path,
          line: l.line,
          target: l.target,
          kind: l.kind,
          suggestion: suggestionPath ? index.notes.get(suggestionPath)?.name : undefined,
          suggestionPath,
        });
      }
    }
    for (const e of n.embeds) {
      const hit = index.resolveEmbed(n, e.target);
      if (hit) usedFiles.add(hit);
      else r.missingEmbeds.push({ from: n.path, line: e.line, target: e.target });
    }
    if (outgoing === 0 && index.backlinks(n.path).length === 0) r.orphans.push(n.path);
    if (!n.type && !n.fileTask) r.untyped.push(n.path);
  }

  for (const [name, paths] of byName) if (paths.length > 1) r.duplicates.push({ name, paths });
  for (const f of [...index.files].sort()) if (ATTACHMENT.test(f) && !usedFiles.has(f)) r.unusedAttachments.push(f);
  return r;
}
