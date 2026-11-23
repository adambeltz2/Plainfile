import { dirname } from '../src/index';
import { applyMove, cleanFolder, folderList, planMove, type MovePlan } from '../src/move';
import { flush, notes, openNote } from './notes';
import { errorMessage, render, state } from './store';
import { esc } from './util';

/** The Move dialog: pick a folder, see exactly what will change, then move. Undo moves it back. */
export const mv = {
  path: undefined as string | undefined,
  query: '',
  plan: undefined as MovePlan | undefined,
  error: '',
  busy: false,
  /** The snackbar after a move: where it went, so it can be moved back. */
  done: undefined as undefined | { title: string; from: string; to: string },
  timer: 0,
};

export async function openMove(path: string): Promise<void> {
  await flush();
  Object.assign(mv, { path, query: '', plan: undefined, error: '', busy: false });
  render();
  document.getElementById('mv-dest')?.focus();
}

function close(): void {
  mv.path = undefined;
  mv.plan = undefined;
  render();
}

function choose(folder: string): void {
  const { index } = state;
  if (!index || !mv.path) return;
  try {
    mv.plan = planMove(index, mv.path, folder);
    mv.error = '';
  } catch (e) {
    mv.plan = undefined;
    mv.error = errorMessage(e);
  }
  render();
}

function folders(): { folder: string; notes: number }[] {
  const idx = state.index;
  if (!idx || !mv.path) return [];
  const q = mv.query.trim().toLowerCase();
  const here = dirname(mv.path);
  const list = [{ folder: '', notes: [...idx.notes.values()].filter((n) => !dirname(n.path)).length }, ...folderList(idx)];
  return list.filter((f) => f.folder !== here && (!q || f.folder.toLowerCase().includes(q))).slice(0, 10);
}

export function html(): string {
  let h = '';
  const idx = state.index;
  if (mv.path && idx) {
    const note = idx.notes.get(mv.path);
    let body = `<h2>Move “${esc(note?.title ?? mv.path)}”</h2><p class="muted small" style="margin:0 0 8px">Now in <span class="mono">${esc(dirname(mv.path) || '(top level)')}</span>. Type a folder, new or existing.</p>`;
    if (!mv.plan) {
      const typed = mv.query.trim();
      let clean = '';
      try {
        clean = typed ? cleanFolder(typed) : '';
      } catch {
        clean = '';
      }
      const list = folders();
      body +=
        `<div class="fld"><label for="mv-dest">Folder</label><input id="mv-dest" class="inp" type="text" autocomplete="off" spellcheck="false" placeholder="projects/website-relaunch" value="${esc(mv.query)}"></div>` +
        `<ul class="plain mvlist">${list.map((f) => `<li><button class="menu-item" data-mv-pick="${esc(f.folder)}"><b>${esc(f.folder || '(top level)')}</b><span>${f.notes} note${f.notes === 1 ? '' : 's'}</span></button></li>`).join('')}` +
        (clean && !list.some((f) => f.folder === clean) && clean !== dirname(mv.path)
          ? `<li><button class="menu-item" data-mv-pick="${esc(clean)}"><b>+ New folder “${esc(clean)}”</b><span>Created when you move</span></button></li>`
          : '') +
        '</ul>';
    } else {
      const p = mv.plan;
      const edits = [...p.outbound, ...p.inbound];
      body +=
        `<div class="grp" style="margin-top:0">Will become</div><div class="mono small" style="overflow-wrap:anywhere">${esc(p.to)}</div>` +
        `<div class="grp">${edits.length ? `${p.inbound.length} link line${p.inbound.length === 1 ? '' : 's'} elsewhere and ${p.outbound.length} inside the note are updated` : 'No links need to change'}</div>` +
        (edits.length
          ? `<ul class="plain small mvedits">${edits
              .slice(0, 8)
              .map(
                (e) =>
                  `<li><div class="mono muted">${esc(e.path === p.from ? p.to : e.path)}:${e.line}</div><div class="diff"><div class="del"><span class="sg">−</span><span>${esc(e.before)}</span></div><div class="add"><span class="sg">+</span><span>${esc(e.after)}</span></div></div></li>`,
              )
              .join('')}${edits.length > 8 ? `<li class="muted">and ${edits.length - 8} more</li>` : ''}</ul>`
          : '<p class="muted small" style="margin:0">Links by name keep working wherever the note goes. Tasks inside it move with it.</p>') +
        p.warnings.map((w) => `<div class="notice small">${esc(w)}</div>`).join('') +
        `<div class="row-gap"><button class="btn primary" data-act="mv-go"${mv.busy ? ' disabled' : ''}>${mv.busy ? 'Moving…' : 'Move'}</button><button class="btn" data-act="mv-back">Change folder</button></div>`;
    }
    if (mv.error) body += `<div class="notice err small">${esc(mv.error)}</div>`;
    h += `<div class="modal-back" data-mv-backdrop><div class="modal" role="dialog" aria-modal="true" aria-label="Move note">${body}<button class="modal-x btn small" data-act="mv-close" aria-label="Close">Close</button></div></div>`;
  }
  if (mv.done) {
    h += `<div class="snack" role="status"><span>Moved “${esc(mv.done.title)}” to <span class="mono">${esc(mv.done.to)}</span></span><button class="btn small" data-act="mv-undo">Undo</button><button class="btn small" data-act="mv-dismiss" aria-label="Dismiss">×</button></div>`;
  }
  return h;
}

