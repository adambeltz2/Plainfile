import { noteKind } from '../src/note-kind';
import { newNoteForLink, type LinkAt } from '../src/linknote';
import { listTrash, purgeTrashItem } from '../src/delete';
import { lineDiff } from '../src/diff';
import { readVersion, shouldSnapshot, snapshot } from '../src/history';
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
import { kindIcon } from './kind-icon';
import { pinnedNotes as pinned } from '../src/pins';
import { dropboxPath, fullPath } from '../src/filepath';
import { localDateOf } from '../src/dates';
import { saveImage, mimeFor, isDiagram } from '../src/attachments';
import { dirname, joinPath } from '../src/index';
import { parseNote, type Note } from '../src/parse';
import { isProjectNote, listProjects, noteProjects, projectContents } from '../src/projects';
import { findProject } from '../src/quickline';
import { addDays } from '../src/query';
import { normalizePriority } from '../src/priority';
import { outline } from '../src/outline';
import { linkTargets, suggestionsFor, type LinkTarget } from '../src/vocabulary';
import { ConflictError } from '../src/storage';
import { nameForTitle } from '../src/rename';
import { readingStats } from '../src/render';
import { MOD } from './keys';
import { errorMessage, onVaultChange, projectRef, render, state, today } from './store';
import { esc } from './util';

import { notes, setStatus, type At } from './notes-state';
import { deleteConfirmHtml, doDelete as deleteOpenNote, refreshTrash, restoreFromTrash as restoreTrashed, trashHtml } from './notes-trash';
import { historyHtml, loadVersions, restoreVersion as restoreVersionText, updateHistoryButtons } from './notes-history';

export { notes, refreshTrash, updateHistoryButtons };

const STATUSES = ['todo', 'doing', 'waiting', 'done'];
/** The priorities offered in Properties. Any A to Z already in a note is kept and shown as well. */
const PRIORITIES = ['A', 'B', 'C'];

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
  if (link.kind === 'url') {
    // A web address opens in a new tab. Nothing is written to the note: the file stays plain markdown.
    const a = document.createElement('a');
    a.href = link.target;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
    return;
  }
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

const baseKey = (): string => `plainfile.base:${state.name}`;
function savedBase(): string {
  try {
    return localStorage.getItem(baseKey()) ?? '';
  } catch {
    return '';
  }
}

async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notes.status = `Copied ${what}`;
  } catch {
    notes.status = `${what}: ${text}`;
  }
  setStatus(notes.status);
}

/**
 * Copy where the open note is. Dropbox: its path in Dropbox. A folder on this computer: the full path, once the app has
 * been told where the folder is (it cannot know). Otherwise, or on request, the path inside the folder.
 */
