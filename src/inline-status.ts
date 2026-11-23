/**
 * A status on a checkbox line, the way `due:` is a date: `- [ ] Call Dana status:doing`. A checkbox alone is only done
 * or not; `status:doing` and `status:waiting` say a task is under way or waiting on someone. Ticking the box means
 * done and removes the word.
 */
export const INLINE_STATUSES = ['todo', 'doing', 'waiting', 'done'] as const;
export const INLINE_STATUS_RE = /(^|\s)status:(todo|doing|waiting|done)\b/i;
const BOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX](\])/;

/** The status a line carries (`doing`, `waiting`), if it names one. `done` and `todo` are the checkbox's own. */
export function extractInlineStatus(text: string): 'doing' | 'waiting' | undefined {
  const m = INLINE_STATUS_RE.exec(text);
  const v = m?.[2]?.toLowerCase();
  return v === 'doing' || v === 'waiting' ? v : undefined;
}

/** The line without a `status:` word. */
export function stripInlineStatus(body: string): string {
  return body.replace(/\s+status:(?:todo|doing|waiting|done)\b/i, '');
}

/**
 * A checkbox line set to a status. done ticks the box and drops the word; todo unticks it and drops the word; doing and
 * waiting untick it and write `status:doing` (or replace the word where it already is). Null if it is not a checkbox line.
 */
export function inlineWithStatus(body: string, status: string): string | null {
  const m = BOX.exec(body);
  if (!m) return null;
  const s = status.toLowerCase();
  if (!['todo', 'doing', 'waiting', 'done'].includes(s)) return null;
  const boxed = body.replace(BOX, (_x, a: string, b: string) => `${a}${s === 'done' ? 'x' : ' '}${b}`);
  if (s === 'doing' || s === 'waiting') {
    return INLINE_STATUS_RE.test(boxed) ? boxed.replace(INLINE_STATUS_RE, `$1status:${s}`) : `${boxed.replace(/\s+$/, '')} status:${s}`;
  }
  return stripInlineStatus(boxed);
}
