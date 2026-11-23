import { newNoteForLink, type LinkAt } from '../src/linknote';
import { deleteNote, listTrash, planDelete, purgeTrashItem, restoreNote, type DeletePlan, type TrashItem } from '../src/delete';
import { lineDiff, type LineChange } from '../src/diff';
import { listVersions, readVersion, shouldSnapshot, snapshot, stampToDate, type Version } from '../src/history';
import { bestLinkTarget } from '../src/fixes';
import {
  addFrontmatterListItem,
  frontmatterText,
  addDefaultFrontmatter,
  removeFrontmatterListItem,
  setFrontmatterField,
  setProjects,
  titleFrontmatter,
} from '../src/frontmatter';
import { listOf } from '../src/fields';
import { localDateOf } from '../src/dates';
import { saveImage, mimeFor } from '../src/attachments';
import { dirname, joinPath } from '../src/index';
import { parseNote, type Note } from '../src/parse';
import { isProjectNote, listProjects, noteProjects, projectContents } from '../src/projects';
import { findProject } from '../src/quickline';
import { addDays } from '../src/query';
import { linkTargets, suggestionsFor, type LinkTarget } from '../src/vocabulary';
import { ConflictError } from '../src/storage';
import { readingStats } from '../src/render';
import type { EditorHandle } from './editor';
import { MOD } from './keys';
import { errorMessage, onVaultChange, projectRef, render, state, today } from './store';
import { esc } from './util';

interface At {
  line?: number;
  offset?: number;
  /** A word to select once the note is open, such as the one a search matched. */
  find?: string;
}

function loadPanes(): { list: boolean; details: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem('plainfile.panes') ?? 'null') as { list?: boolean; details?: boolean } | null;
    return { list: v?.list !== false, details: v?.details !== false };
  } catch {
    return { list: true, details: true };
  }
}

export const notes = {
  path: undefined as string | undefined,
  mtime: 0,
  saved: '',
  handle: undefined as EditorHandle | undefined,
  timer: 0,
  sideTimer: 0,
  saving: false,
  conflict: false,
  missing: false,
  status: '',
  diff: undefined as LineChange | undefined,
  xray: false,
  yaml: false,
  filter: '',
  pending: {} as At,
  /** The delete confirmation that is showing: move to trash, or the second step for permanent. */
  /** Which side panels show on a wide screen. Remembered in this browser. */
  panes: loadPanes(),
  confirmDelete: undefined as undefined | 'trash' | 'permanent',
  /** A clicked link to a note that does not exist yet, waiting for Create or Cancel. */
  missingLink: undefined as undefined | { path: string; title: string; content: string },
  /** A delete is in progress, so the buttons say so and cannot be pressed twice. */
  deleting: false,
  lastDeleted: undefined as undefined | { title: string; path: string; trashPath?: string },
  trash: [] as TrashItem[],
  trashOpen: false,
  purgeArm: undefined as string | undefined,
  versions: [] as Version[],
  historyOpen: false,
  lastSnapshotAt: undefined as number | undefined,
  compare: undefined as undefined | { path: string; text: string },
  /** Focus mode: the editor alone, centred, with everything else hidden. */
  focus: false,
  wantFocus: false,
  /** How many notes the list shows. A huge folder would otherwise mean thousands of buttons. */
  listLimit: 300,
};

const STATUSES = ['todo', 'doing', 'waiting', 'done'];

onVaultChange(() => {
  window.clearTimeout(notes.timer);
  notes.handle?.destroy();
  notes.handle = undefined;
  notes.path = undefined;
  notes.diff = undefined;
  notes.conflict = false;
  notes.missing = false;
});

/* ---------- saving ---------- */

function setStatus(text: string): void {
  notes.status = text;
  const el = document.getElementById('note-status');
  if (el) el.textContent = text;
}

function schedule(): void {
  window.clearTimeout(notes.timer);
  setStatus('Unsaved changes');
  notes.timer = window.setTimeout(() => void save(), 800);
}

export function isDirty(): boolean {
  return !!notes.handle && notes.handle.getText() !== notes.saved;
}

async function save(): Promise<void> {
  const h = notes.handle;
  const { storage, index } = state;
  const path = notes.path;
  if (!h || !storage || !index || !path || notes.saving || notes.conflict) return;
  const text = h.getText();
  if (text === notes.saved) return setStatus('Saved');
  notes.saving = true;
  setStatus('Saving…');
  try {
    // Keep what is on disk now as a version before it is overwritten: always for the first save in
    // a session, then at most every few minutes. This is best effort and never blocks the save.
    if (shouldSnapshot(notes.lastSnapshotAt, Date.now())) {
      try {
        await snapshot(storage, path, notes.saved);
        notes.lastSnapshotAt = Date.now();
        void refreshVersions();
      } catch {
        /* history is a safety net, not a requirement */
      }
    }
    const entry = await storage.write(path, text, notes.mtime);
    notes.diff = lineDiff(notes.saved, text) ?? undefined;
    notes.saved = text;
    notes.mtime = entry.mtime;
    await index.refreshFile(path);
    setStatus('Saved');
    refreshSide();
    refreshList();
  } catch (e) {
    if (e instanceof ConflictError) {
      notes.conflict = true;
      setStatus('Not saved');
      refreshBanner();
    } else {
      setStatus(`Not saved. ${errorMessage(e)}`);
    }
  } finally {
    notes.saving = false;
  }
  if (!notes.conflict && h.getText() !== notes.saved) schedule();
}

