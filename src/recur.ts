import { addMonths } from './natural-date';
import { addDays } from './query';

/**
 * Repeating tasks. `rec:1w` on a checkbox line (or `repeat: 1w` in a task note) means "again a week after its due
 * date"; `rec:+1w` means "a week after I finish it". Units are d, w, m and y. Obsidian Tasks' `🔁 every week` is read
 * too (and `when done` for the second kind), but never rewritten. Finishing one writes the next copy; it never does
 * anything on its own and is always shown, and Undo takes the new copy away again.
 */
export interface Recurrence {
  n: number;
  unit: 'd' | 'w' | 'm' | 'y';
  /** Count from the day it was finished, not from the due date. */
  fromDone: boolean;
}

const UNIT_WORD: Record<string, Recurrence['unit']> = { day: 'd', days: 'd', week: 'w', weeks: 'w', month: 'm', months: 'm', year: 'y', years: 'y' };
const WORD_RULE: Record<string, Recurrence> = {
  daily: { n: 1, unit: 'd', fromDone: false },
  weekly: { n: 1, unit: 'w', fromDone: false },
  monthly: { n: 1, unit: 'm', fromDone: false },
  yearly: { n: 1, unit: 'y', fromDone: false },
  annually: { n: 1, unit: 'y', fromDone: false },
};

export const REC_RE = /(^|\s)rec:(\+?)(\d{1,3})([dwmy])\b/i;
const OBSIDIAN_RE =
  /🔁\s*every\s+(?:(\d{1,3})\s+)?(day|days|week|weeks|month|months|year|years|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b(\s+when done)?/i;

/** The recurrence a checkbox line asks for, if any. */
export function parseRecurrence(text: string): Recurrence | undefined {
  const m = REC_RE.exec(text);
  if (m) return { n: Number(m[3]), unit: (m[4] as string).toLowerCase() as Recurrence['unit'], fromDone: m[2] === '+' };
  const o = OBSIDIAN_RE.exec(text);
  if (o) {
    const unit = UNIT_WORD[(o[2] as string).toLowerCase()] ?? 'w'; // `every monday` is every week
    return { n: o[1] ? Number(o[1]) : 1, unit, fromDone: !!o[3] };
  }
  return undefined;
}

/** A task note's `repeat:` value: `weekly`, `1w`, `+2w`, `every 2 weeks`. */
export function parseRepeatField(v: unknown): Recurrence | undefined {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  const word = WORD_RULE[s];
  if (word) return word;
  const short = /^(\+?)(\d{1,3})([dwmy])$/.exec(s);
  if (short) return { n: Number(short[2]), unit: short[3] as Recurrence['unit'], fromDone: short[1] === '+' };
  const long = /^every\s+(?:(\d{1,3})\s+)?(day|days|week|weeks|month|months|year|years)(\s+when done)?$/.exec(s);
  if (long) return { n: long[1] ? Number(long[1]) : 1, unit: UNIT_WORD[long[2] as string] as Recurrence['unit'], fromDone: !!long[3] };
  return undefined;
}

/** The text without its repeat words (`rec:1w`, `🔁 every week`). */
export function stripRecurrence(text: string): string {
  return text.replace(new RegExp(REC_RE.source, 'gi'), '$1').replace(new RegExp(OBSIDIAN_RE.source, 'gi'), ' ');
}

/** How it reads in a list: `every week`, `every 2 weeks`, `every month after done`. */
export function describeRecurrence(r: Recurrence): string {
  const unit = { d: 'day', w: 'week', m: 'month', y: 'year' }[r.unit];
  return `every ${r.n === 1 ? '' : `${r.n} `}${unit}${r.n === 1 ? '' : 's'}${r.fromDone ? ', after done' : ''}`;
}

export function addPeriod(iso: string, r: Recurrence, times = 1): string {
  const k = r.n * times;
  if (r.unit === 'd') return addDays(iso, k);
  if (r.unit === 'w') return addDays(iso, 7 * k);
  return addMonths(iso, r.unit === 'm' ? k : 12 * k);
}

/**
 * The next due date. From the due date (or from the day it was finished, for `+`). If the task was late by several
 * periods the date moves on until it is today or later, so finishing a month-old weekly task makes one new task, not four.
 */
export function nextDue(r: Recurrence, due: string | undefined, finishedOn: string): string {
  const from = r.fromDone || !due ? finishedOn : due;
  let next = addPeriod(from, r);
  for (let i = 0; i < 1000 && next < finishedOn; i++) next = addPeriod(next, r);
  return next;
}

const DUE_FORMS = [/(#?\bdue:\s?)(\d{4}-\d{2}-\d{2})/i, /(📅\s*)(\d{4}-\d{2}-\d{2})/, /(\[due::\s*)(\d{4}-\d{2}-\d{2})(\])/i];

/** The checkbox line as the next copy: unticked, without its finish date or status, due on the new date, created today. */
export function nextCopy(body: string, due: string, today: string): string {
  let out = body.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)[ xX](\])/, '$1 $2');
  out = out
    .replace(/\s+done:\d{4}-\d{2}-\d{2}/i, '')
    .replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, '')
    .replace(/\s*\[completion::\s*\d{4}-\d{2}-\d{2}\]/i, '');
  out = out.replace(/\s+status:(?:todo|doing|waiting|done)\b/i, '');
  const form = DUE_FORMS.find((f) => f.test(out));
  out = form
    ? out.replace(form, (_m, a: string, _d: string, c: unknown) => `${a}${due}${typeof c === 'string' ? c : ''}`)
    : `${out.replace(/\s+$/, '')} due:${due}`;
  return out.replace(/(\bcreated:\s?)\d{4}-\d{2}-\d{2}/i, `$1${today}`).replace(/(➕\s*)\d{4}-\d{2}-\d{2}/, `$1${today}`);
}
