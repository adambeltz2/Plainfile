import { dirname, type VaultIndex } from './index';
import type { Note } from './parse';

/**
 * Ways to find content related to a note: its real links, notes that share tags, notes whose
 * text is similar, notes in the same folder or project, and notes that mention each other
 * without linking. Everything here reads the index and writes nothing.
 */

const STOP = new Set(
  (
    'a about above after again all also am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your ' +
    'about also like make made need needs one two new see use used using get got per via etc'
  ).split(' '),
);

export interface Ref {
  path: string;
  title: string;
  line: number;
  /** The line the link is on, for showing why it is related. */
  context: string;
}

export interface Related {
  path: string;
  title: string;
  score: number;
  /** Plain-words reasons: shared tags, shared words, same folder. */
  why: string[];
}

export interface Mention {
  path: string;
  title: string;
  line: number;
  context: string;
  /** The text that matched, so the screen can highlight it. */
  term: string;
}

const stripCR = (l: string): string => (l.endsWith('\r') ? l.slice(0, -1) : l);

function lineOf(n: Note, line: number): string {
  return stripCR(n.text.split('\n')[line - 1] ?? '').trim().slice(0, 200);
}

/* ---------- direct links ---------- */

export interface Links {
  out: Ref[];
  in: Ref[];
  broken: { target: string; line: number; context: string }[];
}

export function linksOf(index: VaultIndex, path: string): Links {
  const note = index.notes.get(path);
  const out: Ref[] = [];
  const broken: Links['broken'] = [];
  const seen = new Set<string>();
  if (note) {
    for (const l of note.links) {
      const r = index.resolveLink(note, l);
      if (r.path) {
        if (r.path === path || seen.has(r.path)) continue;
        seen.add(r.path);
        out.push({ path: r.path, title: index.notes.get(r.path)?.title ?? r.path, line: l.line, context: lineOf(note, l.line) });
      } else {
        broken.push({ target: l.target, line: l.line, context: lineOf(note, l.line) });
      }
    }
  }
  const inbound: Ref[] = [];
  const from = new Set<string>();
  for (const b of index.backlinks(path)) {
    if (from.has(b.from)) continue;
    from.add(b.from);
    const n = index.notes.get(b.from);
    if (n) inbound.push({ path: b.from, title: n.title, line: b.line, context: lineOf(n, b.line) });
  }
  return { out, in: inbound, broken };
}

/* ---------- shared tags ---------- */

