import { finder } from './search';
import { graphAround, hubs, layoutRadial, linksOf, relatedNotLinked, unlinkedMentions, type Mention, type Related } from '../src/related';
import { flush } from './notes';
import { render, state } from './store';
import { esc, highlight } from './util';

export const exploreState = {
  path: undefined as string | undefined,
  depth: 1 as 1 | 2,
  history: [] as string[],
  filter: '',
};

/** Point the explorer at a note, remembering where it was so Back works. */
export async function focus(path: string, remember = true): Promise<void> {
  await flush();
  if (remember && exploreState.path && exploreState.path !== path) exploreState.history.push(exploreState.path);
  exploreState.path = path;
  state.screen = 'explore';
  state.modal = undefined;
  render();
}

/* ---------- pieces ---------- */

function chip(why: string): string {
  if (why.startsWith('#')) return `<span class="chip mono">${esc(why)}</span>`;
  if (why.startsWith('same folder') || why.startsWith('project:')) return `<span class="chip">${esc(why)}</span>`;
  return `<span class="chip quiet" title="A word both notes use a lot">${esc(why)}</span>`;
}

function row(title: string, path: string, extra: string, snippet = '', terms: string[] = []): string {
  return (
    `<li class="xrow"><div class="xmain"><button class="link xtitle" data-focus="${esc(path)}">${esc(title)}</button>` +
    `${extra}${snippet ? `<div class="sn small">${highlight(snippet, terms.map((t) => t.toLowerCase()))}</div>` : ''}` +
    `<div class="mono muted small">${esc(path)}</div></div><button class="btn small" data-open="${esc(path)}">Open</button></li>`
  );
}

function related(list: Related[]): string {
  if (!list.length) return '<p class="muted small">Nothing else shares its tags, folder or words yet.</p>';
  return `<ul class="plain">${list.map((r) => row(r.title, r.path, `<div class="chips">${r.why.slice(0, 6).map(chip).join('')}</div>`)).join('')}</ul>`;
}

function mentions(list: Mention[]): string {
  if (!list.length) return '<p class="muted small">None found.</p>';
  return `<ul class="plain">${list.map((m) => row(m.title, m.path, '', m.context, [m.term])).join('')}</ul>`;
}

function graphSvg(path: string): string {
  const idx = state.index;
  if (!idx) return '';
  const g = graphAround(idx, path, { depth: exploreState.depth, maxNodes: 28, related: 4 });
  const placed = layoutRadial(g);
  if (placed.length <= 1) {
    return '<div class="empty small">This note has no links and nothing similar yet, so there is nothing to draw. Add a <code>[[link]]</code> to or from another note.</div>';
  }
  const by = new Map(placed.map((n) => [n.path, n]));
  const xs = placed.map((n) => n.x);
  const ys = placed.map((n) => n.y);
  const x0 = Math.min(...xs) - 150;
  const x1 = Math.max(...xs) + 150;
  const y0 = Math.min(...ys) - 40;
  const y1 = Math.max(...ys) + 40;
  let s = `<svg class="graph" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="group" aria-label="Notes connected to this one">`;
  for (const e of g.edges) {
    const a = by.get(e.from);
    const b = by.get(e.to);
    if (a && b) s += `<line class="${e.kind === 'related' ? 'ge rel' : 'ge'}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
  }
  for (const n of placed) {
    const label = n.title.length > 26 ? `${n.title.slice(0, 25)}…` : n.title;
    const right = n.x > 20;
    const left = n.x < -20;
    const anchor = right ? 'start' : left ? 'end' : 'middle';
    const dx = right ? 16 : left ? -16 : 0;
    const dy = right || left ? 4 : n.y < 0 ? -18 : 28;
    const cls = n.kind === 'focus' ? 'gn focus' : n.kind === 'related' ? 'gn rel' : 'gn';
    // A larger invisible target around the circle and its label, so a finger can hit it.
    const lw = label.length * 7.5;
    const hx = right ? n.x - 14 : left ? n.x - 16 - lw : n.x - Math.max(14, lw / 2);
    const hw = right || left ? 14 + 16 + lw : 2 * Math.max(14, lw / 2);
    const hy = right || left ? n.y - 16 : n.y < 0 ? n.y - 32 : n.y - 16;
    const hh = right || left ? 32 : 48;
    s +=
      `<g class="${cls}" data-focus="${esc(n.path)}" tabindex="0" role="button" aria-label="Explore ${esc(n.title)}"><title>${esc(n.title)}</title>` +
      `<rect class="hit" x="${hx.toFixed(1)}" y="${hy.toFixed(1)}" width="${hw.toFixed(1)}" height="${hh}" rx="8"/>` +
      `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.kind === 'focus' ? 13 : 9}"/>` +
      `<text x="${(n.x + dx).toFixed(1)}" y="${(n.y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(label)}</text></g>`;
  }
  return `${s}</svg>`;
}

