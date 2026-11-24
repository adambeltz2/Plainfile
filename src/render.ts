/**
 * Markdown to something you can hand to another person: a small renderer with no dependencies. It reads the
 * markdown of a note (frontmatter and all) into blocks, and writes them as HTML (for pasting into Word, Google
 * Docs or email), plain text, or the .docx writer. By default it makes the note "clean": no frontmatter, no
 * `#tags`, `@people` or `due:` markers, `[[links]]` as plain words and tasks as ☐ and ☑.
 */
export type Inline =
  | { t: 'text'; s: string }
  | { t: 'b' | 'i' | 's'; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'img'; alt: string; src: string };

export interface ListItem {
  /** For a task: ' ' open or 'x' done. */
  task?: ' ' | 'x';
  c: Inline[];
  children: Block[];
}

export type Block =
  | { k: 'h'; level: number; c: Inline[] }
  | { k: 'p'; c: Inline[] }
  | { k: 'list'; ordered: boolean; items: ListItem[] }
  | { k: 'quote'; c: Block[] }
  | { k: 'code'; s: string }
  | { k: 'hr' }
  | { k: 'table'; head: Inline[][]; rows: Inline[][][] };

export interface RenderOptions {
  /** Keep `#tags`, `@people`, `due:` markers and the frontmatter. Off by default. */
  keepMarkers?: boolean;
  /** Data addresses for images, by their path in the note, found by `imagePaths` and read by the caller. */
  images?: ReadonlyMap<string, string>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function stripFrontmatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

/** Remove the markers that mean something to Plainfile but nothing to a reader. */
export function hideMarkers(s: string): string {
  return s
    .replace(/(^|\s)#?due:\S+/gi, '$1')
    .replace(/(^|\s)created:\S+/gi, '$1')
    .replace(/(^|\s)done:\d{4}-\d{2}-\d{2}/gi, '$1')
    .replace(/(^|\s)\[(?:due|created)::[^\]]*\]/gi, '$1')
    .replace(/\s*(?:📅|➕|⏳)\s*\d{4}-\d{2}-\d{2}/g, '')
    .replace(/(^|[\s(])#[\p{L}][\p{L}\p{N}_/-]*/gu, '$1')
    .replace(/(^|[\s(])@[\p{L}\p{N}_][\p{L}\p{N}_-]*/gu, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}

/** Pairs of the inline syntaxes, tried in this order at each point. */
function parseInline(src: string, o: RenderOptions): Inline[] {
  const out: Inline[] = [];
  const text = (s: string): void => {
    if (s) out.push({ t: 'text', s });
  };
  const rules: { re: RegExp; make: (m: RegExpExecArray) => Inline | Inline[] }[] = [
    { re: /`([^`]+)`/, make: (m) => ({ t: 'code', s: m[1] as string }) },
    { re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, make: (m) => ({ t: 'img', alt: m[1] as string, src: m[2] as string }) },
    { re: /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/, make: (m) => ({ t: 'img', alt: '', src: m[1] as string }) },
    {
      re: /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/,
      make: (m) => ({ t: 'text', s: (m[2] ?? (m[1] as string).split('/').pop()?.replace(/\.md$/i, '') ?? '').trim() }),
    },
    {
      re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/,
      make: (m) =>
        /^(https?:|mailto:)/i.test(m[2] as string) ? { t: 'link', href: m[2] as string, c: parseInline(m[1] as string, o) } : parseInline(m[1] as string, o),
    },
    { re: /\*\*([^*]+)\*\*|__([^_]+)__/, make: (m) => ({ t: 'b', c: parseInline((m[1] ?? m[2]) as string, o) }) },
    { re: /~~([^~]+)~~/, make: (m) => ({ t: 's', c: parseInline(m[1] as string, o) }) },
    { re: /(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*?)_(?![\w_])/, make: (m) => ({ t: 'i', c: parseInline((m[1] ?? m[2]) as string, o) }) },
    { re: /<(https?:\/\/[^>\s]+)>/, make: (m) => ({ t: 'link', href: m[1] as string, c: [{ t: 'text', s: m[1] as string }] }) },
    // A web address on its own becomes a link, without the full stop or bracket that ends the sentence.
    {
      re: /(?<![\w"'=(\[])https?:\/\/[^\s<>\]]+/,
      make: (m) => {
        const url = m[0].replace(/[.,;:!?'")]+$/, '');
        return [
          { t: 'link', href: url, c: [{ t: 'text', s: url }] } as Inline,
          ...(url.length < m[0].length ? [{ t: 'text', s: m[0].slice(url.length) } as Inline] : []),
        ];
      },
    },
  ];
  let rest = src;
  while (rest) {
    let best: { i: number; len: number; rule: (typeof rules)[number]; m: RegExpExecArray } | undefined;
    for (const rule of rules) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.i)) best = { i: m.index, len: m[0].length, rule, m };
    }
    if (!best) {
      text(rest);
      break;
    }
    text(rest.slice(0, best.i).replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1'));
    const made = best.rule.make(best.m);
    if (Array.isArray(made)) out.push(...made);
    else out.push(made);
    rest = rest.slice(best.i + best.len);
  }
  return out;
}

const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
export const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

/**
 * The markdown without its HTML comments (`<!-- a note to yourself -->`, on one line or several). A comment inside a
 * fenced code block is code, so it stays. Other readers do not show comments either.
 */
export function stripComments(md: string): string {
  const out: string[] = [];
  let fence = '';
  let inComment = false;
  for (const line of md.split('\n')) {
    const f = /^\s*(```|~~~)/.exec(line);
    if (!inComment && f) {
      fence = fence ? (fence === f[1] ? '' : fence) : (f[1] as string);
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    let rest = line;
    let kept = '';
    let touched = inComment;
    for (;;) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end < 0) {
          rest = '';
          break;
        }
        rest = rest.slice(end + 3);
        inComment = false;
      } else {
        const start = rest.indexOf('<!--');
        if (start < 0) break;
        kept += rest.slice(0, start);
        rest = rest.slice(start + 4);
        inComment = true;
        touched = true;
      }
    }
    // A line that was only a comment goes away entirely, so the lines around it stay one paragraph.
    if (touched && !(kept + rest).trim()) continue;
    out.push(kept + rest);
  }
  return out.join('\n');
}

/** The note's markdown as blocks. */
export function parseBlocks(md: string, o: RenderOptions = {}): Block[] {
  const clean = (s: string): string => (o.keepMarkers ? s : hideMarkers(s));
  const inl = (s: string): Inline[] => parseInline(clean(s), o);
  const body = stripComments(o.keepMarkers ? md : stripFrontmatter(md));
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];

