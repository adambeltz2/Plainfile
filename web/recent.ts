import { fmtDate } from '../src/dates';
import { folderOf, recentNotes, whenParts } from '../src/recent';
import { render, state, today } from './store';
import { esc } from './util';

/** Recent: every note by when it last changed, newest first. A filter box narrows it and Show more extends it. */
export const recent = { query: '', limit: 60 };

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = recentNotes(idx, recent.query);
  const shown = all.slice(0, recent.limit);
  let h = '<div class="head"><h2 class="title">Recent</h2></div>';
  h += `<div class="ed-bar"><input type="search" id="recent-q" placeholder="Filter by title or folder" aria-label="Filter recent notes" value="${esc(recent.query)}"><span class="muted small">${all.length} note${all.length === 1 ? '' : 's'}, newest change first</span></div>`;
  if (!shown.length) return `${h}<p class="muted">${recent.query ? 'No note matches that.' : 'No notes yet. Try a quick note from Home.'}</p>`;
  h += '<div class="table-wrap"><table class="portfolio recent-table"><thead><tr><th>Note</th><th>Folder</th><th>Project</th><th>Type</th><th class="r">Modified</th></tr></thead><tbody>';
  const t = today();
  for (const it of shown) {
    const w = whenParts(it, t, fmtDate);
    h += `<tr class="recent-row" data-open="${esc(it.path)}"><td><button class="link" data-open="${esc(it.path)}">${esc(it.title)}</button></td>` +
      `<td class="muted mono small">${esc(folderOf(it.path) || '·')}</td>` +
      `<td>${it.project ? `<span class="chip quiet">${esc(it.project)}</span>` : '<span class="muted">·</span>'}</td>` +
      `<td>${it.task ? '<span class="chip quiet">task</span>' : '<span class="muted small">note</span>'}</td>` +
      `<td class="r small"><b>${esc(w.day)}</b> <span class="muted mono">${esc(w.time)}</span></td></tr>`;
  }
  h += '</tbody></table></div>';
  if (all.length > shown.length) h += `<button class="btn" data-recent-more>Show more (${all.length - shown.length} left)</button>`;
  return h;
}

export function click(target: HTMLElement): boolean {
  if (target.closest('[data-recent-more]')) {
    recent.limit += 100;
    render();
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const el = e.target as HTMLInputElement;
  if (el.id !== 'recent-q') return false;
  recent.query = el.value;
  recent.limit = 60;
  const pos = el.selectionStart ?? el.value.length;
  render();
  const next = document.getElementById('recent-q') as HTMLInputElement | null;
  next?.focus();
  next?.setSelectionRange(pos, pos);
  return true;
}
