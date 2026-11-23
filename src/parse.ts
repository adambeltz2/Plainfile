import { parse as parseYaml } from 'yaml';

/**
 * Reading is tolerant: any markdown file parses, with or without frontmatter,
 * and several task/date syntaxes are understood. Nothing here ever writes.
 */

export interface LinkRef {
  kind: 'wiki' | 'md';
  target: string;
  line: number; // 1-based
}

export interface EmbedRef {
  target: string;
  line: number;
}

export interface InlineTask {
  line: number; // 1-based
  /** Index of the [ ] state character within the line, used for surgical edits. */
  col: number;
  marker: string;
  state: ' ' | 'x';
  /** The full line without its line ending, used to detect that the file moved on. */
  raw: string;
  title: string;
  due?: string;
  /** When the task was added, from `created:2026-11-21` (or Obsidian Tasks' ➕ date). */
  created?: string;
  who: string[];
  tags: string[];
  /** Checkboxes nested under this one, at any depth: how many, and how many are ticked. */
  sub?: { done: number; total: number };
}

/** A note that is itself a task: frontmatter has `status` and it lives in a tasks/ folder or has type: task. */
export interface FileTask {
  status: string;
  done: boolean;
  due?: string;
  created?: string;
  statusLine: number; // 1-based line of `status:` in the frontmatter
  statusRaw: string;
}

export interface Note {
  path: string;
  name: string; // file name without extension
  title: string;
  aliases: string[];
  type?: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  frontmatterError?: string;
  headings: { level: number; text: string; line: number }[];
  links: LinkRef[];
  embeds: EmbedRef[];
  tasks: InlineTask[];
  /** Lines tagged #followup that are not checkboxes (the first Notebook app's follow-ups). */
  followups: { line: number; title: string }[];
  /** The first plain lines of the body (no headings, tasks or follow-ups), used as a short preview. */
  preview: string;
  fileTask?: FileTask;
  text: string;
  hash: string;
  mtime: number;
  size: number;
}

const DONE_STATUSES = new Set(['done', 'complete', 'completed', 'closed', 'cancelled', 'canceled']);

const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const DUE_PATTERNS = [
  new RegExp(String.raw`#?\bdue:\s?(${DATE})`, 'i'), // due:2026-11-23, and #due:2026-11-23 from the first Notebook app
  new RegExp(String.raw`📅\s*(${DATE})`), // Obsidian Tasks
  new RegExp(String.raw`\[due::\s*(${DATE})\]`, 'i'), // Dataview
];

const CREATED_PATTERNS = [
  new RegExp(String.raw`\bcreated:\s?(${DATE})`, 'i'), // created:2026-11-21
  new RegExp(String.raw`➕\s*(${DATE})`), // Obsidian Tasks
  new RegExp(String.raw`\[created::\s*(${DATE})\]`, 'i'), // Dataview
];

const TASK_LINE = /^(\s*)([-*+]|\d+[.)]) \[( |x|X)\](?: (.*))?$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6}) +(.*?)(?: +#+)?\s*$/;
const WIKI = /!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const MDLINK = /(!?)\[[^\]]*\]\(([^)\s]+?)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;
const TAG = /(^|\s)#([\w/-]*[A-Za-z_][\w/-]*)(?![\w/-]|:\d)/g; // `#due:2026-...` is a date, not a tag
const WHO = /(^|\s)@([\w-]+)/g;