  const isStart = (l: string, next?: string): boolean =>
    /^\s{0,3}#{1,6}\s/.test(l) ||
    HR.test(l) ||
    FENCE.test(l) ||
    /^\s{0,3}>/.test(l) ||
    LIST.test(l) ||
    (l.includes('|') && next !== undefined && TABLE_SEP.test(next));

  for (let i = 0; i < lines.length;) {
    const l = lines[i] as string;
    if (!l.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(l);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] as string).trim().startsWith(fence[1] as string)) buf.push(lines[i++] as string);
      i++;
      blocks.push({ k: 'code', s: buf.join('\n') });
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      blocks.push({ k: 'h', level: (h[1] as string).length, c: inl(h[2] as string) });
      i++;
      continue;
    }
    if (HR.test(l)) {
      blocks.push({ k: 'hr' });
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(l)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i] as string)) buf.push((lines[i++] as string).replace(/^\s{0,3}>\s?/, ''));
      blocks.push({ k: 'quote', c: parseBlocks(buf.join('\n'), { ...o, keepMarkers: true }).map((b) => b) });
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1] as string)) {
      const head = cells(l).map(inl);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] as string).includes('|') && (lines[i] as string).trim()) rows.push(cells(lines[i++] as string).map(inl));
      blocks.push({ k: 'table', head, rows });
      continue;
    }
    if (LIST.test(l)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const x = lines[i] as string;
        if (LIST.test(x) || (x.trim() && /^\s+\S/.test(x) && buf.length)) buf.push(x);
        else break;
        i++;
      }
      blocks.push(...listBlocks(buf, inl));
      continue;
    }
    const buf: string[] = [l.trim()];
    i++;
    while (i < lines.length && (lines[i] as string).trim() && !isStart(lines[i] as string, lines[i + 1])) buf.push((lines[i++] as string).trim());
    // A line break inside a paragraph stays a line break, the way the editor shows it.
    blocks.push({ k: 'p', c: inl(buf.join('\n')) });
  }
  return blocks;
}