/** Save any pending edit now. Call before leaving the note or the screen. */
export async function flush(): Promise<void> {
  window.clearTimeout(notes.timer);
  if (isDirty() && !notes.conflict) await save();
}

/** If the open note changed on disk while this tab was in the background, pick the change up or flag a conflict. */
export async function checkExternal(): Promise<void> {
  const { storage, index } = state;
  const h = notes.handle;
  const path = notes.path;
  if (!storage || !index || !h || !path || notes.saving || notes.conflict) return;
  let st;
  try {
    st = await storage.stat(path);
  } catch {
    notes.missing = true;
    refreshBanner();
    return;
  }
  if (st.mtime === notes.mtime) return;
  if (h.getText() === notes.saved) {
    const raw = await storage.read(path);
    notes.saved = raw;
    notes.mtime = st.mtime;
    h.applyText(raw);
    await index.refreshFile(path);
    setStatus('Updated from disk');
    refreshSide();
  } else {
    notes.conflict = true;
    setStatus('Not saved');
    refreshBanner();
  }
}

/* ---------- opening ---------- */

const lastKey = (): string => `plainfile:last:${state.name}`;

/** The note you were last in, remembered per folder in this browser, so Notes can reopen it. */
function rememberLast(path: string): void {
  try {
    localStorage.setItem(lastKey(), path);
  } catch {
    // Private windows may refuse. Nothing depends on it.
  }
}