export function hashText(s: string): string {
  // cyrb53: small, fast, good enough to spot an identical file after a rename.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A line as plain words: no list marker, images, link syntax, emphasis or code ticks. */
function plainText(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function maskCode(line: string): string {
  return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string')
    return v
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  return [];
}

function toIsoDate(v: unknown): string | undefined {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && new RegExp(`^${DATE}$`).test(v.trim())) return v.trim();
  return undefined;
}

function cleanTitle(text: string): string {
  let t = text;
  for (const p of [...DUE_PATTERNS, ...CREATED_PATTERNS]) t = t.replace(new RegExp(p.source, p.flags + 'g'), ' ');
  t = t.replace(WHO, '$1').replace(TAG, '$1');
  return t.replace(/\s+/g, ' ').trim();
}

export function extractCreated(text: string): string | undefined {
  for (const p of CREATED_PATTERNS) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

export function extractDue(text: string): string | undefined {
  for (const p of DUE_PATTERNS) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

export function parseNote(path: string, rawText: string, meta: { mtime: number; size: number }): Note {
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const base = path.split('/').pop() ?? path;
  const name = base.replace(/\.md$/i, '');

  // Frontmatter: only valid if the very first line is ---
  let fm: Record<string, unknown> = {};
  let fmError: string | undefined;
  let bodyStart = 0;
  let fmEnd = -1;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---' || lines[i] === '...') {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd > 0) {
      bodyStart = fmEnd + 1;
      try {
        const parsed = parseYaml(lines.slice(1, fmEnd).join('\n'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fm = parsed as Record<string, unknown>;
      } catch (e) {
        fmError = e instanceof Error ? e.message.split('\n')[0] : 'invalid frontmatter';
      }
    }
  }

  const tags = new Set<string>(toStringList(fm.tags).map((t) => t.replace(/^#/, '').toLowerCase()));
  const links: LinkRef[] = [];
  const embeds: EmbedRef[] = [];
  const tasks: InlineTask[] = [];
  const followups: Note['followups'] = [];
  const previewLines: string[] = [];
  const headings: Note['headings'] = [];
  let inFence = false;
  /** Open ancestors of the line being read, by indent, so nested checkboxes can be counted under them. */
  const open: { task: InlineTask; indent: number }[] = [];

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const masked = maskCode(line);

    const h = HEADING.exec(masked);
    if (h) headings.push({ level: h[1]!.length, text: (h[2] ?? '').trim(), line: lineNo });

    for (const m of masked.matchAll(WIKI)) {
      const target = (m[1] ?? '').trim();
      if (!target) continue;
      if (m[0].startsWith('!')) embeds.push({ target, line: lineNo });
      else links.push({ kind: 'wiki', target, line: lineNo });
    }
    for (const m of masked.matchAll(MDLINK)) {
      const target = decodeURI(m[2] ?? '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue; // external or in-page
      if (m[1] === '!') embeds.push({ target, line: lineNo });
      else if (/\.md$/i.test(target)) links.push({ kind: 'md', target, line: lineNo });
    }
    const lineTags = [...masked.matchAll(TAG)].map((m) => (m[2] ?? '').toLowerCase());
    for (const g of lineTags) tags.add(g);

    const t = TASK_LINE.exec(line);
    if (line.trim()) {
      const indent = (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;
      while (open.length && (open[open.length - 1]?.indent ?? 0) >= indent) open.pop();
    }
    if (t) {
      const rest = t[4] ?? '';
      const taskTags = [...rest.matchAll(TAG)].map((x) => (x[2] ?? '').toLowerCase());
      tasks.push({
        line: lineNo,
        col: (t[1] ?? '').length + (t[2] ?? '').length + 2,
        marker: t[2] ?? '-',
        state: (t[3] ?? ' ') === ' ' ? ' ' : 'x',
        raw: line,
        title: cleanTitle(rest),
        due: extractDue(rest),
        created: extractCreated(rest),
        who: [...rest.matchAll(WHO)].map((x) => `@${(x[2] ?? '').toLowerCase()}`),
        tags: taskTags,
      });
      const mine = tasks[tasks.length - 1] as InlineTask;
      for (const a of open) {
        a.task.sub = a.task.sub ?? { done: 0, total: 0 };
        a.task.sub.total++;
        if (mine.state === 'x') a.task.sub.done++;
      }
      open.push({ task: mine, indent: (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length });
    } else if (!h && lineTags.includes('followup')) {
      followups.push({ line: lineNo, title: cleanTitle(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')) });
    }
    if (previewLines.length < 2 && !h && !t && !lineTags.includes('followup')) {
      const plain = plainText(line);
      if (plain) previewLines.push(plain);
    }
  }

  const h1 = headings.find((h) => h.level === 1);
  const fmTitle = typeof fm.title === 'string' && fm.title.trim() ? fm.title.trim() : undefined;
  const title = fmTitle ?? h1?.text ?? name;

  let fileTask: FileTask | undefined;
  if (fmEnd > 0 && fm.status !== undefined && (fm.type === 'task' || /(^|\/)tasks\//.test(path))) {
    const idx = lines.slice(1, fmEnd).findIndex((l) => /^status\s*:/.test(l));
    if (idx >= 0) {
      const status = String(fm.status).trim().toLowerCase();
      fileTask = {
        status,
        done: DONE_STATUSES.has(status),
        due: toIsoDate(fm.due),
        created: toIsoDate(fm.created),
        statusLine: idx + 2,
        statusRaw: lines[idx + 1] ?? '',
      };
    }
  }

  return {
    path,
    name,
    title,
    aliases: toStringList(fm.aliases),
    type: typeof fm.type === 'string' ? fm.type : undefined,
    tags: [...tags],
    frontmatter: fm,
    frontmatterError: fmError,
    headings,
    links,
    embeds,
    tasks,
    followups,
    preview: previewLines.join(' ').slice(0, 200),
    fileTask,
    text,
    hash: hashText(text),
    mtime: meta.mtime,
    size: meta.size,
  };
}