/** Lines of a list, nested by indentation. */
function listBlocks(buf: string[], inl: (s: string) => Inline[]): Block[] {
  type Node = { indent: number; ordered: boolean; item: ListItem };
  const roots: Block[] = [];
  const stack: { indent: number; list: Extract<Block, { k: 'list' }> }[] = [];
  const nodes: Node[] = [];
  for (const raw of buf) {
    const m = LIST.exec(raw);
    if (!m) {
      const last = nodes.at(-1);
      if (last) last.item.c.push(...inl(` ${raw.trim()}`));
      continue;
    }
    const indent = (m[1] as string).replace(/\t/g, '    ').length;
    const ordered = /\d/.test(m[2] as string);
    let text = m[3] as string;
    let task: ' ' | 'x' | undefined;
    const t = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (t) {
      task = (t[1] as string).toLowerCase() === 'x' ? 'x' : ' ';
      text = t[2] as string;
    }
    const item: ListItem = { task, c: inl(text), children: [] };
    while (stack.length && (stack.at(-1) as (typeof stack)[number]).indent > indent) stack.pop();
    let top = stack.at(-1);
    if (!top || top.indent < indent) {
      const list: Extract<Block, { k: 'list' }> = { k: 'list', ordered, items: [] };
      const parentItem = top?.list.items.at(-1);
      if (parentItem) parentItem.children.push(list);
      else roots.push(list);
      top = { indent, list };
      stack.push(top);
    }
    top.list.items.push(item);
    nodes.push({ indent, ordered, item });
  }
  return roots;
}

/** Paths of the images a note refers to, so the caller can read them and hand back data addresses. */
export function imagePaths(md: string): string[] {
  const out = new Set<string>();
  const walk = (inl: Inline[]): void => {
    for (const x of inl) {
      if (x.t === 'img' && !/^(https?:|data:)/i.test(x.src)) out.add(x.src);
      else if ('c' in x && Array.isArray(x.c)) walk(x.c);
    }
  };
  const blocks = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.k === 'h' || b.k === 'p') walk(b.c);
      else if (b.k === 'list') for (const it of b.items) (walk(it.c), blocks(it.children));
      else if (b.k === 'quote') blocks(b.c);
      else if (b.k === 'table') for (const r of [b.head, ...b.rows]) for (const c of r) walk(c);
    }
  };
  blocks(parseBlocks(md, { keepMarkers: true }));
  return [...out];
}

/* ---------- HTML ---------- */

function inlineHtml(inl: Inline[], o: RenderOptions): string {
  return inl
    .map((x): string => {
      switch (x.t) {
        case 'text':
          return esc(x.s).replace(/\n/g, '<br>');
        case 'b':
          return `<b>${inlineHtml(x.c, o)}</b>`;
        case 'i':
          return `<i>${inlineHtml(x.c, o)}</i>`;
        case 's':
          return `<s>${inlineHtml(x.c, o)}</s>`;
        case 'code':
          return `<code style="font-family:Consolas,monospace">${esc(x.s)}</code>`;
        case 'link':
          return `<a href="${esc(x.href)}" target="_blank" rel="noopener noreferrer">${inlineHtml(x.c, o)}</a>`;
        case 'img': {
          const src = /^(https?:|data:)/i.test(x.src) ? x.src : o.images?.get(x.src);
          return src ? `<img src="${esc(src)}" alt="${esc(x.alt)}" style="max-width:100%">` : x.alt ? `[image: ${esc(x.alt)}]` : '';
        }
      }
    })
    .join('');
}

