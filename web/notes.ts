import { lineDiff, type LineChange } from '../src/diff';
import { frontmatterText, setFrontmatterField } from '../src/frontmatter';
import { dirname } from '../src/index';
import { parseNote } from '../src/parse';
import { addDays } from '../src/query';
import { ConflictError } from '../src/storage';
import { createEditor, type EditorHandle } from './editor';
import { errorMessage, onVaultChange, render, state, today } from './store';
import { esc } from './util';

interface At {
  line?: number;
  offset?: number;
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
    const entry = await storage.write(path, text, notes.mtime);
    notes.diff = lineDiff(notes.saved, text) ?? undefined;
    notes.saved = text;
    notes.mtime = entry.mtime;
    await index.refreshFile(path);
    setStatus('Saved');
    refreshSide();
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
    notes.handle = createEditor({ text: raw, crlf, today, onChange, onSave: () => void flush() });
  } catch (e) {
    notes.handle?.destroy();
    notes.handle = undefined;
    notes.path = undefined;
    state.error = `Could not open ${path}. ${errorMessage(e)}`;
  }
  state.screen = 'notes';
  render();
}

function onChange(): void {
  schedule();
  window.clearTimeout(notes.sideTimer);
  notes.sideTimer = window.setTimeout(refreshSide, 300);
}

/* ---------- rendering ---------- */

function listHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  const q = notes.filter.trim().toLowerCase();
  const all = [...idx.notes.values()]
    .filter((n) => !q || n.path.toLowerCase().includes(q) || n.title.toLowerCase().includes(q))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!all.length) return '<p class="muted small">No notes match.</p>';
  let h = '';
  let folder: string | undefined;
  for (const n of all) {
    const d = dirname(n.path);
    if (d !== folder) {
      folder = d;
      h += `<div class="folder mono">${esc(d ? `${d}/` : '(top level)')}</div>`;
    }
    h += `<button class="item note-item" data-note="${esc(n.path)}" aria-current="${n.path === notes.path}"><span>${esc(n.title)}</span></button>`;
  }
  return h;
}

function bannerHtml(): string {
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
    rows.push(`<dt><label for="prop-due">due</label></dt><dd><input id="prop-due" class="inp" type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '')}"></dd>`);
  }
  for (const [k, v] of Object.entries(fm)) {
    if (k === 'status' || k === 'due') continue;
    const val = Array.isArray(v) ? v.map((x) => `<span class="chip mono">${esc(String(x))}</span>`).join(' ') : esc(String(v));
    rows.push(`<dt>${esc(k)}</dt><dd>${val}</dd>`);
  }
  out += rows.length ? `<dl class="props">${rows.join('')}</dl>` : '<p class="muted small" style="margin:0 0 6px">No properties yet.</p>';
  const add: string[] = [];
  if (!hasStatus) add.push('<button class="btn small" data-act="add-prop" data-key="status" data-val="todo">+ Status</button>');
  if (!hasDue) add.push(`<button class="btn small" data-act="add-prop" data-key="due" data-val="${esc(addDays(today(), 7))}">+ Due date</button>`);
  return out + (add.length ? `<div class="row-gap">${add.join('')}</div>` : '');
}

function sideHtml(): string {
  const idx = state.index;
  if (!notes.path || !idx) return '<h2>Note</h2><p class="muted small" style="margin:0">Open a note to see its properties, links and what changed.</p>';
  const back = idx.backlinks(notes.path);
  let h = `<h2>Properties <button class="btn small" data-act="yaml" aria-pressed="${notes.yaml}">${notes.yaml ? 'Show form' : 'Show YAML'}</button></h2>${propsHtml()}`;
  h += '<h2 style="margin-top:16px">Linked from</h2>';
  h += back.length
    ? `<ul class="plain">${back.map((b) => `<li><button class="link mono" data-open="${esc(b.from)}" data-line="${b.line}">${esc(b.from)}:${b.line}</button></li>`).join('')}</ul>`
    : '<p class="muted small" style="margin:0">No other note links here.</p>';
  return h + diffHtml();
}

export function refreshSide(): void {
  const el = document.getElementById('note-side');
  if (el) el.innerHTML = sideHtml();
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  let main: string;
  if (!notes.path) {
    main =
      '<div class="empty">Choose a note on the left, or make a new one. Notes are plain markdown files. ' +
      'Type <code>- [ ] </code> for a checkbox, <code>#</code> for a heading, and press X-ray to see the raw text.</div>';
  } else {
    const n = idx.notes.get(notes.path);
    main =
      `<div class="ed-head"><div style="min-width:0"><h2 class="title">${esc(n?.title ?? notes.path)}</h2><div class="mono muted small path">${esc(notes.path)}</div></div>` +
      `<div class="ed-actions"><button class="btn" data-act="xray" aria-pressed="${notes.xray}">X-ray</button>` +
      `<span id="note-status" class="status" role="status">${esc(notes.status)}</span></div></div>` +
      `<div id="note-banner">${bannerHtml()}</div><div id="editor-slot" class="editor-slot"></div>`;
  }
  return (
    '<div class="frame notes">' +
    `<aside class="side"><div class="side-head"><input id="note-filter" class="inp" type="text" placeholder="Filter notes" aria-label="Filter notes" value="${esc(notes.filter)}">` +
    '<button class="btn primary" data-act="new-note">+ New note</button></div>' +
    `<div id="note-list" class="note-list">${listHtml()}</div></aside>` +
    `<section class="main editor-main">${main}</section>` +
    `<aside class="source" id="note-side">${sideHtml()}</aside></div>`
  );
}

/** Call after the screen's HTML is in the page: puts the live editor into its slot. */
export function afterRender(refocus: boolean): void {
  const slot = document.getElementById('editor-slot');
  const h = notes.handle;
  if (!slot || !h) return;
  slot.appendChild(h.host);
  const p = notes.pending;
  notes.pending = {};
  if (p.line) h.goToLine(p.line);
  else if (p.offset !== undefined) h.goToOffset(p.offset);
  else if (refocus) h.focus();
  h.setXray(notes.xray);
}

/** True if the editor has the keyboard focus, so a redraw can give it back. */
export function hadFocus(): boolean {
  return !!notes.handle && notes.handle.hasFocus();
}

/* ---------- events ---------- */

function applyProperty(key: string, value: string | null): void {
  const h = notes.handle;
  if (!h) return;
  h.applyText(setFrontmatterField(h.getText(), key, value));
  refreshSide();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const item = target.closest<HTMLElement>('[data-note]')?.dataset.note;
  if (item) {
    await openNote(item);
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
    case 'add-prop':
      applyProperty(act.dataset.key ?? '', act.dataset.val ?? '');
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
    const list = document.getElementById('note-list');
    if (list) list.innerHTML = listHtml();
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
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
