import { extractCompleted } from './parse';

/**
 * The day a task was finished, written the way a due date is: `- [x] Call Dana done:2026-11-23` on a checkbox line,
 * `completed: 2026-11-23` in a task note. Ticking a task in tendfile adds it and unticking removes it. A task that
 * already says when it was finished (Obsidian's ✅ or Dataview's field) keeps that, and a tick made in another editor
 * has no date, which is fine: the date is a record, not a requirement.
 */
export const DONE_STAMP_RE = /\s+done:\d{4}-\d{2}-\d{2}/i;

/** A checkbox line after finishing it (`done` true, with today's date in `on`) or reopening it (any stamp comes off). */
export function withCompletion(body: string, done: boolean, on?: string): string {
  if (!done) return body.replace(DONE_STAMP_RE, '');
  if (on === undefined || extractCompleted(body)) return body;
  return `${body.replace(/\s+$/, '')} done:${on}`;
}