function blockHtml(b: Block, o: RenderOptions): string {
  switch (b.k) {
    case 'h':
      return `<h${b.level}>${inlineHtml(b.c, o)}</h${b.level}>`;
    case 'p':
      return `<p>${inlineHtml(b.c, o)}</p>`;
    case 'hr':
      return '<hr>';
    case 'code':
      return `<pre style="font-family:Consolas,monospace;background:#f3f3f3;padding:6px">${esc(b.s)}</pre>`;
    case 'quote':
      return `<blockquote style="border-left:3px solid #999;margin-left:0;padding-left:10px">${b.c.map((x) => blockHtml(x, o)).join('')}</blockquote>`;
    case 'table':
      return `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse"><thead><tr>${b.head.map((c) => `<th style="text-align:left">${inlineHtml(c, o)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c, o)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const anyTask = b.items.some((i) => i.task);
      return `<${tag}${anyTask ? ' style="list-style:none;padding-left:0"' : ''}>${b.items
        .map((i) => `<li>${i.task ? (i.task === 'x' ? '☑ ' : '☐ ') : ''}${inlineHtml(i.c, o)}${i.children.map((c) => blockHtml(c, o)).join('')}</li>`)
        .join('')}</${tag}>`;
    }
  }
}

export function toHtml(md: string, o: RenderOptions = {}): string {
  return parseBlocks(md, o)
    .map((b) => blockHtml(b, o))
    .join('\n');
}

/* ---------- plain text ---------- */

function inlineText(inl: Inline[]): string {
  return inl
    .map((x): string => {
      if (x.t === 'text') return x.s;
      if (x.t === 'code') return x.s;
      if (x.t === 'img') return x.alt ? `[image: ${x.alt}]` : '';
      if (x.t === 'link') return `${inlineText(x.c)} (${x.href})`;
      return inlineText(x.c);
    })
    .join('');
}

function blockText(b: Block, depth = 0): string {
  const pad = '  '.repeat(depth);
  switch (b.k) {
    case 'h':
      return `${inlineText(b.c)}\n`;
    case 'p':
      return inlineText(b.c);
    case 'hr':
      return '---';
    case 'code':
      return b.s;
    case 'quote':
      return b.c
        .map((x) => blockText(x))
        .join('\n')
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'table':
      return [b.head, ...b.rows].map((r) => r.map(inlineText).join('\t')).join('\n');
    case 'list':
      return b.items
        .map(
          (i, n) =>
            `${pad}${i.task ? (i.task === 'x' ? '☑ ' : '☐ ') : b.ordered ? `${n + 1}. ` : '- '}${inlineText(i.c)}${i.children.length ? `\n${i.children.map((c) => blockText(c, depth + 1)).join('\n')}` : ''}`,
        )
        .join('\n');
  }
}

export function toPlain(md: string, o: RenderOptions = {}): string {
  return `${parseBlocks(md, o)
    .map((b) => blockText(b))
    .join('\n\n')}\n`;
}

/** A print-ready page around the HTML, so the browser's Save as PDF gives a clean document. */
export function printPage(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12pt/1.45 Calibri,Arial,sans-serif;max-width:46em;margin:2em auto;color:#000}h1,h2,h3{line-height:1.2}table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px}img{max-width:100%}@media print{body{margin:0}}</style></head><body>${bodyHtml}</body></html>`;
}

/** Words in a note's body (frontmatter, code fences and link addresses left out) and a reading time at 220 words a minute. */
export function readingStats(md: string): { words: number; minutes: number } {
  const body = stripFrontmatter(md)
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
  const words = (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  return { words, minutes: words ? Math.max(1, Math.round(words / 220)) : 0 };
}
