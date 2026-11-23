import { dirname } from './index';
import type { Project } from './projects';
import { trailingPlainDate } from './natural-date';
import { addDays } from './query';

/** What one typed line means: `Call Dana +Website @dana #launch due:tomorrow`. */
export interface QuickLine {
  /** The task text, with the due date written as an ISO date and the `+Project` word removed. */
  text: string;
  /** Just the words: no `@people`, `#tags`, `due:` or `+Project`. This is a task note's title. */
  title: string;
  due?: string;
  /** It repeats: `1w`, `+3d` (from `rec:1w`, or words like `every monday` at the end). Kept in `text` as `rec:1w`. */
  rec?: string;
  /** A leading `(A)`: the priority letter. It stays in `text` and is left out of `title`. */
  priority?: string;
  project?: string;
  people: string[];
  tags: string[];
  /** A `due:` word that could not be understood, so the app can say so instead of guessing. */
  badDue?: string;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** "today", "tomorrow", "mon", "next-week", "+3d", "2026-11-23" to an ISO date, or undefined. */
export function parseDueWord(word: string, today: string): string | undefined {
  const w = word.toLowerCase().replace(/[,.;]+$/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  if (w === 'today' || w === 'tod') return today;
  if (w === 'tomorrow' || w === 'tmr' || w === 'tom') return addDays(today, 1);
  if (w === 'nextweek' || w === 'next-week' || w === 'next_week') return addDays(today, 7);
  const rel = /^\+?(\d{1,3})([dw])$/.exec(w);
  if (rel) return addDays(today, Number(rel[1]) * (rel[2] === 'w' ? 7 : 1));
  const day = DAYS.findIndex((d, i) => w === d || w === FULL[i]);
  if (day >= 0) {
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, (day - now + 7) % 7 || 7);
  }
  return undefined;
}

const EVERY_UNIT: Record<string, string> = { day: 'd', days: 'd', week: 'w', weeks: 'w', month: 'm', months: 'm', year: 'y', years: 'y' };
const EVERY_WORD: Record<string, string> = { daily: '1d', weekly: '1w', monthly: '1m', yearly: '1y', annually: '1y' };

/** `every week`, `every 2 weeks`, `every monday`, `weekly` at the end of the line: the repeat, the first due day for a weekday, and the words. */
function trailingEvery(toks: string[], today: string): { rec: string; due?: string; positions: number[] } | undefined {
  const last = toks.length - 1;
  const w = (i: number): string => (toks[i] ?? '').toLowerCase().replace(/[,.;]+$/, '');
  if (last >= 1 && EVERY_WORD[w(last)] && !/^rec:/.test(w(last))) return { rec: EVERY_WORD[w(last)] as string, positions: [last] };
  for (const span of [3, 2]) {
    const at = last - span + 1;
    if (at < 0 || w(at) !== 'every') continue;
    const positions = Array.from({ length: span }, (_, k) => at + k);
    if (span === 3 && /^\d{1,3}$/.test(w(at + 1)) && EVERY_UNIT[w(at + 2)]) return { rec: `${w(at + 1)}${EVERY_UNIT[w(at + 2)]}`, positions };
    if (span === 2 && EVERY_UNIT[w(at + 1)]) return { rec: `1${EVERY_UNIT[w(at + 1)]}`, positions };
    if (span === 2) {
      const due = parseDueWord(w(at + 1), today);
      if (due && !/^\+?\d/.test(w(at + 1)) && !['today', 'tod', 'tomorrow', 'tmr', 'tom', 'nextweek'].includes(w(at + 1))) return { rec: '1w', due, positions };
    }
  }
  return undefined;
}

/** Pull `+Project`, `due:word`, `@people` and `#tags` out of one line. Everything else is the task text. */
export function parseQuickLine(line: string, today: string): QuickLine {
  const out: QuickLine = { text: '', title: '', people: [], tags: [] };
  const kept: string[] = [];
  const words: string[] = [];
  const toks = line.trim().split(/\s+/).filter(Boolean);
  // A date in plain words at the end ("tomorrow", "next fri", "in 3 days"), unless a `due:` is there.
  const every = trailingEvery(toks, today);
  const hasRec = toks.some((t) => /^rec:/i.test(t));
  const rest = every ? toks.slice(0, Math.min(...every.positions)) : toks;
  const plain = toks.some((t) => /^due:/i.test(t)) ? undefined : trailingPlainDate(rest, today);
  const skip = new Set([...(plain?.positions ?? []), ...(every && !hasRec ? every.positions : [])]);
  if (plain) out.due = plain.iso;
  if (every && !hasRec) {
    out.rec = every.rec;
    if (every.due && !plain && !toks.some((t) => /^due:/i.test(t))) out.due = every.due;
  }
  for (const [i, tok] of toks.entries()) {
    if (i === 0 && /^\([A-Z]\)$/.test(tok)) {
      out.priority = tok[1];
      kept.push(tok);
      continue;
    }
    if (skip.has(i)) {
      if (i === (plain?.positions[0] ?? -1)) kept.push(`due:${plain?.iso}`);
      if (every && !hasRec && i === every.positions[0]) {
        kept.push(`rec:${every.rec}`);
        if (out.due && !plain && !toks.some((t) => /^due:/i.test(t))) kept.push(`due:${out.due}`);
      }
      continue;
    }
    const rec = /^rec:(\+?\d{1,3}[dwmy])$/i.exec(tok);
    if (rec) {
      out.rec = (rec[1] as string).toLowerCase();
      kept.push(tok);
      continue;
    }
    const due = /^due:(.*)$/i.exec(tok);
    if (due) {
      // the date is not part of the title
      const iso = parseDueWord(due[1] ?? '', today);
      if (iso) {
        out.due = iso;
        kept.push(`due:${iso}`);
      } else {
        out.badDue = due[1] || '(nothing)';
        kept.push(tok);
      }
      continue;
    }
    const proj = /^\+([^\s+].*)$/.exec(tok);
    if (proj && !/^\+\d/.test(tok)) {
      out.project = proj[1];
      continue;
    }
    const who = /^@([\w][\w.-]*)/.exec(tok);
    if (who) out.people.push(who[1]!.replace(/[.-]+$/, ''));
    const tag = /^#([A-Za-z][\w/-]*)/.exec(tok);
    if (tag) out.tags.push(tag[1]!);
    if (!who && !tag) words.push(tok);
    kept.push(tok);
  }
  out.text = kept.join(' ');
  out.title = words.join(' ');
  return out;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Which project a `+word` names: by title, folder name or file name, ignoring case and punctuation. */
export function findProject(projects: Project[], word: string): Project | undefined {
  const w = slug(word);
  if (!w) return undefined;
  const names = (p: Project): string[] => {
    const dir = dirname(p.path);
    return [p.title, dir.split('/').pop() ?? '', (p.path.split('/').pop() ?? '').replace(/\.md$/i, '')].map(slug);
  };
  return projects.find((p) => names(p).includes(w)) ?? projects.find((p) => names(p).some((n) => n.startsWith(w)));
}
