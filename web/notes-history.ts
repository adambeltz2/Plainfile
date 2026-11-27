import { lineDiff } from '../src/diff';
import { listVersions, readVersion, snapshot, stampToDate } from '../src/history';
import { notes, setStatus } from './notes-state';
import { state } from './store';
import { esc } from './util';

export function updateHistoryButtons(): void {
  const h = notes.handle;
  const u = document.getElementById('note-undo') as HTMLButtonElement | null;
  const r = document.getElementById('note-redo') as HTMLButtonElement | null;
  if (u) u.disabled = !h?.canUndo();
  if (r) r.disabled = !h?.canRedo();
}

/** Reads the saved versions of the open note into `notes.versions`. The caller redraws the side panel. */
export async function loadVersions(): Promise<void> {
  const { storage } = state;
  if (!storage || !notes.path) return;
  notes.versions = await listVersions(storage, notes.path).catch(() => []);
}

function ago(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function sizeOf(n: number): string {
  return n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`;
}

export function historyHtml(): string {
  const n = notes.versions.length;
  let h = `<h2 style="margin-top:16px">History <button class="btn small" data-act="history-toggle" aria-expanded="${notes.historyOpen}">${n} saved</button></h2>`;
  if (!n)
    return `${h}<p class="muted small" style="margin:0">Earlier versions of this note appear here after you edit and save it, so a mistake can be undone even after you close it.</p>`;
  if (!notes.historyOpen) return h;
  const cur = notes.handle?.getText() ?? '';
  h += '<ul class="plain small">';
  for (const v of notes.versions) {
    const d = stampToDate(v.stamp);
    h +=
      `<li class="vrow"><div><b>${esc(d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</b> <span class="muted">${esc(ago(d))} · ${esc(sizeOf(v.size))}</span></div>` +
      `<span class="acts"><button class="btn small" data-act="ver-compare" data-ver="${esc(v.path)}">Compare</button><button class="btn small" data-act="ver-restore" data-ver="${esc(v.path)}">Restore</button></span>`;
    if (notes.compare?.path === v.path) {
      const c = lineDiff(cur, notes.compare.text);
      h += '<div class="diff plain-box" style="width:100%">';
      if (!c) h += '<div class="muted">Identical to what you have now.</div>';
      else {
        h += `<div class="cap">If you restore this</div><div class="muted">from line ${c.start}</div>`;
        for (const l of c.removed.slice(0, 5)) h += `<div class="del"><span class="sg">−</span><span>${esc(l) || ' '}</span></div>`;
        for (const l of c.added.slice(0, 5)) h += `<div class="add"><span class="sg">+</span><span>${esc(l) || ' '}</span></div>`;
        const more = Math.max(c.removed.length, c.added.length) - 5;
        if (more > 0) h += `<div class="muted">and ${more} more changed line${more === 1 ? '' : 's'}</div>`;
      }
      h += '</div>';
    }
    h += '</li>';
  }
  return `${h}</ul><p class="muted small" style="margin:6px 0 0">Restoring is an edit, so Undo brings back what you had.</p>`;
}

/** Puts an earlier version into the editor as an edit (so Undo works). The caller redraws the side panel. */
export async function restoreVersion(path: string): Promise<void> {
  const h = notes.handle;
  const { storage } = state;
  const v = notes.versions.find((x) => x.path === path);
  if (!h || !storage || !notes.path || !v) return;
  const text = await readVersion(storage, v);
  try {
    await snapshot(storage, notes.path, h.getText());
    notes.lastSnapshotAt = Date.now();
  } catch {
    /* best effort */
  }
  h.applyText(text);
  notes.compare = undefined;
  setStatus('Restored an earlier version. Undo brings back what you had.');
  await loadVersions();
  updateHistoryButtons();
}
