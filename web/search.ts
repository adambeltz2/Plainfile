import { fmtDate, localDateOf } from '../src/dates';
import { parseQuery, recentNotes, search, type SearchHit } from '../src/query';
import { openNote } from './notes';
import { state, today } from './store';
import { esc, highlight } from './util';

export const searchState = { q: '' };

/** Quick ways in: what changed lately comes first. */
const QUICK: [string, string][] = [
  ['Modified today', 'modified:today'],
  ['Yesterday', 'modified:yesterday'],
  ['This week', 'modified:week'],
  ['Created today', 'created:today'],
];
const EXAMPLES = ['is:open', 'is:task due:<2026-11-24', 'type:meeting', 'folder:projects', '#launch'];

/** "edited 14:05" for today, otherwise "edited 18 Nov". */
function editedLabel(mtime: number): string {
  const day = localDateOf(mtime);
  if (day === today()) return `edited ${new Date(mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `edited ${fmtDate(day)}`;
}

function hitHtml(h: SearchHit, words: string[]): string {
  const chips = h.tags.map((t) => `<span class="chip mono">#${esc(t)}</span>`).join('');
  if (h.kind === 'task') {
    const late = !!h.due && h.due < today() && !h.done;
    return (
      `<li class="res"><button class="res-btn" data-open="${esc(h.path)}" data-line="${h.line ?? 1}">` +
      `<span class="rt"><span class="mini-cb${h.done ? ' on' : ''}" aria-hidden="true">${h.done ? '✓' : ''}</span> ${highlight(h.title, words)}</span>` +
      `<span class="chips">${h.due ? `<span class="chip${late ? ' late' : ''}">${late ? 'Overdue · ' : ''}${esc(fmtDate(h.due))}</span>` : ''}${chips}` +
      `<span class="chip src mono">${highlight(h.path, words)}:${h.line}</span></span></button></li>`
    );
  }
  return (
    `<li class="res"><button class="res-btn" data-open="${esc(h.path)}">` +
    `<span class="rt">${highlight(h.title, words)}</span>` +
    (h.snippet ? `<span class="sn">${highlight(h.snippet, words)}</span>` : '') +
    `<span class="chips">${h.mtime ? `<span class="chip quiet">${esc(editedLabel(h.mtime))}</span>` : ''}<span class="chip src mono">${highlight(h.path, words)}</span>${chips}</span></button></li>`
  );
}

function results(): { list: string; count: string; facets: string } {
  const idx = state.index;
  if (!idx) return { list: '', count: '', facets: '' };
  const q = searchState.q.trim();
  const hits = q ? search(idx, q, today()) : recentNotes(idx);
  const words = parseQuery(q, today()).words;
  const count = q ? `${hits.length} result${hits.length === 1 ? '' : 's'} in ${idx.notes.size} notes` : '';
  const list = !q
    ? `<p class="muted">Type to search titles, text, paths and tags. Narrow with operators like <code>tag:launch</code>, <code>folder:projects</code>, <code>type:meeting</code>, <code>is:open</code>, <code>due:&lt;2026-11-30</code>, <code>modified:today</code> or <code>@dana</code>.</p><h2 class="grp">Recently modified</h2><ul class="plain">${hits.map((h) => hitHtml(h, words)).join('')}</ul>`
    : hits.length
      ? `<ul class="plain">${hits.map((h) => hitHtml(h, words)).join('')}</ul>`
      : '<p class="muted">No matches. Remove an operator or check the spelling.</p>';

  const tc = new Map<string, number>();
  const fc = new Map<string, number>();
  for (const h of hits) {
    for (const t of h.tags) tc.set(t, (tc.get(t) ?? 0) + 1);
    const f = h.path.split('/')[0] ?? '';
    if (h.path.includes('/')) fc.set(f, (fc.get(f) ?? 0) + 1);
  }
  const facet = (title: string, m: Map<string, number>, prefix: string): string =>
    m.size
      ? `<div><h2>${title}</h2><ul>${[...m]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 10)
          .map(([k, n]) => `<li><button class="item mono" data-add="${esc(prefix + k)}">${esc(k)} <span class="n">${n}</span></button></li>`)
          .join('')}</ul></div>`
      : '';
  return { list, count, facets: facet('Folder', fc, 'folder:') + facet('Tag', tc, 'tag:') };
}