export async function copyFilePath(path = notes.path, forceAsk = false): Promise<void> {
  if (!path) return;
  if (state.name.startsWith('Dropbox')) return copyText(dropboxPath(state.name.replace(/^Dropbox:?\s*/, ''), path), 'the Dropbox path');
  if (state.name.startsWith('OneDrive')) return copyText([state.name.replace(/^OneDrive:?\s*/, ''), path].filter(Boolean).join('/'), 'the OneDrive path');
  if (state.demo) return copyText(path, 'the path');
  const base = savedBase();
  if (!base || forceAsk) {
    notes.pathPrompt = true;
    refreshBanner();
    document.getElementById('vault-base')?.focus();
    return;
  }
  return copyText(fullPath(base, path), 'the file path');
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
    notes.handle = createEditor({
      text: raw,
      crlf,
      today,
      onChange,
      onSave: () => void flush(),
      suggest,
      pasteImage,
      loadImage,
      editDiagram: (rel) => void editDiagram(rel),
      openLink,
    });
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

/** The file in the folder that an image link in the open note points at, if there is one. */
function imageFile(rel: string): string | undefined {
  const { index } = state;
  const path = notes.path;
  if (!index || !path) return undefined;
  let target: string;
  try {
    target = joinPath(dirname(path), decodeURI(rel));
  } catch {
    return undefined;
  }
  return index.files.has(target) ? target : index.resolveEmbed(index.notes.get(path)!, decodeURI(rel));
}

/** An image the note refers to, as a URL the editor can show. Kept until the folder changes; a draw.io diagram is kept per version of the file, since it is edited in another program. */
async function loadImage(rel: string): Promise<string | undefined> {
  const { storage } = state;
  const real = imageFile(rel);
  if (!storage || !real) return undefined;
  try {
    const key = isDiagram(real) ? `${real}@${(await storage.stat(real)).mtime}` : real;
    const hit = imageUrls.get(key);
    if (hit) return hit;
    const url = URL.createObjectURL(new Blob([(await storage.readBinary(real)) as unknown as BlobPart], { type: mimeFor(real) }));
    imageUrls.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}

/** "Edit diagram" on a draw.io picture: copy where the file is, to open it in draw.io. The picture is redrawn when this window is back. */
let diagramOpened = false;
async function editDiagram(rel: string): Promise<void> {
  const real = imageFile(rel);
  if (!real) return;
  diagramOpened = true;
  await copyFilePath(real);
  if (/^Copied/.test(notes.status)) setStatus(`${notes.status}. Open it in draw.io; the picture updates when you come back.`);
}
const redrawDiagrams = (): void => {
  if (!diagramOpened || document.visibilityState === 'hidden') return;
  diagramOpened = false;
  notes.handle?.refreshImages();
};
window.addEventListener('focus', redrawDiagrams);
document.addEventListener('visibilitychange', redrawDiagrams);

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
  `<button class="${cls}" data-note="${esc(path)}" aria-current="${path === notes.path}"><span>${kindIcon(state.index?.notes.get(path))}${esc(title)}</span>${extra}</button>`;

const pinnedNotes = (): Note[] => (state.index ? pinned(state.index) : []);

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
    '<div class="row-gap" style="margin:0 0 8px"><button class="btn primary" data-quick-note>Quick note</button><button class="btn" data-act="palette-open">Go to a note…</button></div>';
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
    h += `<button class="item note-item" data-note="${esc(n.path)}" aria-current="${n.path === notes.path}"><span>${kindIcon(n)}${esc(n.title)}</span></button>`;
  }
  if (all.length > notes.listLimit) {
    h += `<p class="muted small" style="margin:10px 0 4px">Showing ${Math.min(notes.listLimit, all.length)} of ${all.length} notes. Type in the filter to narrow them.</p><button class="btn small" data-act="notes-more">Show 300 more</button>`;
  }
  return h;
}

/** "320 words · 1 min read" for the open note, from what is in the editor. */
function statsText(): string {
  const text = notes.handle?.getText() ?? state.index?.notes.get(notes.path ?? '')?.text ?? '';
  const { words, minutes } = readingStats(text);
  return words ? `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${minutes} min read` : '';
}

function bannerHtml(): string {
  if (notes.pathPrompt) {
    return (
      '<div class="notice" role="group" aria-label="Where is this folder">Browsers do not tell tendfile where this folder is on your computer, so tell it once and it will be remembered here. ' +
      '<div class="row-gap" style="margin:8px 0"><label class="small" for="vault-base">Folder location</label><input id="vault-base" class="inp" type="text" autocomplete="off" spellcheck="false" placeholder="C:\\Users\\you\\Notes  or  /Users/you/Notes" value="' +
      esc(savedBase()) +
      '"></div>' +
      '<button class="btn primary" data-act="path-save">Save and copy</button> <button class="btn" data-act="path-relative">Copy the path inside the folder</button> <button class="btn" data-act="path-cancel">Cancel</button></div>'
    );
  }
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
  const n = notes.path ? state.index?.notes.get(notes.path) : undefined;
  const suggested = n && notes.path && !keepNames.has(notes.path) ? nameForTitle(n) : undefined;
  if (suggested)
    return `<div class="notice small" role="status">The file name <span class="mono">${esc(n!.name)}.md</span> differs from the title. <button class="btn small" data-act="rename-to-title">Rename the file to “${esc(suggested)}”</button> <button class="btn small" data-act="keep-name">Keep it</button></div>`;
  return '';
}

