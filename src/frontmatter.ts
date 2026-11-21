/**
 * Surgical frontmatter edits on plain text. Everything not being changed, including
 * other keys, their order, comments and line endings, is left exactly as it was.
 * Values are raw YAML text, for example `doing` or `2026-11-24`.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const strip = (l: string): string => (l.endsWith('\r') ? l.slice(0, -1) : l);

/** Line indexes of the opening and closing --- fences, or null if the file has no frontmatter. */
function fences(lines: string[]): { end: number } | null {
  if (strip(lines[0] ?? '') !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    const l = strip(lines[i] ?? '');
    if (l === '---' || l === '...') return { end: i };
  }
  return null;
}

function findKey(lines: string[], end: number, key: string): number {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  for (let i = 1; i < end; i++) if (re.test(lines[i] ?? '')) return i;
  return -1;
}

/** Lines that belong to a key's value after its first line: indented lines and block list items. */
function continuationEnd(lines: string[], from: number, end: number): number {
  let i = from + 1;
  while (i < end && /^(\s+|-\s)/.test(lines[i] ?? '') && strip(lines[i] ?? '') !== '') i++;
  return i;
}

export function setFrontmatterField(text: string, key: string, value: string | null): string {
  const lines = text.split('\n');
  const fm = fences(lines);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (!fm) {
    if (value === null) return text;
    return `---${eol}${key}: ${value}${eol}---${eol}${text}`;
  }
  const at = findKey(lines, fm.end, key);
  if (at < 0) {
    if (value === null) return text;
    const cr = (lines[fm.end] ?? '').endsWith('\r') ? '\r' : '';
    lines.splice(fm.end, 0, `${key}: ${value}${cr}`);
    return lines.join('\n');
  }
  const stop = continuationEnd(lines, at, fm.end);
  if (value === null) {
    lines.splice(at, stop - at);
    return lines.join('\n');
  }
  const line = lines[at] as string;
  const cr = line.endsWith('\r') ? '\r' : '';
  const m = /^(.*?:\s*)(.*?)(\s+#.*?)?\r?$/.exec(line);
  const quote = m && /^["']/.test(m[2] ?? '') ? (m[2] as string)[0] : '';
  lines.splice(at, stop - at, `${m ? m[1] : `${key}: `}${quote}${value}${quote}${m?.[3] ?? ''}${cr}`);
  return lines.join('\n');
}

/** Add an item to a list-valued key such as `tags` or `aliases`. Does nothing if it is already there. */
export function addFrontmatterListItem(text: string, key: string, item: string): string {
  const lines = text.split('\n');
  const fm = fences(lines);
  if (!fm) return setFrontmatterField(text, key, `[${item}]`);
  const at = findKey(lines, fm.end, key);
  if (at < 0) return setFrontmatterField(text, key, `[${item}]`);

  const line = strip(lines[at] as string);
  const cr = (lines[at] as string).endsWith('\r') ? '\r' : '';
  const m = /^(.*?:\s*)(.*?)(\s+#.*)?$/.exec(line);
  const value = (m?.[2] ?? '').trim();
  const has = (items: string[]) => items.some((x) => x.replace(/^["']|["']$/g, '').toLowerCase() === item.toLowerCase());

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    const items = inner ? inner.split(',').map((x) => x.trim()) : [];
    if (has(items)) return text;
    lines[at] = `${m?.[1] ?? `${key}: `}[${[...items, item].join(', ')}]${m?.[3] ?? ''}${cr}`;
    return lines.join('\n');
  }
  if (value === '') {
    const stop = continuationEnd(lines, at, fm.end);
    const existing = lines.slice(at + 1, stop).map((l) => strip(l).replace(/^\s*-\s*/, ''));
    if (has(existing)) return text;
    const indent = /^(\s*)-/.exec(strip(lines[stop - 1] ?? ''))?.[1] ?? '  ';
    lines.splice(stop, 0, `${indent}- ${item}${cr}`);
    return lines.join('\n');
  }
  if (has([value])) return text;
  lines[at] = `${m?.[1] ?? `${key}: `}[${value}, ${item}]${m?.[3] ?? ''}${cr}`;
  return lines.join('\n');
}

/** The raw frontmatter text without the fences, or null. */
export function frontmatterText(text: string): string | null {
  const lines = text.split('\n');
  const fm = fences(lines);
  return fm ? lines.slice(1, fm.end).map(strip).join('\n') : null;
}
