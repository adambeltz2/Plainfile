import { frontmatterText } from '../src/frontmatter';
import { duplicateNote } from '../src/move';
import * as explore from './explore';
import { copyFormatted, downloadDocx, downloadHtml, downloadMarkdown, keepMarkers, printDocument, setKeepMarkers } from './export';
import { MOD } from './keys';
import * as move from './move';
import { applyProperty, notes, openNote, click as notesClick } from './notes';
import * as rename from './rename';
import { errorMessage, render, state } from './store';
import { esc } from './util';

/**
 * The actions on a note, in one place: the ⋯ menu in the note's header, the menu on a right-click or
 * long-press in the note list, and the command palette all run them from here.
 */
export type NoteAction =
  | 'copyrich'
  | 'docx'
  | 'image'
  | 'markdown'
  | 'html'
  | 'print'
  | 'markers'
  | 'open'
  | 'xray'
  | 'explore'
  | 'history'
  | 'move'
  | 'rename'
  | 'duplicate'
  | 'pin'
  | 'copylink'
  | 'frontmatter'
  | 'delete';

export const KEYS: Partial<Record<NoteAction, string>> = {
  xray: `${MOD}Shift+X`,
  explore: `${MOD}Shift+E`,
  move: `${MOD}Shift+M`,
  rename: 'F2',
};

export const menu = { open: undefined as undefined | { path: string; inNote: boolean; x: number; y: number } };

export function isPinned(path: string): boolean {
  const v = state.index?.notes.get(path)?.frontmatter.pinned;
  return v === true || String(v).toLowerCase() === 'true';
}

function hasFrontmatter(path: string): boolean {
  const text = path === notes.path ? notes.handle?.getText() : undefined;
  if (text !== undefined) return frontmatterText(text) !== null;
  const n = state.index?.notes.get(path);
  return !!n && Object.keys(n.frontmatter).length > 0;
}

interface Item {
  action: NoteAction;
  label: string;
}

export function itemsFor(path: string, inNote: boolean): (Item | '-')[] {
  const items: (Item | '-')[] = [];
  if (inNote)
    items.push(
      { action: 'xray', label: 'X-ray (show raw markdown)' },
      { action: 'explore', label: 'Explore related' },
      { action: 'history', label: 'History' },
      '-',
    );
  else items.push({ action: 'open', label: 'Open' }, '-');
  items.push(
    { action: 'move', label: 'Move to…' },
    { action: 'rename', label: 'Rename' },
    { action: 'duplicate', label: 'Duplicate' },
    { action: 'pin', label: isPinned(path) ? 'Unpin' : 'Pin to top' },
    { action: 'copylink', label: 'Copy link' },
    '-',
    { action: 'copyrich', label: 'Copy as formatted text' },
    { action: 'docx', label: 'Download as Word (.docx)' },
    { action: 'markdown', label: 'Download as markdown (.md)' },
    { action: 'html', label: 'Download as a web page (.html)' },
    { action: 'print', label: 'Print or save as PDF' },
    { action: 'markers', label: keepMarkers() ? 'Copies keep tags (switch to clean)' : 'Copies are clean (switch to keep tags)' },
    '-',
  );
  if (inNote) items.push({ action: 'image', label: 'Insert image…' });
  if (inNote && !hasFrontmatter(path)) items.push({ action: 'frontmatter', label: 'Add default frontmatter' });
  items.push({ action: 'delete', label: 'Delete…' });
  return items;
}

export function html(): string {
  const m = menu.open;
  if (!m) return '';
  const list = itemsFor(m.path, m.inNote);
  const rows = list
    .map((i) =>
      i === '-'
        ? '<hr>'
        : `<button role="menuitem" data-menu-act="${i.action}"><span>${esc(i.label)}</span><span class="k">${esc(KEYS[i.action] ?? '')}</span></button>`,
    )
    .join('');
  const left = Math.max(8, Math.min(m.x, window.innerWidth - 262));
  const top = Math.max(8, Math.min(m.y, window.innerHeight - (list.reduce((h, i) => h + (i === '-' ? 7 : 33), 0) + 44)));
  return `<div class="menu-back" data-menu-back><div class="ctx" role="menu" aria-label="Note actions" style="left:${left}px;top:${top}px"><div class="ctx-t">${esc(state.index?.notes.get(m.path)?.title ?? m.path)}</div>${rows}</div></div>`;
}

export function openMenu(path: string, inNote: boolean, x: number, y: number): void {
  menu.open = { path, inNote, x, y };
  render();
  fitOnScreen();
  document.querySelector<HTMLElement>('.ctx [role="menuitem"]')?.focus();
}

/** Once drawn, nudge the menu up so its last item is on screen. The height depends on the list, so it is measured, not guessed. */
function fitOnScreen(): void {
  const el = document.querySelector<HTMLElement>('.ctx');
  if (!el) return;
  const over = el.getBoundingClientRect().bottom - (window.innerHeight - 8);
  if (over > 0) el.style.top = `${Math.max(8, el.getBoundingClientRect().top - over)}px`;
}