export function lastOpened(): string | undefined {
  try {
    const p = localStorage.getItem(lastKey());
    return p && state.index?.notes.has(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** A click on a link in the editor: open the note it points to, or offer to create it. */
async function openLink(link: LinkAt): Promise<void> {
  const { index, storage } = state;
  const from = notes.path ? index?.notes.get(notes.path) : undefined;
  if (!index || !storage || !from || !notes.path) return;
  const hit = index.resolveLink(from, { kind: link.kind, target: link.target, line: 0 });
  if (hit.path) return void (await openNote(hit.path));
  const plan = newNoteForLink(notes.path, link, today());
  if (index.files.has(plan.path)) return void (await openNote(plan.path));
  notes.missingLink = plan;
  refreshBanner();
}

async function createLinked(): Promise<void> {
  const m = notes.missingLink;
  const { index, storage } = state;
  if (!m || !index || !storage) return;
  notes.missingLink = undefined;
  try {
    await storage.create(m.path, m.content);
    await index.refreshFile(m.path);
    await openNote(m.path);
  } catch (e) {
    state.error = `Could not create ${m.path}. ${errorMessage(e)}`;
    render();
  }
}

export async function openNote(path: string, at: At = {}): Promise<void> {
  await flush();
  const { storage } = state;
  if (!storage) return;
  try {
    const stat = await storage.stat(path);
    const raw = await storage.read(path);
    const crlf = raw.includes('\r\n') && !/(^|[^\r])\n/.test(raw);
    window.clearTimeout(notes.timer);
    notes.handle?.destroy();
    notes.path = path;
    notes.mtime = stat.mtime;
    notes.saved = raw;
    notes.conflict = false;
    notes.missing = false;
    notes.diff = undefined;
    notes.xray = false;
    notes.yaml = false;
    notes.status = 'Saved';
    notes.pending = at;
    notes.lastSnapshotAt = undefined;
    notes.compare = undefined;
    notes.versions = [];
    notes.lastDeleted = undefined;
    notes.confirmDelete = undefined;
    notes.missingLink = undefined;
    // CodeMirror is loaded on first use, so the app opens without it.
    const { createEditor } = await import('./editor');
    notes.handle = createEditor({ text: raw, crlf, today, onChange, onSave: () => void flush(), suggest, pasteImage, loadImage, openLink });
    rememberLast(path);
  } catch (e) {
    notes.handle?.destroy();
    notes.handle = undefined;
    notes.path = undefined;
    state.error = `Could not open ${path}. ${errorMessage(e)}`;
  }
  state.screen = 'notes';
  render();
}

/** Save a pasted or dropped image beside the notes and return the markdown that shows it. */
async function pasteImage(file: File): Promise<string | null> {
  const { storage, index } = state;
  const path = notes.path;
  if (!storage || !index || !path) return null;
  try {
    setStatus('Saving image…');
    const saved = await saveImage(storage, index, path, new Uint8Array(await file.arrayBuffer()), file.type, new Date(), file.name);
    setStatus(`Saved image ${saved.path}`);
    return saved.markdown;
  } catch (e) {
    setStatus(`Could not save the image. ${errorMessage(e)}`);
    return null;
  }
}

const imageUrls = new Map<string, string>();
onVaultChange(() => {
  for (const u of imageUrls.values()) URL.revokeObjectURL(u);
  imageUrls.clear();
});

/** An image the note refers to, as a URL the editor can show. Kept until the folder changes. */
async function loadImage(rel: string): Promise<string | undefined> {
  const { storage, index } = state;
  const path = notes.path;
  if (!storage || !index || !path) return undefined;
  let target: string;
  try {
    target = joinPath(dirname(path), decodeURI(rel));
  } catch {
    return undefined;
  }
  const real = index.files.has(target) ? target : index.resolveEmbed(index.notes.get(path)!, decodeURI(rel));
  if (!real) return undefined;
  const hit = imageUrls.get(real);
  if (hit) return hit;
  try {
    const url = URL.createObjectURL(new Blob([(await storage.readBinary(real)) as unknown as BlobPart], { type: mimeFor(real) }));
    imageUrls.set(real, url);
    return url;
  } catch {
    return undefined;
  }
}

/** The type-ahead for the editor: link targets (kept until the notes change) and the names already in use. */
let linkCache: { version: number; path: string; list: LinkTarget[] } | undefined;
const suggest = {
  links(): LinkTarget[] {
    const idx = state.index;
    const path = notes.path;
    if (!idx || !path) return [];
    if (linkCache?.version !== idx.version || linkCache.path !== path) {
      linkCache = { version: idx.version, path, list: linkTargets(idx, path, (s, t) => bestLinkTarget(idx, s, t)) };
    }
    return linkCache.list;
  },
  names: (kind: Parameters<typeof suggestionsFor>[1]): string[] => (state.index ? suggestionsFor(state.index, kind).map((s) => s.name) : []),
};

function onChange(): void {
  updateHistoryButtons();
  schedule();
  window.clearTimeout(notes.sideTimer);
  notes.sideTimer = window.setTimeout(refreshSide, 300);
}

/* ---------- rendering ---------- */

const idxNotes = (): Note[] => [...(state.index?.notes.values() ?? [])];

const noteBtn = (path: string, title: string, cls: string, extra = ''): string =>
  `<button class="${cls}" data-note="${esc(path)}" aria-current="${path === notes.path}"><span>${esc(title)}</span>${extra}</button>`;

function pinnedNotes(): Note[] {
  return [...(state.index?.notes.values() ?? [])]
    .filter((n) => n.frontmatter.pinned === true || String(n.frontmatter.pinned).toLowerCase() === 'true')
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** What the Notes screen shows when no note is open: where you can go next. */
function homeHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const t = today();
  const byTime = [...idx.notes.values()].sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
  const changed = byTime.filter((n) => localDateOf(n.mtime) === t).slice(0, 8);
  const pinned = pinnedNotes();
  const tops = new Map<string, number>();
  for (const n of idx.notes.values()) {
    const top = n.path.includes('/') ? (n.path.split('/')[0] as string) : '';
    if (top) tops.set(top, (tops.get(top) ?? 0) + 1);
  }
  const list = (ns: Note[]): string =>
    `<ul class="plain home-list">${ns.map((n) => `<li>${noteBtn(n.path, n.title, 'item note-quick', `<span class="muted mono small">${esc(dirname(n.path) || '(top level)')}</span>`)}</li>`).join('')}</ul>`;
  let h =
    '<div class="notes-home"><h2 class="title">Notes</h2><p class="meta">Notes are plain markdown files. Press <kbd>' +
    MOD +
    'P</kbd> to jump to any note by name, or right-click a note for its actions.</p>' +
    '<div class="row-gap" style="margin:0 0 8px"><button class="btn primary" data-quick-note>Quick note</button><button class="btn" data-act="new-note">+ New note</button><button class="btn" data-act="palette-open">Go to a note…</button></div>';
  if (pinned.length) h += `<h3 class="grp">Pinned</h3>${list(pinned)}`;
  h +=
    `<h3 class="grp">Modified today <span>${changed.length}</span></h3>` +
    (changed.length ? list(changed) : '<p class="muted small">Nothing changed today yet.</p>');
  const rest = byTime.filter((n) => !changed.includes(n)).slice(0, 6);
  if (rest.length) h += `<h3 class="grp">Recent</h3>${list(rest)}`;
  if (tops.size) {
    h +=
      '<h3 class="grp">Folders</h3><div class="chips">' +
      [...tops]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([f, c]) => `<button class="chip" data-folder-filter="${esc(f)}">${esc(f)}/ <span class="muted">${c}</span></button>`)
        .join('') +
      '</div>';
  }
  return `${h}</div>`;
}

function listHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const q = notes.filter.trim().toLowerCase();
  const all = [...idx.notes.values()]
    .filter((n) => !q || n.path.toLowerCase().includes(q) || n.title.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!all.length) return '<p class="muted small">No notes match.</p>';
  let shown = all.slice(0, notes.listLimit);
  // Always keep the open note in the list, even if it sorts beyond the limit.
  const open = notes.path ? all.find((x) => x.path === notes.path) : undefined;
  if (open && !shown.includes(open)) shown = [...shown, open];
  let h = '';
  if (!q) {
    const pins = pinnedNotes();
    const recent = [...idxNotes()]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5)
      .filter((n) => !pins.includes(n));
    if (pins.length) h += `<div class="folder mono">Pinned</div>${pins.map((n) => noteBtn(n.path, n.title, 'item note-quick')).join('')}`;
    if (recent.length) h += `<div class="folder mono">Recent</div>${recent.map((n) => noteBtn(n.path, n.title, 'item note-quick')).join('')}`;
  }
  let folder: string | undefined;
  for (const n of shown) {
    const d = dirname(n.path);
    if (d !== folder) {
      folder = d;
      h += `<div class="folder mono">${esc(d ? `${d}/` : '(top level)')}</div>`;
    }
    h += `<button class="item note-item" data-note="${esc(n.path)}" aria-current="${n.path === notes.path}"><span>${esc(n.title)}</span></button>`;
  }
  if (all.length > notes.listLimit) {
    h += `<p class="muted small" style="margin:10px 0 4px">Showing ${Math.min(notes.listLimit, all.length)} of ${all.length} notes. Type in the filter to narrow them.</p><button class="btn small" data-act="notes-more">Show 300 more</button>`;
  }
  return h;
}

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/:/g, '-');

