import { addDays } from './query';

/**
 * Dates in plain words at the end of a quick-add line: `Call Dana tomorrow`, `Send report next fri`,
 * `Renew in 3 days`, `Pay rent end of month`. Only the last words of the line are looked at, so a word in the middle
 * of a title (`Plan tomorrow's talk`) is left alone, and `due:` always wins when it is there.
 */
const FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const UNIT = /^(day|days|week|weeks|month|months)$/;

const dow = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Add whole months, keeping the day when the month has it and otherwise using its last day. */
export function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

const endOfMonth = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

/** The weekday index (0 = Sunday) a word names: a full name, or a three-letter one when `short` is allowed. */
function weekday(w: string, short: boolean): number {
  const full = FULL.indexOf(w);
  if (full >= 0) return full;
  return short ? SHORT.indexOf(w) : -1;
}

/** Monday of the week after `today`'s week, so `next fri` means the Friday of next week. */
function nextWeekDay(today: string, day: number): string {
  const sinceMonday = (dow(today) + 6) % 7;
  const nextMonday = addDays(today, 7 - sinceMonday);
  return addDays(nextMonday, (day + 6) % 7);
}

/** The date a run of lowercase words names, if the whole run is a date phrase. */
export function phraseDate(words: string[], today: string): string | undefined {
  const [a, b, c] = words;
  const n = words.length;
  if (n === 1) {
    if (a === 'today') return today;
    if (a === 'tomorrow') return addDays(today, 1);
    if (a === 'eom') return endOfMonth(today);
    const d = weekday(a!, false);
    if (d >= 0) return addDays(today, (d - dow(today) + 7) % 7 || 7);
    return undefined;
  }
  if (n === 2) {
    if (a === 'next' && b === 'week') return addDays(today, 7);
    if (a === 'next' && b === 'month') return addMonths(today, 1);
    if ((a === 'this' || a === 'on') && weekday(b!, true) >= 0) return addDays(today, (weekday(b!, true) - dow(today) + 7) % 7 || 7);
    if (a === 'next' && weekday(b!, true) >= 0) return nextWeekDay(today, weekday(b!, true));
    return undefined;
  }
  if (n === 3) {
    if (a === 'end' && b === 'of' && c === 'month') return endOfMonth(today);
    const k = /^\d{1,3}$/.test(b ?? '') ? Number(b) : NaN;
    if (a === 'in' && Number.isFinite(k) && UNIT.test(c ?? '')) {
      if (c!.startsWith('month')) return addMonths(today, k);
      return addDays(today, k * (c!.startsWith('week') ? 7 : 1));
    }
  }
  return undefined;
}

/**
 * Look for a date phrase among the last words of a line. `tokens` are the whitespace-separated pieces; pieces that are
 * `@people`, `#tags` or `+Project` may come after the date and are skipped when counting. Returns the date and which
 * token positions the phrase used.
 */
export function trailingPlainDate(tokens: string[], today: string): { iso: string; positions: number[] } | undefined {
  const plain: number[] = [];
  tokens.forEach((t, i) => {
    if (!/^[@#+]/.test(t)) plain.push(i);
  });
  for (let len = 3; len >= 1; len--) {
    if (plain.length < len) continue;
    const pos = plain.slice(plain.length - len);
    // The words must be next to each other, or separated only by skipped pieces.
    const words = pos.map((i) => (tokens[i] ?? '').toLowerCase().replace(/[,.;!?]+$/, ''));
    const iso = phraseDate(words, today);
    // A phrase must not be the whole line: there has to be something to do.
    if (iso && plain.length > len) return { iso, positions: pos };
  }
  return undefined;
}