/** Notes that share tags with this one. A tag few notes have counts for more than one everyone has. */
export function relatedByTags(index: VaultIndex, path: string, limit = 8): Related[] {
  const me = index.notes.get(path);
  if (!me || !me.tags.length) return [];
  const total = index.notes.size;
  const df = new Map<string, number>();
  for (const n of index.notes.values()) for (const t of new Set(n.tags)) df.set(t, (df.get(t) ?? 0) + 1);
  const out: Related[] = [];
  for (const n of index.notes.values()) {
    if (n.path === path) continue;
    const shared = n.tags.filter((t) => me.tags.includes(t) && (df.get(t) ?? 0) < total);
    if (!shared.length) continue;
    const score = shared.reduce((s, t) => s + Math.log(1 + total / (df.get(t) ?? 1)), 0);
    out.push({ path: n.path, title: n.title, score, why: shared.map((t) => `#${t}`) });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ---------- same folder or project ---------- */

export function relatedByPlace(index: VaultIndex, path: string, limit = 8): Related[] {
  const me = index.notes.get(path);
  if (!me) return [];
  const dir = dirname(path);
  const project = typeof me.frontmatter.project === 'string' ? me.frontmatter.project : '';
  const out: Related[] = [];
  for (const n of index.notes.values()) {
    if (n.path === path) continue;
    const why: string[] = [];
    if (dir && dirname(n.path) === dir) why.push(`same folder: ${dir}/`);
    if (project && n.frontmatter.project === project) why.push(`project: ${project}`);
    if (why.length) out.push({ path: n.path, title: n.title, score: why.length, why });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ---------- similar text ---------- */

interface TextModel {
  docs: Map<string, Map<string, number>>;
  norm: Map<string, number>;
}
const models = new WeakMap<VaultIndex, { version: number; model: TextModel }>();

function tokens(s: string): string[] {
  const out: string[] = [];
  for (const m of s.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    let w = m[0];
    if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue;
    if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); // crude plurals
    out.push(w);
  }
  return out;
}

function body(n: Note): string {
  return n.text.replace(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n?/, '');
}

function buildModel(index: VaultIndex): TextModel {
  const total = index.notes.size;
  const raw = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const n of index.notes.values()) {
    const tf = new Map<string, number>();
    const add = (words: string[], weight: number): void => {
      for (const w of words) tf.set(w, (tf.get(w) ?? 0) + weight);
    };
    add(tokens(n.title), 3);
    add(n.tags.flatMap(tokens), 2);
    add(tokens(body(n)), 1);
    raw.set(n.path, tf);
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  }
  const docs = new Map<string, Map<string, number>>();
  const norm = new Map<string, number>();
  for (const [path, tf] of raw) {
    const weights = new Map<string, number>();
    let sum = 0;
    for (const [w, c] of tf) {
      const x = (1 + Math.log(c)) * Math.log(1 + total / (df.get(w) ?? 1));
      weights.set(w, x);
      sum += x * x;
    }
    docs.set(path, weights);
    norm.set(path, Math.sqrt(sum));
  }
  return { docs, norm };
}

function modelFor(index: VaultIndex): TextModel {
  const hit = models.get(index);
  if (hit?.version === index.version) return hit.model;
  const model = buildModel(index);
  models.set(index, { version: index.version, model });
  return model;
}

/** Notes whose text is most similar to this one (TF-IDF cosine), with the words they share. */
export function relatedByText(index: VaultIndex, path: string, limit = 8, minScore = 0.06): Related[] {
  const m = modelFor(index);
  const mine = m.docs.get(path);
  const myNorm = m.norm.get(path) ?? 0;
  if (!mine || !myNorm) return [];
  const out: Related[] = [];
  for (const [other, theirs] of m.docs) {
    if (other === path) continue;
    const theirNorm = m.norm.get(other) ?? 0;
    if (!theirNorm) continue;
    let dot = 0;
    const shared: [string, number][] = [];
    for (const [w, x] of mine) {
      const y = theirs.get(w);
      if (y === undefined) continue;
      dot += x * y;
      shared.push([w, x * y]);
    }
    const score = dot / (myNorm * theirNorm);
    if (score < minScore) continue;
    shared.sort((a, b) => b[1] - a[1]);
    out.push({
      path: other,
      title: index.notes.get(other)?.title ?? other,
      score,
      why: shared.slice(0, 4).map(([w]) => w),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ---------- mentions without links ---------- */

function namesOf(n: Note): string[] {
  const set = new Set<string>();
  for (const s of [n.title, n.name, ...n.aliases]) {
    const t = s.trim().toLowerCase();
    if (t.length >= 4 && !STOP.has(t) && !/^\d[\d-]*$/.test(t)) set.add(t);
  }
  return [...set];
}

/** A line with existing links, code spans and URLs blanked out, so only plain prose is left to search. */
function prose(line: string): string {
  return line
    .replace(/\[\[[^\]]*\]\]/g, (m) => ' '.repeat(m.length))
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length));
}

function findWord(hay: string, name: string): number {
  const low = hay.toLowerCase();
  let from = 0;
  for (;;) {
    const i = low.indexOf(name, from);
    if (i < 0) return -1;
    const before = low[i - 1];
    const after = low[i + name.length];
    if (!(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after))) return i;
    from = i + 1;
  }
}

/** The first plain-text line in a note that contains any of `names`, skipping code blocks and frontmatter. */
function firstMention(n: Note, names: string[]): { line: number; term: string } | undefined {
  const lines = n.text.split('\n');
  let inFence = false;
  let start = 0;
  if (stripCR(lines[0] ?? '') === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (stripCR(l) === '---' || stripCR(l) === '...'));
    if (end > 0) start = end + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const raw = stripCR(lines[i] ?? '');
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const text = prose(raw);
    for (const name of names) {
      const at = findWord(text, name);
      if (at >= 0) return { line: i + 1, term: raw.slice(at, at + name.length) };
    }
  }
  return undefined;
}

/**
 * Notes that mention this note's name without linking to it (inbound), and notes this one
 * mentions without linking to them (outbound). Short and ambiguous names are ignored.
 */
export function unlinkedMentions(index: VaultIndex, path: string, limit = 8): { inbound: Mention[]; outbound: Mention[] } {
  const me = index.notes.get(path);
  if (!me) return { inbound: [], outbound: [] };
  const myNames = namesOf(me);

  const linkedFrom = new Set(index.backlinks(path).map((b) => b.from));
  const inbound: Mention[] = [];
  if (myNames.length) {
    for (const n of index.notes.values()) {
      if (n.path === path || linkedFrom.has(n.path)) continue;
      const hit = firstMention(n, myNames);
      if (hit) inbound.push({ path: n.path, title: n.title, line: hit.line, context: lineOf(n, hit.line), term: hit.term });
    }
  }

  const alreadyLinks = new Set(linksOf(index, path).out.map((o) => o.path));
  const owners = new Map<string, string[]>();
  for (const n of index.notes.values()) {
    if (n.path === path) continue;
    for (const name of namesOf(n)) owners.set(name, [...(owners.get(name) ?? []), n.path]);
  }
  const outbound: Mention[] = [];
  const done = new Set<string>();
  const byPath = new Map<string, string[]>();
  for (const [name, paths] of owners) {
    if (paths.length !== 1) continue; // ambiguous
    const p = paths[0] as string;
    if (alreadyLinks.has(p)) continue;
    byPath.set(p, [...(byPath.get(p) ?? []), name]);
  }
  for (const [p, names] of byPath) {
    if (done.has(p)) continue;
    const hit = firstMention(me, names);
    if (!hit) continue;
    done.add(p);
    outbound.push({ path: p, title: index.notes.get(p)?.title ?? p, line: hit.line, context: lineOf(me, hit.line), term: hit.term });
  }
  const order = (a: Mention, b: Mention) => a.title.localeCompare(b.title);
  return { inbound: inbound.sort(order).slice(0, limit), outbound: outbound.sort(order).slice(0, limit) };
}

/* ---------- hubs ---------- */

/** The most connected notes, a good place to start exploring. */
export function hubs(index: VaultIndex, limit = 8): { path: string; title: string; degree: number }[] {
  const out: { path: string; title: string; degree: number }[] = [];
  for (const n of index.notes.values()) {
    const l = linksOf(index, n.path);
    const degree = new Set([...l.out.map((x) => x.path), ...l.in.map((x) => x.path)]).size;
    if (degree) out.push({ path: n.path, title: n.title, degree });
  }
  return out.sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, limit);
}