function deleteConfirmHtml(): string {
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

function trashHtml(): string {
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

async function doDelete(trash: boolean): Promise<void> {
  const { storage, index } = state;
  const path = notes.path;
  if (!storage || !index || !path || notes.deleting) return;
  window.clearTimeout(notes.timer);
  notes.deleting = true;
  refreshBanner();
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

async function restoreFromTrash(trashPath: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index) return;
  const item = (await listTrash(storage)).find((i) => i.trashPath === trashPath);
  if (!item) return;
  try {
    const restored = await restoreNote(storage, index, item);
    notes.lastDeleted = undefined;
    await refreshTrash();
    await openNote(restored);
  } catch (e) {
    state.error = `Could not restore ${item.originalPath}. ${errorMessage(e)}`;
    render();
  }
}

/** "320 words · 1 min read" for the open note, from what is in the editor. */
function statsText(): string {
  const text = notes.handle?.getText() ?? state.index?.notes.get(notes.path ?? '')?.text ?? '';
  const { words, minutes } = readingStats(text);
  return words ? `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${minutes} min read` : '';
}

function bannerHtml(): string {
  if (notes.missingLink) {
    const m = notes.missingLink;
    return `<div class="notice">There is no note called “${esc(m.title)}” yet. <button class="btn primary" data-act="link-create">Create ${esc(m.path)}</button> <button class="btn" data-act="link-cancel">Cancel</button></div>`;
  }
  if (notes.confirmDelete && notes.path) return deleteConfirmHtml();
  if (notes.missing) return '<div class="notice err">This file was deleted or moved outside the app. Your edits here are not saved.</div>';
  if (notes.conflict) {
    return (
      '<div class="notice err">This file changed on disk, so your edits are not saved. ' +
      '<button class="btn" data-act="note-reload">Reload from disk</button> ' +
      '<button class="btn" data-act="note-overwrite">Overwrite the file</button></div>'
    );
  }
  return '';
}

function refreshBanner(): void {
  const el = document.getElementById('note-banner');
  if (el) el.innerHTML = bannerHtml();
}

function diffHtml(): string {
  const d = notes.diff;
  if (!d || !notes.path) return '';
  const show = 6;
  let h = `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(notes.path)} · line ${d.start}</div>`;
  for (const l of d.removed.slice(0, show)) h += `<div class="del"><span class="sg">−</span><span>${esc(l) || ' '}</span></div>`;
  for (const l of d.added.slice(0, show)) h += `<div class="add"><span class="sg">+</span><span>${esc(l) || ' '}</span></div>`;
  const more = Math.max(d.removed.length, d.added.length) - show;
  if (more > 0) h += `<div class="muted">and ${more} more changed line${more === 1 ? '' : 's'}</div>`;
  return `${h}</div>`;
}

function propsHtml(): string {
  const h = notes.handle;
  if (!h || !notes.path) return '';
  const text = h.getText();
  const n = parseNote(notes.path, text, { mtime: 0, size: 0 });
  if (notes.yaml) {
    const raw = frontmatterText(text);
    return `<pre class="yaml">${esc(raw ?? '(no frontmatter)')}</pre>`;
  }
  const fm = n.frontmatter;
  let out = '';
  if (frontmatterText(text) === null) {
    out +=
      '<div class="notice small" style="margin:0 0 8px">This note has no frontmatter. Add a starter block with its title, today as the created date, and empty tags. The text of the note is not changed.' +
      '<div class="row-gap"><button class="btn primary small" data-act="add-frontmatter">Add default frontmatter</button></div></div>';
  }
  if (n.frontmatterError) out += `<div class="notice err small">The frontmatter has a problem: ${esc(n.frontmatterError)}</div>`;
  const rows: string[] = [];
  const hasStatus = fm.status !== undefined;
  const hasDue = fm.due !== undefined;
  if (hasStatus) {
    const cur = String(fm.status).toLowerCase();
    const opts = (STATUSES.includes(cur) ? STATUSES : [cur, ...STATUSES]).map((s) => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
    rows.push(`<dt><label for="prop-status">status</label></dt><dd><select id="prop-status" class="inp">${opts}</select></dd>`);
  }
  if (hasDue) {
    const d = n.fileTask?.due ?? String(fm.due);
    rows.push(
      `<dt><label for="prop-due">due</label></dt><dd><input id="prop-due" class="inp" type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')}"></dd>`,
    );
  }
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'status' || k === 'due' || k === 'project' || k === 'people') continue;
    const val = Array.isArray(v) ? v.map((x) => `<span class="chip mono">${esc(String(x))}</span>`).join(' ') : esc(String(v));
    rows.push(`<dt>${esc(k)}</dt><dd>${val}</dd>`);
  }
  const who = listOf(fm.people).map((x) => x.replace(/^@/, ''));
  rows.push(
    `<dt>people</dt><dd class="projrow">${who
      .map(
        (name) =>
          `<span class="chip projchip"><span>${esc(name.replace(/-/g, ' '))}</span><button class="plain-btn x" data-act="person-remove" data-name="${esc(name)}" aria-label="Remove ${esc(name.replace(/-/g, ' '))}">×</button></span>`,
      )
      .join(
        '',
      )}<form data-person-add class="projadd"><input id="prop-person" class="inp" type="text" autocomplete="off" data-suggest="people" data-suggest-one data-suggest-sep="" placeholder="${who.length ? '+ Another person' : '+ Add a person'}" aria-label="Add a person"><button class="btn small" type="submit">Add</button></form></dd>`,
  );
  const mine = noteProjects(n);
  const known = state.index ? listProjects(state.index) : [];
  rows.push(
    `<dt>projects</dt><dd class="projrow">${mine
      .map((name) => {
        const p = state.index ? findProject(known, name) : undefined;
        return `<span class="chip projchip">${p ? `<button class="plain-btn" data-open-project="${esc(p.path)}" title="Open the project dashboard">${esc(name)}</button>` : `<span title="No project with this name yet">${esc(name)}</span>`}<button class="plain-btn x" data-act="project-remove" data-name="${esc(name)}" aria-label="Remove from ${esc(name)}">×</button></span>`;
      })
      .join(
        '',
      )}<form data-proj-add class="projadd"><input id="prop-project" class="inp" type="text" autocomplete="off" data-suggest="projects" placeholder="${mine.length ? '+ Another project' : '+ Add to a project'}" aria-label="Add to a project"><button class="btn small" type="submit">Add</button></form></dd>`,
  );
  out += rows.length ? `<dl class="props">${rows.join('')}</dl>` : '<p class="muted small" style="margin:0 0 6px">No properties yet.</p>';
  const add: string[] = [];
  if (!hasStatus) add.push('<button class="btn small" data-act="add-prop" data-key="status" data-val="todo">+ Status</button>');
  if (!hasDue) add.push(`<button class="btn small" data-act="add-prop" data-key="due" data-val="${esc(addDays(today(), 7))}">+ Due date</button>`);
  return out + (add.length ? `<div class="row-gap">${add.join('')}</div>` : '');
}

export function updateHistoryButtons(): void {
  const h = notes.handle;
  const u = document.getElementById('note-undo') as HTMLButtonElement | null;
  const r = document.getElementById('note-redo') as HTMLButtonElement | null;
  if (u) u.disabled = !h?.canUndo();
  if (r) r.disabled = !h?.canRedo();
}

async function refreshVersions(): Promise<void> {
  const { storage } = state;
  if (!storage || !notes.path) return;
  notes.versions = await listVersions(storage, notes.path).catch(() => []);
  refreshSide();
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

function historyHtml(): string {
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

async function restoreVersion(path: string): Promise<void> {
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
  await refreshVersions();
  updateHistoryButtons();
}

/** The little buttons that collapse a side panel, and the edge tabs that bring it back. Wide screens only. */
function paneHide(which: 'list' | 'details'): string {
  return which === 'list'
    ? '<button class="pane-hide only-wide" data-act="pane-list" aria-label="Collapse left pane" title="Hide this list for more room">« Hide</button>'
    : '<button class="pane-hide only-wide" data-act="pane-details" aria-label="Collapse right pane" title="Hide the details for more room">Hide »</button>';
}

function sideHtml(): string {
  return paneHide('details') + sideBody();
}

function sideBody(): string {
  const idx = state.index;
  if (!notes.path || !idx) return '<h2>Note</h2><p class="muted small" style="margin:0">Open a note to see its properties, links and what changed.</p>';
  const back = idx.backlinks(notes.path);
  let h = `<h2>Properties <button class="btn small" data-act="yaml" aria-pressed="${notes.yaml}">${notes.yaml ? 'Show form' : 'Show YAML'}</button></h2>${propsHtml()}`;
  h += '<h2 style="margin-top:16px">Linked from</h2>';
  h += back.length
    ? `<ul class="plain backlinks">${back.map((b) => backlinkItem(idx, b)).join('')}</ul>`
    : '<p class="muted small" style="margin:0">No other note links here.</p>';
  const me = idx.notes.get(notes.path);
  if (me && isProjectNote(me)) {
    const c = projectContents(idx, notes.path);
    h += `<h2 style="margin-top:16px">In this project <button class="btn small" data-open-project="${esc(notes.path)}">Dashboard</button></h2>`;
    h += `<div class="row-gap" style="margin-top:0"><button class="btn small" data-act="proj-task" data-path="${esc(notes.path)}">+ Task</button><button class="btn small" data-act="proj-note" data-path="${esc(notes.path)}">+ Note</button></div>`;
    h += `<p class="muted small" style="margin:8px 0 4px">${c.tasks.length} open task${c.tasks.length === 1 ? '' : 's'}, ${c.notes.length} note${c.notes.length === 1 ? '' : 's'}</p>`;
    if (c.tasks.length) {
      h += `<ul class="plain small">${c.tasks
        .slice(0, 8)
        .map(
          (t) =>
            `<li><button class="link" data-open="${esc(t.path)}" data-line="${t.line}">${esc(t.title)}</button>${t.due ? ` <span class="muted">${esc(t.due)}</span>` : ''}</li>`,
        )
        .join('')}</ul>`;
    }
    if (c.notes.length) {
      h += `<ul class="plain small" style="margin-top:6px">${c.notes
        .slice(0, 10)
        .map((n) => `<li><button class="link" data-open="${esc(n.path)}">${esc(n.title)}</button></li>`)
        .join('')}</ul>`;
    }
  }
  return h + historyHtml() + diffHtml();
}

/** Redraw the note list, so a new title, or a note you pinned, shows without a page redraw. */
function refreshList(): void {
  const el = document.getElementById('note-list');
  if (el) el.innerHTML = listHtml();
}

/** One back-link: the note's title, and the line the link sits on, so you can tell what each mention says. */
function backlinkItem(idx: NonNullable<typeof state.index>, b: { from: string; line: number }): string {
  const n = idx.notes.get(b.from);
  const raw = (n?.text.split('\n')[b.line - 1] ?? '').replace(/\r$/, '').trim();
  const line = raw.length > 140 ? `${raw.slice(0, 139)}…` : raw;
  return (
    `<li><button class="link" data-open="${esc(b.from)}" data-line="${b.line}" title="${esc(b.from)}:${b.line}">${esc(n?.title ?? b.from)}</button>` +
    `${line ? `<div class="backline small muted">${esc(line)}</div>` : ''}</li>`
  );
}

export function refreshSide(): void {
  const el = document.getElementById('note-side');
  if (el) el.innerHTML = sideHtml();
  const stats = document.getElementById('note-stats');
  if (stats) stats.textContent = statsText();
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  let main: string;
  if (!notes.path) {
    main =
      (notes.lastDeleted
        ? `<div class="notice ok" role="status">Deleted “${esc(notes.lastDeleted.title)}”. ${notes.lastDeleted.trashPath ? 'It is in the trash. <button class="btn small" data-act="undo-delete">Undo</button>' : 'It was removed permanently.'}</div>`
        : '') + homeHtml();
  } else {
    const n = idx.notes.get(notes.path);
    main =
      `<div class="ed-head"><div style="min-width:0"><input id="note-title" class="title title-input" type="text" value="${esc(n?.title ?? notes.path)}" aria-label="Note title (click to change)" title="Click to change the title" spellcheck="false" autocomplete="off"><div class="mono muted small path">${esc(notes.path)}</div><div id="note-stats" class="muted small">${statsText()}</div></div>` +
      `<div class="ed-actions"><button class="btn only-narrow hide-in-focus" data-act="note-close">All notes</button>` +
      `<button class="btn" id="note-undo" data-act="note-undo" disabled>Undo</button><button class="btn" id="note-redo" data-act="note-redo" disabled>Redo</button>` +
      `<button class="btn only-wide" data-act="pane-list" aria-pressed="${notes.panes.list}" title="Show or hide the list of notes">Notes list</button><button class="btn only-wide" data-act="pane-details" aria-pressed="${notes.panes.details}" title="Show or hide properties, links and history">Details</button>` +
      `<button class="btn" data-act="focus-toggle" aria-pressed="${notes.focus}">${notes.focus ? 'Exit focus' : 'Focus'}</button><button class="btn" data-act="xray" aria-pressed="${notes.xray}">X-ray</button>` +
      `<button class="btn hide-in-focus" data-act="note-menu" aria-haspopup="menu" aria-label="More actions" title="Move, rename, duplicate, pin, delete and more">⋯ More</button>` +
      `<span id="note-status" class="status" role="status">${esc(notes.status)}</span></div></div>` +
      `<div id="note-banner">${bannerHtml()}</div><div id="editor-slot" class="editor-slot"></div>`;
  }
  return (
    `<div class="frame notes${notes.path ? ' has-note' : ''}${notes.panes.list ? '' : ' no-list'}${notes.panes.details ? '' : ' no-details'}">` +
    (notes.panes.list
      ? ''
      : '<button class="edge-tab edge-left only-wide" data-act="pane-list" aria-label="Expand left pane" title="Show the list of notes">»</button>') +
    (notes.panes.details
      ? ''
      : '<button class="edge-tab edge-right only-wide" data-act="pane-details" aria-label="Expand right pane" title="Show properties, links and history">«</button>') +
    `<aside class="side">${paneHide('list')}<div class="side-head"><input id="note-filter" class="inp" type="text" placeholder="Filter notes" aria-label="Filter notes" value="${esc(notes.filter)}">` +
    '<button class="btn primary" data-act="new-note">+ New note</button><button class="btn" data-quick-note title="Titled with the date and time, ready to type (Alt+N)">Quick note</button></div>' +
    `<div id="note-list" class="note-list">${listHtml()}</div><div id="note-trash">${trashHtml()}</div></aside>` +
    `<section class="main editor-main">${main}</section>` +
    `<aside class="source" id="note-side">${sideHtml()}</aside></div>`
  );
}

/** Call after the screen's HTML is in the page: puts the live editor into its slot. */
export function afterRender(refocus: boolean): void {
  void refreshTrash();
  const slot = document.getElementById('editor-slot');
  const h = notes.handle;
  if (!slot || !h) return;
  slot.appendChild(h.host);
  const p = notes.pending;
  notes.pending = {};
  if (p.find) {
    if (p.line) h.goToLine(p.line);
    h.selectFirst(p.find, p.line);
  } else if (p.line) h.goToLine(p.line);
  else if (p.offset !== undefined) h.goToOffset(p.offset);
  else if (refocus) h.focus();
  h.setXray(notes.xray);
  if (notes.wantFocus) {
    notes.wantFocus = false;
    h.focus();
  }
  updateHistoryButtons();
  if (notes.versions.length === 0 && notes.path) void refreshVersions();
}

/** True if the editor has the keyboard focus, so a redraw can give it back. */
export function hadFocus(): boolean {
  return !!notes.handle && notes.handle.hasFocus();
}

/* ---------- events ---------- */

export function applyProperty(key: string, value: string | null): void {
  const h = notes.handle;
  if (!h) return;
  h.applyText(setFrontmatterField(h.getText(), key, value));
  refreshSide();
}

/** The title box above the note: Enter or leaving it saves the new title, Escape puts the old one back. */
function commitTitle(el: HTMLInputElement): void {
  const h = notes.handle;
  const old = notes.path ? (state.index?.notes.get(notes.path)?.title ?? '') : '';
  const next = el.value.trim();
  if (!h || !next || next === old) {
    el.value = old;
    return;
  }
  h.applyText(titleFrontmatter(h.getText(), next));
  refreshSide();
}

export function titleKey(e: KeyboardEvent): boolean {
  const el = e.target as HTMLInputElement;
  if (el.id !== 'note-title') return false;
  if (e.key === 'Enter') {
    e.preventDefault();
    commitTitle(el);
    notes.handle?.focus();
    return true;
  }
  if (e.key === 'Escape') {
    el.value = (notes.path ? state.index?.notes.get(notes.path)?.title : '') ?? '';
    notes.handle?.focus();
    return true;
  }
  return false;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const item = target.closest<HTMLElement>('[data-note]')?.dataset.note;
  if (item) {
    await openNote(item);
    return true;
  }
  const ff = target.closest<HTMLElement>('[data-folder-filter]')?.dataset.folderFilter;
  if (ff) {
    notes.filter = `${ff}/`;
    render();
    return true;
  }
  const act = target.closest<HTMLElement>('[data-act]');
  switch (act?.dataset.act) {
    case 'xray':
      notes.xray = !notes.xray;
      notes.handle?.setXray(notes.xray);
      act.setAttribute('aria-pressed', String(notes.xray));
      return true;
    case 'yaml':
      notes.yaml = !notes.yaml;
      refreshSide();
      return true;
    case 'add-frontmatter': {
      const h = notes.handle;
      if (!h || !notes.path) return true;
      const note = parseNote(notes.path, h.getText(), { mtime: 0, size: 0 });
      h.applyText(addDefaultFrontmatter(h.getText(), note.title, today()));
      refreshSide();
      return true;
    }
    case 'person-remove': {
      const h = notes.handle;
      if (!h || !notes.path) return true;
      h.applyText(removeFrontmatterListItem(h.getText(), 'people', act.dataset.name ?? ''));
      refreshSide();
      return true;
    }
    case 'project-remove': {
      const h = notes.handle;
      if (!h || !notes.path) return true;
      const now = noteProjects(parseNote(notes.path, h.getText(), { mtime: 0, size: 0 }));
      h.applyText(
        setProjects(
          h.getText(),
          now.filter((x) => x.toLowerCase() !== (act.dataset.name ?? '').toLowerCase()),
        ),
      );
      refreshSide();
      return true;
    }
    case 'add-prop':
      applyProperty(act.dataset.key ?? '', act.dataset.val ?? '');
      return true;
    case 'notes-more': {
      notes.listLimit += 300;
      const list = document.getElementById('note-list');
      if (list) list.innerHTML = listHtml();
      return true;
    }
    case 'note-undo':
      notes.handle?.undo();
      updateHistoryButtons();
      return true;
    case 'note-redo':
      notes.handle?.redo();
      updateHistoryButtons();
      return true;
    case 'focus-toggle':
      notes.focus = !notes.focus;
      notes.wantFocus = true;
      render();
      return true;
    case 'history-toggle':
      notes.historyOpen = !notes.historyOpen;
      refreshSide();
      return true;
    case 'ver-compare': {
      const p = act.dataset.ver ?? '';
      const v = notes.versions.find((x) => x.path === p);
      if (notes.compare?.path === p) notes.compare = undefined;
      else if (v && state.storage) notes.compare = { path: p, text: await readVersion(state.storage, v) };
      refreshSide();
      return true;
    }
    case 'ver-restore':
      await restoreVersion(act.dataset.ver ?? '');
      return true;
    case 'note-close':
      await flush();
      window.clearTimeout(notes.timer);
      notes.handle?.destroy();
      notes.handle = undefined;
      notes.path = undefined;
      notes.confirmDelete = undefined;
      render();
      return true;
    case 'delete-note':
      await flush();
      notes.confirmDelete = 'trash';
      refreshBanner();
      return true;
    case 'delete-cancel':
      notes.confirmDelete = undefined;
      refreshBanner();
      return true;
    case 'delete-perm':
      notes.confirmDelete = 'permanent';
      refreshBanner();
      return true;
    case 'delete-trash':
      await doDelete(true);
      return true;
    case 'delete-perm-yes':
      await doDelete(false);
      return true;
    case 'undo-delete':
      if (notes.lastDeleted?.trashPath) await restoreFromTrash(notes.lastDeleted.trashPath);
      return true;
    case 'trash-toggle':
      notes.trashOpen = !notes.trashOpen;
      notes.purgeArm = undefined;
      await refreshTrash();
      return true;
    case 'trash-restore':
      await restoreFromTrash(act.dataset.trash ?? '');
      return true;
    case 'trash-purge': {
      const tp = act.dataset.trash ?? '';
      if (notes.purgeArm !== tp) {
        notes.purgeArm = tp;
        await refreshTrash();
        return true;
      }
      const item = state.storage ? (await listTrash(state.storage)).find((i) => i.trashPath === tp) : undefined;
      if (item && state.storage) await purgeTrashItem(state.storage, item).catch((e) => (state.error = `Could not delete it. ${errorMessage(e)}`));
      notes.purgeArm = undefined;
      await refreshTrash();
      return true;
    }
    case 'pane-list':
    case 'pane-details': {
      if (act.dataset.act === 'pane-list') notes.panes.list = !notes.panes.list;
      else notes.panes.details = !notes.panes.details;
      try {
        localStorage.setItem('plainfile.panes', JSON.stringify(notes.panes));
      } catch {
        /* the choice just is not remembered */
      }
      render();
      return true;
    }
    case 'link-create':
      await createLinked();
      return true;
    case 'link-cancel':
      notes.missingLink = undefined;
      refreshBanner();
      return true;
    case 'note-reload': {
      const p = notes.path;
      window.clearTimeout(notes.timer);
      notes.handle?.destroy();
      notes.handle = undefined;
      notes.conflict = false;
      if (p) await openNote(p);
      return true;
    }
    case 'note-overwrite': {
      const { storage } = state;
      if (storage && notes.path) {
        notes.mtime = (await storage.stat(notes.path)).mtime;
        notes.conflict = false;
        notes.missing = false;
        refreshBanner();
        await save();
      }
      return true;
    }
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLElement;
  if (t.id === 'note-filter') {
    notes.filter = (t as HTMLInputElement).value;
    notes.listLimit = 300;
    const list = document.getElementById('note-list');
    if (list) list.innerHTML = listHtml();
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === 'note-title') {
    commitTitle(t as HTMLInputElement);
    return true;
  }
  if (t.id === 'prop-status') {
    applyProperty('status', t.value);
    return true;
  }
  if (t.id === 'prop-due' && t.value) {
    applyProperty('due', t.value);
    return true;
  }
  return false;
}

/** The "Add to a project" form in the properties panel. The name must be a project that exists. */
/** Add the person typed in the Properties panel to `people:`, as the same hyphenated name a quick add writes. */
export function addPerson(): void {
  const h = notes.handle;
  const input = document.getElementById('prop-person') as HTMLInputElement | null;
  if (!h || !notes.path || !input) return;
  const name = input.value
    .trim()
    .replace(/^@/, '')
    .replace(/[,\s]+$/, '')
    .replace(/\s+/g, '-');
  if (!name) return;
  h.applyText(addFrontmatterListItem(h.getText(), 'people', name));
  refreshSide();
  document.getElementById('prop-person')?.focus();
}

export function addProject(): void {
  const h = notes.handle;
  const input = document.getElementById('prop-project') as HTMLInputElement | null;
  if (!h || !notes.path || !input || !state.index) return;
  const typed = input.value.trim().replace(/^\+/, '');
  if (!typed) return;
  const project = findProject(listProjects(state.index), typed);
  if (!project) {
    notes.status = `No project called “${typed}”. Make one from + New.`;
    setStatus(notes.status);
    return;
  }
  const name = projectRef(project).name;
  const now = noteProjects(parseNote(notes.path, h.getText(), { mtime: 0, size: 0 }));
  if (!now.some((x) => x.toLowerCase() === name.toLowerCase())) h.applyText(setProjects(h.getText(), [...now, name]));
  refreshSide();
  document.getElementById('prop-project')?.focus();
}
