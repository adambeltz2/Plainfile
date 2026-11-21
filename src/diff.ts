export interface LineChange {
  /** 1-based line where the change starts. */
  start: number;
  removed: string[];
  added: string[];
}

/**
 * The changed block between two versions of a file, found by trimming the lines
 * both share at the start and at the end. Returns null when nothing changed.
 * Used for the "what changed on disk" readout after an edit.
 */
export function lineDiff(before: string, after: string): LineChange | null {
  if (before === after) return null;
  const a = before.split('\n');
  const b = after.split('\n');
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  return { start: s + 1, removed: a.slice(s, ea), added: b.slice(s, eb) };
}
