import { deleteNote, listTrash, planDelete, restoreNote, type DeletePlan } from '../src/delete';
import { ConflictError } from '../src/storage';
import { notes } from './notes-state';
import { errorMessage, render, state } from './store';
import { esc } from './util';

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

export function deleteConfirmHtml(): string {
  const idx = state.index;
  const path = notes.path;
  if (!idx || !path) return '';
  let plan: DeletePlan;
  try {
    plan = planDelete(idx, path, stamp());
  } catch {
    return '';
  }
  const from = [...new Set(plan.linkedFrom.map((l) => l.path))];
  let h = `<div class="notice err" role="alertdialog" aria-label="Delete note"><b>Delete “${esc(plan.title)}”?</b><ul class="small" style="margin:6px 0 0;padding-left:18px">`;
  h += from.length
    ? `<li>${from.length} note${from.length === 1 ? ' links' : 's link'} here. Those links will point nowhere until you fix them in Vault health: <span class="mono">${from.slice(0, 3).map(esc).join(', ')}${from.length > 3 ? ` and ${from.length - 3} more` : ''}</span></li>`
    : '<li>No other note links here.</li>';
  if (plan.openTasks) h += `<li>${plan.openTasks} open task${plan.openTasks === 1 ? '' : 's'} in it will leave Today.</li>`;
  if (plan.isProjectIndex) h += '<li>This is a project note, so the project card goes away. The other files in the folder stay.</li>';
  h += '</ul>';
  if (notes.confirmDelete === 'permanent') {
    h +=
      '<p class="small" style="margin:8px 0 0"><b>This removes the file from your folder for good. There is no undo.</b></p>' +
      `<div class="row-gap"><button class="btn primary" data-act="delete-perm-yes"${notes.deleting ? ' disabled' : ''}>${notes.deleting ? 'Deleting…' : 'Yes, delete permanently'}</button><button class="btn" data-act="delete-cancel"${notes.deleting ? ' disabled' : ''}>Cancel</button></div>`;
  } else {
    h +=
      `<div class="row-gap"><button class="btn primary" data-act="delete-trash"${notes.deleting ? ' disabled' : ''}>${notes.deleting ? 'Moving to trash…' : 'Move to trash'}</button><button class="btn" data-act="delete-perm"${notes.deleting ? ' disabled' : ''}>Delete permanently…</button><button class="btn" data-act="delete-cancel"${notes.deleting ? ' disabled' : ''}>Cancel</button></div>` +
      '<p class="muted small" style="margin:6px 0 0">Moving to trash keeps a copy in <span class="mono">.plainfile/trash/</span> that you can restore.</p>';
  }
  return `${h}</div>`;
}

export function trashHtml(): string {
  const items = notes.trash;
  if (!items.length) return '';
  let h = `<div class="trash"><button class="link small" data-act="trash-toggle" aria-expanded="${notes.trashOpen}">Trash (${items.length})</button>`;
  if (notes.trashOpen) {
    h += `<ul class="plain small">${items
      .map(
        (i) =>
          `<li class="trow"><span class="mono" title="${esc(i.originalPath)}">${esc(i.originalPath)}</span><span class="acts">` +
          `<button class="btn small" data-act="trash-restore" data-trash="${esc(i.trashPath)}">Restore</button>` +
          `<button class="btn small" data-act="trash-purge" data-trash="${esc(i.trashPath)}">${notes.purgeArm === i.trashPath ? 'Really delete?' : 'Delete forever'}</button></span></li>`,
      )
      .join('')}</ul>`;
  }
  return `${h}</div>`;
}

export async function refreshTrash(): Promise<void> {
  const s = state.storage;
  notes.trash = s ? await listTrash(s).catch(() => []) : [];
  const el = document.getElementById('note-trash');
  if (el) el.innerHTML = trashHtml();
}

/** Moves the open note to the trash, or deletes it for good. `showBusy` redraws the banner so the button says what is happening. */
export async function doDelete(trash: boolean, showBusy: () => void): Promise<void> {
  const { storage, index } = state;
  const path = notes.path;
  if (!storage || !index || !path || notes.deleting) return;
  window.clearTimeout(notes.timer);
  notes.deleting = true;
  showBusy();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let "Moving to trash…" show before the slow part
  try {
    const plan = planDelete(index, path, stamp());
    const r = await deleteNote(storage, index, plan, { trash });
    notes.handle?.destroy();
    notes.handle = undefined;
    notes.path = undefined;
    notes.confirmDelete = undefined;
    notes.lastDeleted = { title: plan.title, path, trashPath: r.trashedTo };
    if (state.selected && !index.getTask(state.selected)) {
      state.selected = undefined;
      state.context = undefined;
    }
    await refreshTrash();
  } catch (e) {
    notes.confirmDelete = undefined;
    state.error =
      e instanceof ConflictError
        ? 'That note changed on disk, so it was not deleted. Reload it and try again.'
        : `Could not delete ${path}. ${errorMessage(e)}`;
  } finally {
    notes.deleting = false;
  }
  render();
}

/** Brings a note back from the trash and opens it. */
export async function restoreFromTrash(trashPath: string, open: (path: string) => Promise<void>): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  const item = (await listTrash(storage)).find((i) => i.trashPath === trashPath);
  if (!item) return;
  try {
    const restored = await restoreNote(storage, index, item);
    notes.lastDeleted = undefined;
    await refreshTrash();
    await open(restored);
  } catch (e) {
    state.error = `Could not restore ${item.originalPath}. ${errorMessage(e)}`;
    render();
  }
}