/** Notes whose file name differs from their title on purpose, for this visit. */
const keepNames = new Set<string>();

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
  const hasPriority = fm.priority !== undefined;
  if (hasPriority) {
    const cur = normalizePriority(fm.priority);
    const letters = cur && !PRIORITIES.includes(cur) ? [...PRIORITIES, cur].sort() : PRIORITIES;
    const opts = ['', ...letters].map((l) => `<option value="${l}"${l === (cur ?? '') ? ' selected' : ''}>${l || 'None'}</option>`).join('');
    rows.push(`<dt><label for="prop-priority">priority</label></dt><dd><select id="prop-priority" class="inp">${opts}</select></dd>`);
  }
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'status' || k === 'due' || k === 'priority' || k === 'project' || k === 'people') continue;
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
  if (!hasPriority) add.push('<button class="btn small" data-act="add-prop" data-key="priority" data-val="A">+ Priority</button>');
  if (!hasDue) add.push(`<button class="btn small" data-act="add-prop" data-key="due" data-val="${esc(addDays(today(), 7))}">+ Due date</button>`);
  return out + (add.length ? `<div class="row-gap">${add.join('')}</div>` : '');
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

/** The headings of the open note, each a button that jumps the editor to it. Shown from two headings up. */
function contentsHtml(): string {
  const heads = outline(notes.handle?.getText() ?? '');
  if (heads.length < 2) return '';
  const top = Math.min(...heads.map((x) => x.level));
  let h = `<h2 style="margin-top:16px">Contents <button class="btn small" data-act="toc-toggle" aria-expanded="${notes.tocOpen}">${notes.tocOpen ? 'Hide' : `Show ${heads.length}`}</button></h2>`;
  if (!notes.tocOpen) return h;
  h += '<ul class="plain outline small">';
  for (const x of heads) {
    h += `<li style="padding-left:${Math.min(x.level - top, 4) * 12}px"><button class="link" data-act="toc-go" data-line="${x.line}">${esc(x.title)}</button></li>`;
  }
  return `${h}</ul>`;
}