/* ---------- screen ---------- */

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const q = exploreState.filter.trim().toLowerCase();
  const matches = q
    ? [...idx.notes.values()]
        .filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 30)
        .map((n) => ({ path: n.path, title: n.title, degree: 0 }))
    : hubs(idx, 12);

  let h = '<div class="frame two"><aside class="side">';
  h += `<div><label class="sr" for="explore-find">Find a note</label><input id="explore-find" class="inp" type="text" autocomplete="off" placeholder="Find a note" value="${esc(exploreState.filter)}"></div>`;
  h += `<div><h2>${q ? 'Matches' : 'Most connected'}</h2><ul id="explore-list" class="plain">${listItems(matches, q.length > 0)}</ul></div>`;
  h += '</aside><section class="main">' + finder('explore');

  const path = exploreState.path;
  const note = path ? idx.notes.get(path) : undefined;
  if (!path || !note) {
    h += '<h2 class="title">Explore</h2><p class="meta" style="max-width:60ch">Pick a note to see what it links to, what links to it, other notes that share its tags or words, and notes that mention it without linking. Start with a well connected note on the left, or press Explore on any note.</p>';
    if (!idx.notes.size) h += '<div class="empty">There are no notes yet.</div>';
    return `${h}</section></div>`;
  }

  const links = linksOf(idx, path);
  const rel = relatedNotLinked(idx, path, 10);
  const men = unlinkedMentions(idx, path, 6);
  const tasks = idx.tasks().filter((t) => t.path === path && !t.done);

  h += '<div class="ed-head"><div style="min-width:0">';
  h += `<h2 class="title">${esc(note.title)}</h2><div class="mono muted small path">${esc(path)}</div></div><div class="ed-actions">`;
  if (exploreState.history.length) h += '<button class="btn" data-act="explore-back">Back</button>';
  h += `<div class="seg" role="group" aria-label="How far to follow links"><button data-depth="1" aria-pressed="${exploreState.depth === 1}">1 hop</button><button data-depth="2" aria-pressed="${exploreState.depth === 2}">2 hops</button></div>`;
  h += `<button class="btn primary" data-open="${esc(path)}">Open note</button></div></div>`;

  h += `<div class="graph-wrap">${graphSvg(path)}</div>`;
  h += '<p class="legend small muted"><span class="key solid"></span> a link &nbsp; <span class="key dash"></span> related by tags or words, not linked &nbsp; Click a note to explore from it.</p>';

  h += '<div class="xgrid">';
  h += `<div><h3>Links to <span class="muted">${links.out.length}</span></h3>${links.out.length ? `<ul class="plain">${links.out.map((r) => row(r.title, r.path, '', r.context)).join('')}</ul>` : '<p class="muted small">This note does not link to another note.</p>'}</div>`;
  h += `<div><h3>Linked from <span class="muted">${links.in.length}</span></h3>${links.in.length ? `<ul class="plain">${links.in.map((r) => row(r.title, r.path, '', r.context)).join('')}</ul>` : '<p class="muted small">No other note links here.</p>'}</div>`;
  h += `<div class="xwide"><h3>Related, not linked <span class="muted">${rel.length}</span></h3><p class="muted small" style="margin:0 0 4px">Notes with the same tags, a similar subject, or the same folder or project that nothing links yet.</p>${related(rel)}</div>`;
  h += `<div><h3>Mention this note without linking <span class="muted">${men.inbound.length}</span></h3>${mentions(men.inbound)}</div>`;
  h += `<div><h3>Mentioned here without a link <span class="muted">${men.outbound.length}</span></h3>${mentions(men.outbound)}</div>`;
  if (links.broken.length) {
    h += `<div class="xwide"><h3>Links that go nowhere <span class="muted">${links.broken.length}</span></h3><ul class="plain">${links.broken.map((b) => `<li class="xrow"><div class="xmain"><span class="mono small">[[${esc(b.target)}]]</span><div class="sn small">${esc(b.context)}</div><div class="muted small">line ${b.line}</div></div></li>`).join('')}</ul></div>`;
  }
  if (tasks.length) {
    h += `<div class="xwide"><h3>Open tasks in this note <span class="muted">${tasks.length}</span></h3><ul class="plain">${tasks.map((t) => `<li class="xrow"><div class="xmain"><span>${esc(t.title)}</span>${t.due ? ` <span class="chip">${esc(t.due)}</span>` : ''}</div><button class="btn small" data-open="${esc(t.path)}" data-line="${t.line}">Open</button></li>`).join('')}</ul></div>`;
  }
  return `${h}</div></section></div>`;
}

function listItems(list: { path: string; title: string; degree: number }[], searching: boolean): string {
  if (!list.length) return `<li class="muted small">${searching ? 'No notes match.' : 'No links between notes yet.'}</li>`;
  return list
    .map(
      (n) =>
        `<li><button class="item" data-focus="${esc(n.path)}" aria-current="${n.path === exploreState.path}"><span>${esc(n.title)}</span>${n.degree ? `<span class="n">${n.degree}</span>` : ''}</button></li>`,
    )
    .join('');
}

/* ---------- events ---------- */

export async function click(target: HTMLElement): Promise<boolean> {
  const f = target.closest<HTMLElement>('[data-focus]')?.dataset.focus;
  if (f) {
    await focus(f);
    return true;
  }
  const depth = target.closest<HTMLElement>('[data-depth]')?.dataset.depth;
  if (depth === '1' || depth === '2') {
    exploreState.depth = depth === '1' ? 1 : 2;
    render();
    return true;
  }
  if (target.closest('[data-act="explore-back"]')) {
    const prev = exploreState.history.pop();
    if (prev) await focus(prev, false);
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'explore-find') return false;
  exploreState.filter = t.value;
  const idx = state.index;
  const list = document.getElementById('explore-list');
  if (idx && list) {
    const q = t.value.trim().toLowerCase();
    const items = q
      ? [...idx.notes.values()]
          .filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
          .sort((a, b) => a.title.localeCompare(b.title))
          .slice(0, 30)
          .map((n) => ({ path: n.path, title: n.title, degree: 0 }))
      : hubs(idx, 12);
    list.innerHTML = listItems(items, q.length > 0);
    const h = list.previousElementSibling;
    if (h) h.textContent = q ? 'Matches' : 'Most connected';
  }
  return true;
}

export function keydown(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  if ((e.key === 'Enter' || e.key === ' ') && t.classList.contains('gn') && t.dataset.focus) {
    e.preventDefault();
    void focus(t.dataset.focus);
    return true;
  }
  return false;
}