/* ---------- graph ---------- */

export interface GraphNode {
  path: string;
  title: string;
  depth: number;
  kind: 'focus' | 'link' | 'related';
}
export interface GraphEdge {
  from: string;
  to: string;
  kind: 'link' | 'related';
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphOptions {
  /** How many link hops to follow: 1 or 2. */
  depth?: 1 | 2;
  /** Most nodes besides the focus note. */
  maxNodes?: number;
  /** How many related-but-not-linked notes to add as dashed neighbours. */
  related?: number;
}

/** The neighbourhood around a note: linked notes (solid) and related notes it is not linked to (dashed). */
export function graphAround(index: VaultIndex, path: string, opts: GraphOptions = {}): Graph {
  const depth = opts.depth ?? 1;
  const maxNodes = opts.maxNodes ?? 30;
  const relatedCount = opts.related ?? 4;
  const focus = index.notes.get(path);
  if (!focus) return { nodes: [], edges: [] };

  const neighbours = (p: string): string[] => {
    const l = linksOf(index, p);
    return [...new Set([...l.out.map((x) => x.path), ...l.in.map((x) => x.path)])];
  };
  const degree = (p: string): number => neighbours(p).length;

  const nodes = new Map<string, GraphNode>([[path, { path, title: focus.title, depth: 0, kind: 'focus' }]]);
  let frontier = [path];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const p of frontier) {
      const ns = neighbours(p)
        .filter((x) => !nodes.has(x))
        .sort((a, b) => degree(b) - degree(a) || (index.notes.get(a)?.title ?? '').localeCompare(index.notes.get(b)?.title ?? ''));
      for (const x of ns) {
        if (nodes.size - 1 >= maxNodes) break;
        if (nodes.has(x)) continue;
        nodes.set(x, { path: x, title: index.notes.get(x)?.title ?? x, depth: d, kind: 'link' });
        next.push(x);
      }
    }
    frontier = next;
  }

  const edges: GraphEdge[] = [];
  for (const a of nodes.keys()) {
    const n = index.notes.get(a);
    if (!n) continue;
    const seen = new Set<string>();
    for (const l of n.links) {
      const r = index.resolveLink(n, l).path;
      if (r && r !== a && nodes.has(r) && !seen.has(r)) {
        seen.add(r);
        edges.push({ from: a, to: r, kind: 'link' });
      }
    }
  }

  if (relatedCount > 0) {
    const scored = new Map<string, number>();
    relatedByText(index, path, relatedCount * 2).forEach((r, i) => scored.set(r.path, (scored.get(r.path) ?? 0) + 1 / (i + 1)));
    relatedByTags(index, path, relatedCount * 2).forEach((r, i) => scored.set(r.path, (scored.get(r.path) ?? 0) + 1 / (i + 1)));
    const picks = [...scored].filter(([p]) => !nodes.has(p)).sort((a, b) => b[1] - a[1]).slice(0, relatedCount);
    for (const [p] of picks) {
      nodes.set(p, { path: p, title: index.notes.get(p)?.title ?? p, depth: 1, kind: 'related' });
      edges.push({ from: path, to: p, kind: 'related' });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export interface Placed extends GraphNode {
  x: number;
  y: number;
}

/**
 * Put the focus note in the middle, first-hop notes on a ring around it, and second-hop notes
 * further out beside the first-hop note they hang from. Deterministic, so the picture does not
 * jump around, and needs no animation.
 */
export function layoutRadial(graph: Graph, r1 = 150, r2 = 270): Placed[] {
  const placed = new Map<string, Placed>();
  const focus = graph.nodes.find((n) => n.depth === 0);
  if (!focus) return [];
  placed.set(focus.path, { ...focus, x: 0, y: 0 });
  const ring1 = graph.nodes.filter((n) => n.depth === 1);
  const step = (2 * Math.PI) / Math.max(1, ring1.length);
  const angle = new Map<string, number>();
  ring1.forEach((n, i) => {
    const a = -Math.PI / 2 + i * step;
    angle.set(n.path, a);
    placed.set(n.path, { ...n, x: Math.cos(a) * r1, y: Math.sin(a) * r1 });
  });
  const children = new Map<string, GraphNode[]>();
  const orphans: GraphNode[] = [];
  for (const n of graph.nodes.filter((x) => x.depth === 2)) {
    const parent = graph.edges.find((e) => (e.to === n.path && angle.has(e.from)) || (e.from === n.path && angle.has(e.to)));
    const p = parent ? (angle.has(parent.from) ? parent.from : parent.to) : undefined;
    if (p) children.set(p, [...(children.get(p) ?? []), n]);
    else orphans.push(n);
  }
  for (const [p, list] of children) {
    const base = angle.get(p) ?? 0;
    const width = step * 0.8;
    list.forEach((n, i) => {
      const a = list.length === 1 ? base : base - width / 2 + (width * i) / (list.length - 1);
      placed.set(n.path, { ...n, x: Math.cos(a) * r2, y: Math.sin(a) * r2 });
    });
  }
  orphans.forEach((n, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, orphans.length);
    placed.set(n.path, { ...n, x: Math.cos(a) * r2, y: Math.sin(a) * r2 });
  });
  return [...placed.values()];
}

/**
 * Notes related to this one by shared tags, similar text or the same place, merged into one
 * ranked list, leaving out notes it already links to or is linked from. This is the "you might
 * have forgotten about these" list.
 */
export function relatedNotLinked(index: VaultIndex, path: string, limit = 10): Related[] {
  const l = linksOf(index, path);
  const linked = new Set([...l.out.map((x) => x.path), ...l.in.map((x) => x.path), path]);
  const merged = new Map<string, Related>();
  const add = (list: Related[], weight: number): void => {
    list.forEach((r, i) => {
      if (linked.has(r.path)) return;
      const cur = merged.get(r.path) ?? { path: r.path, title: r.title, score: 0, why: [] };
      cur.score += weight / (i + 1);
      for (const w of r.why) if (!cur.why.includes(w)) cur.why.push(w);
      merged.set(r.path, cur);
    });
  };
  add(relatedByText(index, path, 20), 1);
  add(relatedByTags(index, path, 20), 0.8);
  add(relatedByPlace(index, path, 20), 0.5);
  return [...merged.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
