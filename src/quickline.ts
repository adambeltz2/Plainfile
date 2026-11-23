import { dirname } from './index';
import type { Project } from './projects';
import { addDays } from './query';

/** What one typed line means: `Call Dana +Website @dana #launch due:tomorrow`. */
export interface QuickLine {
  /** The task text, with the due date written as an ISO date and the `+Project` word removed. */
  text: string;
  /** Just the words: no `@people`, `#tags`, `due:` or `+Project`. This is a task note's title. */
  title: string;
  due?: string;
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

/** Pull `+Project`, `due:word`, `@people` and `#tags` out of one line. Everything else is the task text. */
export function parseQuickLine(line: string, today: string): QuickLine {
  const out: QuickLine = { text: '', title: '', people: [], tags: [] };
  const kept: string[] = [];
  const words: string[] = [];
  for (const tok of line.trim().split(/\s+/)) {
    if (!tok) continue;
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