export function closeMenu(): void {
  if (!menu.open) return;
  menu.open = undefined;
  render();
}

/** Run an action on a note, opening it first when it is not the one in the editor. */
export async function run(action: NoteAction, path: string): Promise<void> {
  menu.open = undefined;
  const fake = (act: string, data: Record<string, string> = {}): HTMLElement => {
    const b = document.createElement('button');
    b.dataset.act = act;
    for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
    return b;
  };
  const noOpen = new Set<NoteAction>(['copylink', 'open', 'copyrich', 'docx', 'markdown', 'html', 'print', 'markers']);
  if (!noOpen.has(action) && notes.path !== path) await openNote(path);
  switch (action) {
    case 'open':
      return openNote(path);
    case 'xray':
      await notesClick(fake('xray'));
      return render();
    case 'history':
      await notesClick(fake('history-toggle'));
      return render();
    case 'explore':
      return explore.focus(path);
    case 'move':
      return move.openMove(path);
    case 'rename':
      return void (await rename.openRename(path));
    case 'duplicate': {
      const { storage, index } = state;
      if (!storage || !index) return;
      try {
        await openNote(await duplicateNote(storage, index, path));
      } catch (e) {
        state.error = `Could not duplicate. ${errorMessage(e)}`;
        render();
      }
      return;
    }
    case 'pin':
      applyProperty('pinned', isPinned(path) ? null : 'true');
      return render();
    case 'copyrich':
    case 'docx':
    case 'markdown':
    case 'html':
    case 'print': {
      const note = state.index?.notes.get(path);
      if (!note) return;
      const open = notes.path === path && notes.handle;
      const selection = open ? (notes.handle?.getSelection() ?? '') : '';
      const md = selection.trim() ? selection : open ? (notes.handle?.getText() ?? '') : ((await state.storage?.read(path)) ?? '');
      const title = note.title;
      notes.status =
        action === 'copyrich'
          ? await copyFormatted(md, path)
          : action === 'docx'
            ? await downloadDocx(md, title, path)
            : action === 'markdown'
              ? downloadMarkdown(md, title)
              : action === 'html'
                ? await downloadHtml(md, title, path)
                : await printDocument(md, title, path);
      return render();
    }
    case 'markers':
      setKeepMarkers(!keepMarkers());
      notes.status = keepMarkers()
        ? 'Copies and Word files now keep #tags, @people and due: markers.'
        : 'Copies and Word files now leave out #tags, @people and due: markers.';
      return render();
    case 'copylink': {
      const n = state.index?.notes.get(path);
      if (!n) return;
      const clash = [...(state.index?.notes.values() ?? [])].some((x) => x.path !== path && x.name.toLowerCase() === n.name.toLowerCase());
      const link = `[[${clash ? path.replace(/\.md$/i, '') : n.name}]]`;
      try {
        await navigator.clipboard.writeText(link);
        notes.status = `Copied ${link}`;
      } catch {
        notes.status = `Link: ${link}`;
      }
      return render();
    }
    case 'image': {
      // A file picker, for phones and anywhere pasting an image is awkward.
      const pick = document.createElement('input');
      pick.type = 'file';
      pick.accept = 'image/*';
      pick.multiple = true;
      pick.addEventListener('change', () => void notes.handle?.insertImageFiles([...(pick.files ?? [])]));
      pick.click();
      return;
    }
    case 'frontmatter':
      await notesClick(fake('add-frontmatter'));
      return render();
    case 'delete':
      await notesClick(fake('delete-note'));
      return render();
  }
}

export async function click(target: HTMLElement): Promise<boolean> {
  const m = menu.open;
  const act = target.closest<HTMLElement>('[data-menu-act]')?.dataset.menuAct as NoteAction | undefined;
  if (m && act) {
    await run(act, m.path);
    return true;
  }
  if (m && target.matches('[data-menu-back]')) {
    closeMenu();
    return true;
  }
  const more = target.closest<HTMLElement>('[data-act="note-menu"]');
  if (more && notes.path) {
    const r = more.getBoundingClientRect();
    openMenu(notes.path, true, r.right - 250, r.bottom + 4);
    return true;
  }
  return false;
}

/** Right-click, or a long press on a phone, on a note in the list. Returns true if it opened a menu. */
export function contextMenu(e: MouseEvent): boolean {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.note-item, .note-quick');
  const path = item?.dataset.note;
  if (!path || !state.index) return false;
  e.preventDefault();
  openMenu(path, false, e.clientX, e.clientY);
  return true;
}

/** Keys: the arrows move through an open menu, Esc closes it. Returns true if the key was used. */
export function keydown(e: KeyboardEvent): boolean {
  if (!menu.open) return false;
  if (e.key === 'Escape') {
    closeMenu();
    return true;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = [...document.querySelectorAll<HTMLElement>('.ctx [role="menuitem"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    e.preventDefault();
    return true;
  }
  return false;
}
