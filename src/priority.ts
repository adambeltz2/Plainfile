/**
 * Priority as a capital letter in parentheses, the todo.txt way: `- [ ] (A) Call Dana`. A task note keeps it in
 * frontmatter as `priority: A`. Obsidian Tasks' emoji (🔺 ⏫ 🔼 🔽 ⏬) are read as well, never written.
 */
const LEADING = /^\(([A-Z])\)(?=\s|$)\s*/;
const EMOJI: Record<string, string> = { '🔺': 'A', '⏫': 'A', '🔼': 'B', '🔽': 'C', '⏬': 'C' };
export const PRIORITY_EMOJI = /\s*[🔺⏫🔼🔽⏬]️?/gu;

/** The priority letter in the text of a task (after its checkbox), if it has one. A leading `(A)` wins over an emoji. */
export function extractPriority(text: string): string | undefined {
  const m = LEADING.exec(text);
  if (m) return m[1];
  const e = /[🔺⏫🔼🔽⏬]/u.exec(text);
  return e ? EMOJI[e[0]] : undefined;
}

/** The text of a task without its priority marks. */
export function stripPriority(text: string): string {
  return text.replace(LEADING, '').replace(PRIORITY_EMOJI, ' ');
}

/** A frontmatter value as a priority letter: `a`, `A` or ` B ` work; anything else is no priority. */
export function normalizePriority(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z]$/.test(s) ? s : undefined;
}

/** 0 for A, 1 for B and so on; a task with no priority sorts after every lettered one. */
export function priorityRank(p: string | undefined): number {
  return p ? p.charCodeAt(0) - 65 : 99;
}

export const byPriority = (a: string | undefined, b: string | undefined): number => priorityRank(a) - priorityRank(b);