function sideBody(): string {
  const idx = state.index;
  if (!notes.path || !idx) return '<h2>Note</h2><p class="muted small" style="margin:0">Open a note to see its properties, links and what changed.</p>';
  const back = idx.backlinks(notes.path);
  let h = `<h2>Properties <button class="btn small" data-act="yaml" aria-pressed="${notes.yaml}">${notes.yaml ? 'Show form' : 'Show YAML'}</button></h2>${propsHtml()}`;
  h += contentsHtml();
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
  refreshBanner(); // the title may have changed
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
      `<div class="ed-head"><div style="min-width:0"><input id="note-title" class="title title-input" type="text" value="${esc(n?.title ?? notes.path)}" aria-label="Note title (click to change)" title="Click to change the title" spellcheck="false" autocomplete="off"><div class="pathrow"><div class="mono muted small path">${esc(notes.path)}</div><button class="plain-btn small" data-act="copy-path" title="Copy where this file is, to paste somewhere else">Copy path</button></div><div id="note-stats" class="muted small">${statsText()}</div></div>` +
      `<div class="ed-actions">${n && noteKind(n) === 'journal' ? '<button class="btn hide-in-focus" data-nav="journal" title="Back to the journal calendar">‹ Journals</button>' : ''}<button class="btn only-narrow hide-in-focus" data-act="note-close">All notes</button>` +
      `<button class="btn" id="note-undo" data-act="note-undo" disabled>Undo</button><button class="btn" id="note-redo" data-act="note-redo" disabled>Redo</button>` +
      `<button class="btn only-wide" data-act="pane-list" aria-pressed="${notes.focus ? notes.peek === 'list' : notes.panes.list}" title="Show or hide the list of notes">Notes list</button><button class="btn only-wide" data-act="pane-details" aria-pressed="${notes.focus ? notes.peek === 'details' : notes.panes.details}" title="Show or hide properties, links and history">Details</button>` +
      `<button class="btn" data-act="focus-toggle" aria-pressed="${notes.focus}">${notes.focus ? 'Exit focus' : 'Focus'}</button>` +
      `<button class="btn hide-in-focus" data-act="note-menu" aria-haspopup="menu" aria-label="More actions" title="Move, rename, duplicate, pin, delete and more">⋯ More</button>` +
      `<span id="note-status" class="status" role="status">${esc(notes.status)}</span></div></div>` +
      `<div id="note-banner">${bannerHtml()}</div><div id="editor-slot" class="editor-slot"></div>`;
  }
  return (
    `<div class="frame notes${notes.path ? ' has-note' : ''}${notes.panes.list ? '' : ' no-list'}${notes.panes.details ? '' : ' no-details'}${notes.focus && notes.peek ? ` peek-${notes.peek}` : ''}">` +
    (notes.panes.list
      ? ''
      : '<button class="edge-tab edge-left only-wide" data-act="pane-list" aria-label="Expand left pane" title="Show the list of notes">»</button>') +
    (notes.panes.details
      ? ''
      : '<button class="edge-tab edge-right only-wide" data-act="pane-details" aria-label="Expand right pane" title="Show properties, links and history">«</button>') +
    `<aside class="side">${paneHide('list')}<div class="side-head"><input id="note-filter" class="inp" type="text" placeholder="Filter notes" aria-label="Filter notes" value="${esc(notes.filter)}">` +
    '<button class="btn primary" data-quick-note title="Named with the date and time, ready to type (Alt+N)">Quick note</button></div>' +
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
    case 'copy-path':
      await copyFilePath();
      return true;
    case 'path-save': {
      const v = (document.getElementById('vault-base') as HTMLInputElement | null)?.value.trim() ?? '';
      if (!v) return true;
      try {
        localStorage.setItem(baseKey(), v);
      } catch {
        /* it is just not remembered */
      }
      notes.pathPrompt = false;
      refreshBanner();
      if (notes.path) await copyText(fullPath(v, notes.path), 'the file path');
      return true;
    }
    case 'path-relative':
      notes.pathPrompt = false;
      refreshBanner();
      if (notes.path) await copyText(notes.path, 'the path inside the folder');
      return true;
    case 'path-cancel':
      notes.pathPrompt = false;
      refreshBanner();
      return true;
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
      notes.peek = undefined;
      notes.wantFocus = true;
      render();
      return true;
    case 'toc-toggle':
      notes.tocOpen = !notes.tocOpen;
      refreshSide();
      return true;
    case 'toc-go':
      notes.handle?.goToLine(Number(act.dataset.line));
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
      if (notes.focus) {
        // In focus mode the panels are hidden, so these buttons show one over the note, and a second press closes it.
        const want = act.dataset.act === 'pane-list' ? 'list' : 'details';
        notes.peek = notes.peek === want ? undefined : want;
        render();
        return true;
      }
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
    case 'keep-name':
      if (notes.path) keepNames.add(notes.path);
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
  if (t.id === 'prop-priority') {
    applyProperty('priority', t.value || null);
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

/** Reads the open note's saved versions and redraws the side panel. */
async function refreshVersions(): Promise<void> {
  await loadVersions();
  refreshSide();
}

async function restoreVersion(path: string): Promise<void> {
  await restoreVersionText(path);
  refreshSide();
}

async function doDelete(trash: boolean): Promise<void> {
  await deleteOpenNote(trash, refreshBanner);
}

async function restoreFromTrash(trashPath: string): Promise<void> {
  await restoreTrashed(trashPath, openNote);
}