/** Search and Explore are two ways to find things, so they share one place in the navigation and this switch. */
export function finder(active: 'search' | 'explore'): string {
  return `<div class="seg finder" role="group" aria-label="Find or explore"><button data-nav="search" aria-pressed="${active === 'search'}">Search</button><button data-nav="explore" aria-pressed="${active === 'explore'}">Explore connections</button></div>`;
}

/** The last few searches that led somewhere, kept in this browser only. */
const RECENT_KEY = 'plainfile.recentSearches';
export function recentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}
function rememberSearch(q: string): void {
  const query = q.trim();
  if (!query) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([query, ...recentSearches().filter((x) => x !== query)].slice(0, 8)));
  } catch {
    /* a private window just forgets */
  }
}
/** A result was opened: keep the search that found it. */
export function rememberCurrent(): void {
  rememberSearch(searchState.q);
}

function recentRow(): string {
  const r = recentSearches();
  return r.length
    ? `<div class="examples" id="search-recent"><span class="muted small">Recent</span>${r.map((e) => `<button class="chip mono ex" data-q="${esc(e)}">${esc(e)}</button>`).join('')}<button class="link small" data-recent-clear>Clear</button></div>`
    : '';
}

export function html(): string {
  const r = results();
  return (
    '<div class="frame two"><aside class="side" id="search-facets">' +
    (r.facets || '<p class="muted small" style="margin:0">Folders and tags from your results appear here to narrow them.</p>') +
    '</aside><section class="main">' +
    finder('search') +
    '<h2 class="title">Search</h2>' +
    `<div class="sbox"><input id="search-q" type="text" autocomplete="off" spellcheck="false" aria-label="Search every note and task" placeholder="Search notes and tasks" value="${esc(searchState.q)}"></div>` +
    `<div class="examples" id="search-quick" role="group" aria-label="Find by date"><span class="muted small">When</span>${QUICK.map(([l, v]) => `<button class="chip ex" data-q="${esc(v)}" aria-pressed="${searchState.q.trim() === v}">${esc(l)}</button>`).join('')}</div>` +
    recentRow() +
    `<div class="examples"><span class="muted small">Try</span>${EXAMPLES.map((e) => `<button class="chip mono ex" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>` +
    `<p class="meta" id="search-count">${esc(r.count)}</p><div id="search-results">${r.list}</div></section></div>`
  );
}

function update(): void {
  const r = results();
  const set = (id: string, v: string): void => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = v;
  };
  set('search-results', r.list);
  set('search-facets', r.facets || '<p class="muted small" style="margin:0">Folders and tags from your results appear here to narrow them.</p>');
  document.querySelectorAll<HTMLElement>('#search-quick [data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === searchState.q.trim())));
  const c = document.getElementById('search-count');
  if (c) c.textContent = r.count;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'search-q') return false;
  searchState.q = t.value;
  update();
  return true;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const ex = target.closest<HTMLElement>('[data-q]')?.dataset.q;
  const add = target.closest<HTMLElement>('[data-add]')?.dataset.add;
  if (ex !== undefined || add !== undefined) {
    const el = document.getElementById('search-q') as HTMLInputElement | null;
    searchState.q = ex ?? `${searchState.q.trim()} ${add}`.trim();
    if (el) {
      el.value = searchState.q;
      el.focus();
    }
    update();
    return true;
  }
  if (target.closest('[data-recent-clear]')) {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* nothing to forget */
    }
    document.getElementById('search-recent')?.remove();
    return true;
  }
  const open = target.closest<HTMLElement>('[data-open]');
  if (open?.dataset.open) {
    await openNote(open.dataset.open, { line: open.dataset.line ? Number(open.dataset.line) : undefined });
    return true;
  }
  return false;
}
