import type { VaultIndex } from './index';

export interface HealthReport {
  unresolved: { from: string; line: number; target: string; suggestion?: string }[];
  ambiguous: { from: string; line: number; target: string; candidates: string[] }[];
  duplicates: { name: string; paths: string[] }[];
  orphans: string[];
  untyped: string[];
  missingEmbeds: { from: string; line: number; target: string }[];
  unusedAttachments: string[];
}

const ATTACHMENT = /\.(png|jpe?g|gif|webp|svg|pdf|heic|mp3|m4a|mp4|mov)$/i;

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** The note name closest to a broken link target, if it is close enough to be a likely typo. */
export function suggestNote(index: VaultIndex, target: string): string | undefined {
  const want = (target.split('/').pop() ?? target).replace(/\.md$/i, '').toLowerCase();
  let best: { name: string; d: number } | undefined;
  for (const n of index.notes.values()) {
    const d = levenshtein(want, n.name.toLowerCase());
    if (d <= Math.max(2, Math.floor(want.length * 0.2)) && (!best || d < best.d)) best = { name: n.name, d };
  }
  return best?.name;
}

/** Findings only. Nothing here blocks work, and nothing is changed by running it. */
export function checkHealth(index: VaultIndex): HealthReport {
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
      else if (res.ambiguous) r.ambiguous.push({ from: n.path, line: l.line, target: l.target, candidates: res.ambiguous });
      else r.unresolved.push({ from: n.path, line: l.line, target: l.target, suggestion: suggestNote(index, l.target) });
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