async function go(from: string, folder: string, title: string, undo: boolean): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  mv.busy = true;
  mv.error = '';
  render();
  try {
    const plan = planMove(index, from, folder);
    const r = await applyMove(storage, index, plan, new Set(plan.inbound.map((e) => e.id)));
    window.clearTimeout(mv.timer);
    mv.path = undefined;
    mv.plan = undefined;
    mv.busy = false;
    mv.done = undo ? undefined : { title, from: r.from, to: r.to };
    if (mv.done) mv.timer = window.setTimeout(() => ((mv.done = undefined), render()), 15000);
    if (notes.path === from || notes.path === undefined || undo) await openNote(r.to);
    else render();
  } catch (e) {
    mv.busy = false;
    mv.error = `Could not move it. ${errorMessage(e)}`;
    render();
  }
}

export async function click(target: HTMLElement): Promise<boolean> {
  const pick = target.closest<HTMLElement>('[data-mv-pick]');
  if (pick && mv.path) {
    choose(pick.dataset.mvPick ?? '');
    return true;
  }
  if (target.matches('[data-mv-backdrop]')) {
    close();
    return true;
  }
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  switch (act) {
    case 'mv-close':
      close();
      return true;
    case 'mv-back':
      mv.plan = undefined;
      mv.error = '';
      render();
      document.getElementById('mv-dest')?.focus();
      return true;
    case 'mv-go':
      if (mv.path && mv.plan && !mv.busy) {
        const from = mv.path;
        const title = state.index?.notes.get(from)?.title ?? from;
        await go(from, dirname(mv.plan.to), title, false);
      }
      return true;
    case 'mv-undo':
      if (mv.done) {
        const { from, to, title } = mv.done;
        await go(to, dirname(from), title, true);
      }
      return true;
    case 'mv-dismiss':
      mv.done = undefined;
      render();
      return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'mv-dest') return false;
  mv.query = t.value;
  render(); // the page keeps the cursor in the box
  return true;
}

/** Enter in the folder box picks the top match, or the typed (new) folder. */
export function keydown(e: KeyboardEvent): boolean {
  if (!mv.path) return false;
  if (e.key === 'Escape') {
    close();
    return true;
  }
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'mv-dest') {
    e.preventDefault();
    const typed = mv.query.trim();
    let clean = '';
    try {
      clean = cleanFolder(typed);
    } catch (err) {
      mv.error = errorMessage(err);
      render();
      return true;
    }
    const exact = folders().find((f) => f.folder === clean);
    choose(exact ? exact.folder : typed ? clean : (folders()[0]?.folder ?? ''));
    return true;
  }
  return false;
}
