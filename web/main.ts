import { fsaSupported, FsaStorage } from '../src/fsa-storage';
import * as board from './board';
import * as explore from './explore';
import * as guide from './guide';
import * as health from './health';
import * as newmenu from './newmenu';
import * as notes from './notes';
import * as projectScreen from './project';
import * as rename from './rename';
import * as search from './search';
import * as suggest from './suggest';
import { searchState } from './search';
import {
  healthCount,
  cancelLoad,
  lastScanAt,
  loadContext,
  loading,
  paintProgress,
  loadVault,
  openFolder,
  openSample,
  render as requestRender,
  reopenSaved,
  rescan,
  resumeSaved,
  setRenderer,
  state,
  type ScreenId,
} from './store';
import * as todayScreen from './today';
import { esc } from './util';

const app = document.getElementById('app') as HTMLElement;

/* ---------- theme ---------- */

type ThemeSetting = 'light' | 'dark' | 'system';

function themeSetting(): ThemeSetting {
  const set = document.documentElement.getAttribute('data-theme');
  return set === 'light' || set === 'dark' ? set : 'system';
}

/** Light, dark, or follow the system. The choice is remembered on this device. */
function setTheme(next: ThemeSetting): void {
  if (next === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', next);
  try {
    if (next === 'system') localStorage.removeItem('plainfile-theme');
    else localStorage.setItem('plainfile-theme', next);
  } catch {
    /* private window: the choice just lasts for this visit */
  }
  requestRender();
}

function themeControl(): string {
  const cur = themeSetting();
  const btn = (v: ThemeSetting, label: string, title: string): string =>
    `<button data-theme-set="${v}" aria-pressed="${cur === v}" title="${title}">${label}</button>`;
  return (
    '<div class="seg theme-seg" role="group" aria-label="Color theme">' +
    btn('light', 'Light', 'Always light') +
    btn('dark', 'Dark', 'Always dark') +
    btn('system', 'Auto', 'Follow your device setting') +
    '</div>'
  );
}

/* ---------- screens ---------- */

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'projects', label: 'Projects' },
  { id: 'board', label: 'Board' },
  { id: 'notes', label: 'Notes' },
  { id: 'explore', label: 'Explore' },
  { id: 'search', label: 'Search' },
  { id: 'health', label: 'Vault health' },
];

async function go(screen: ScreenId): Promise<void> {
  await notes.flush();
  state.error = '';
  state.screen = screen;
  state.modal = undefined;
  requestRender();
  if (screen === 'search') document.getElementById('search-q')?.focus();
}

const REPO = 'https://github.com/adambeltz2/Simple-Productivity';

function footer(): string {
  return (
    '<footer class="foot">' +
    `<span class="mono">Plainfile v${esc(__APP_VERSION__)}</span>` +
    `<a href="${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">What is new</a>` +
    `<a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>` +
    (state.index ? '<button class="link" data-nav="guide">Cheat sheet</button>' : '') +
    '</footer>'
  );
}

function landing(): string {
  const supported = fsaSupported();
  let h = `<div class="theme-corner">${themeControl()}</div><main class="landing"><h1>Plainfile</h1>`;
  h += '<p>One place for the tasks and notes in a folder of plain markdown files. Your files stay yours. Nothing is uploaded.</p>';
  if (state.busy) {
    h +=
      `<div class="notice loading" role="status" aria-live="polite"><b>Reading ${esc(loading.name)}…</b>` +
      '<progress id="load-bar" aria-label="Reading progress"></progress>' +
      '<div id="load-text" class="small">Looking through the folder…</div><div id="load-time" class="muted small">0 s</div>' +
      '<p class="muted small" style="margin:6px 0">A big folder can take a minute or more the first time, especially on a phone. Nothing is uploaded and nothing in your folder is changed.</p>' +
      '<button class="btn" data-act="load-cancel">Cancel</button></div>';
    return `${h}</main>${footer()}`;
  }
  if (state.error) h += `<div class="notice err">${esc(state.error)}</div>`;
  h += '<div class="row">';
  if (supported && state.saved) {
    h += `<button class="btn primary" data-act="reopen">Reopen ${esc(state.saved.name)}</button>`;
    h += '<button class="btn" data-act="open">Open a different folder</button>';
  } else if (supported) {
    h += '<button class="btn primary" data-act="open">Open a folder</button>';
  }
  h += `<button class="btn${supported ? '' : ' primary'}" data-act="demo">Try the sample vault</button></div>`;
  if (!supported) {
    h +=
      '<div class="notice">Opening a folder needs Chrome, Edge, Brave or Opera on a desktop computer. ' +
      'Other browsers can still try the sample vault. Support for them is planned.</div>';
  }
  return `${h}</main>${footer()}`;
}

function shell(): string {
  const hc = healthCount();
  const focusing = state.screen === 'notes' && notes.notes.focus && !!notes.notes.path;
  let h = `<div class="wrap${focusing ? ' focus' : ''}"><header class="bar"><h1>Plainfile</h1>`;
  h += `<span class="tag-pill${state.demo ? '' : ' inv'}" title="${esc(state.name)}">${esc(state.name)}</span>`;
  h += '<nav class="nav" aria-label="Screens">';
  for (const n of NAV) {
    h += `<button class="navbtn" data-nav="${n.id}" aria-current="${state.screen === n.id}">${n.label}${n.id === 'health' && hc ? ` <span class="badge">${hc}</span>` : ''}</button>`;
  }
  h += '</nav><span class="grow"></span>';
  h += '<button class="btn primary" data-act="new">+ New</button>';
  h += '<button class="btn" data-act="rescan">Rescan</button>';
  if (fsaSupported()) h += '<button class="btn" data-act="open">Open folder</button>';
  h += `<button class="btn" data-nav="guide" aria-label="Syntax cheat sheet" title="Syntax cheat sheet" aria-current="${state.screen === 'guide'}">?</button>${themeControl()}</header>`;
  if (state.error) h += `<div class="notice err">${esc(state.error)}</div>`;
  if (state.renames.length && state.screen !== 'rename') {
    const r = state.renames[0]!;
    h += `<div class="notice">Found during rescan: <span class="mono">${esc(r.from)}</span> was renamed to <span class="mono">${esc(r.to)}</span> outside Plainfile, so links to it are broken. <button class="btn small" data-act="review-renames">Review${state.renames.length > 1 ? ` (${state.renames.length})` : ''}</button></div>`;
  }
  switch (state.screen) {
    case 'projects':
      h += projectScreen.html();
      break;
    case 'board':
      h += board.html();
      break;
    case 'guide':
      h += guide.html();
      break;
    case 'explore':
      h += explore.html();
      break;
    case 'rename':
      h += rename.html();
      break;
    case 'notes':
      h += notes.html();
      break;
    case 'search':
      h += search.html();
      break;
    case 'health':
      h += health.html();
      break;
    default:
      h += todayScreen.html();
  }
  return `${h}${footer()}</div>`;
}

function render(): void {
  suggest.close();
  const active = document.activeElement as HTMLInputElement | HTMLElement | null;
  const focusId = active && active !== document.body ? active.id : '';
  const key = active?.dataset?.toggle
    ? `[data-toggle="${CSS.escape(active.dataset.toggle)}"]`
    : active?.dataset?.id
      ? `[data-id="${CSS.escape(active.dataset.id)}"]`
      : '';
  const selStart = 'selectionStart' in (active ?? {}) ? (active as HTMLInputElement).selectionStart : null;
  const selEnd = 'selectionEnd' in (active ?? {}) ? (active as HTMLInputElement).selectionEnd : null;
  const editorFocus = state.screen === 'notes' && notes.hadFocus();

  app.innerHTML = (state.index && !state.busy ? shell() : landing()) + newmenu.html();

  paintProgress();
  if (state.index && state.screen === 'notes') notes.afterRender(editorFocus);
  if (focusId && !editorFocus) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      try {
        if (selStart !== null && selEnd !== null) el.setSelectionRange(selStart, selEnd);
      } catch {
        /* inputs such as date have no selection */
      }
    }
  } else if (key && !editorFocus) app.querySelector<HTMLElement>(key)?.focus();
  const modal = app.querySelector<HTMLElement>('.modal');
  if (modal && !modal.contains(document.activeElement)) modal.querySelector<HTMLElement>('input, button')?.focus();
}

setRenderer(render);

/* ---------- events ---------- */

app.addEventListener('click', (e) => {
  void (async () => {
    const target = e.target as HTMLElement;
    if (state.modal && (await newmenu.click(target))) return;

    const pj = target.closest<HTMLElement>('[data-open-project]')?.dataset.openProject;
    if (pj) return projectScreen.openProject(pj);
    const cp = target.closest<HTMLElement>('[data-copy]');
    if (cp) return void guide.copy(cp);
    if (state.screen === 'explore' && (await explore.click(target))) return;
    const sc = target.closest<HTMLElement>('[data-scroll]')?.dataset.scroll;
    if (sc) return guide.scrollTo(sc);
    const sq = target.closest<HTMLElement>('[data-search-q]')?.dataset.searchQ;
    if (sq !== undefined) {
      searchState.q = sq;
      return void go('search');
    }

    const theme = target.closest<HTMLElement>('[data-theme-set]')?.dataset.themeSet as ThemeSetting | undefined;
    if (theme) return setTheme(theme);

    const nav = target.closest<HTMLElement>('[data-nav]')?.dataset.nav as ScreenId | undefined;
    if (nav) return void go(nav);

    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    switch (act) {
      case 'open':
        return void openFolder();
      case 'reopen':
        return void reopenSaved();
      case 'demo':
        return void openSample(__SAMPLE_VAULT__);
      case 'new':
        return newmenu.openNew();
      case 'load-cancel':
        return cancelLoad();
      case 'new-note':
        return newmenu.openTemplate('Note');
      case 'new-task-file':
        return newmenu.openTemplate('Task');
      case 'proj-task':
      case 'proj-note': {
        const path = target.closest<HTMLElement>('[data-act]')?.dataset.path ?? '';
        const n = state.index?.notes.get(path);
        if (!n) return;
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const projectName = n.name.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : n.name;
        return newmenu.openTemplate(act === 'proj-task' ? 'Project task' : 'Project note', { projectDir: dir, projectName });
      }
      case 'explore-note':
        return void (notes.notes.path && explore.focus(notes.notes.path));
      case 'rename-note':
        return void rename.openRename(notes.notes.path);
      case 'review-renames':
        return void rename.openRename(undefined, 'out');
      case 'rescan': {
        await rescan();
        if (state.selected) await loadContext(state.selected).catch(() => undefined);
        await notes.checkExternal();
        return requestRender();
      }
    }

    const open = target.closest<HTMLElement>('[data-open]');
    if (open?.dataset.open) {
      return void notes.openNote(open.dataset.open, { line: open.dataset.line ? Number(open.dataset.line) : undefined });
    }
    const folder = target.closest<HTMLElement>('[data-folder]')?.dataset.folder;
    if (folder) {
      notes.notes.filter = `${folder}/`;
      return void go('notes');
    }

    switch (state.screen) {
      case 'today':
        await todayScreen.click(target);
        break;
      case 'projects':
        await projectScreen.click(target);
        break;
      case 'board':
        await board.click(target);
        break;
      case 'rename':
        await rename.click(target);
        break;
      case 'notes':
        await notes.click(target);
        break;
      case 'search':
        await search.click(target);
        break;
      case 'health':
        await health.click(target);
        break;
    }
  })();
});

app.addEventListener('submit', (e) => {
  const form = e.target as HTMLElement;
  if (form.matches('[data-quick]')) {
    e.preventDefault();
    void todayScreen.submitQuick();
  }
});

app.addEventListener('input', (e) => {
  suggest.onInput(e);
  if (state.modal && newmenu.input(e)) return;
  if (todayScreen.input(e)) return;
  if (explore.input(e)) return;
  if (rename.input(e)) return;
  if (notes.input(e)) return;
  search.input(e);
});

app.addEventListener('change', (e) => {
  if (rename.change(e)) return;
  notes.change(e);
});

app.addEventListener('dragstart', (e) => board.dragStart(e));
app.addEventListener('dragover', (e) => board.dragOver(e));
app.addEventListener('drop', (e) => board.drop(e));
app.addEventListener('dragend', () => board.dragEnd());

// CodeMirror closes its suggestion list while handling Escape, before this page-level handler runs,
// so note whether one was open at the start of the key press.
let listOpenAtEscape = false;
app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') listOpenAtEscape = !!document.querySelector('.cm-tooltip-autocomplete, .date-menu');
}, true);

app.addEventListener('focusin', (e) => suggest.onFocus(e));
app.addEventListener('focusout', (e) => suggest.onBlur(e));

app.addEventListener('keydown', (e) => {
  if (suggest.onKeydown(e)) return;
  if (e.key === 'Escape' && state.modal) {
    newmenu.closeModal();
    return;
  }
  if (e.key === 'Escape' && state.screen === 'notes' && notes.notes.focus && !listOpenAtEscape) {
    notes.notes.focus = false;
    notes.notes.wantFocus = true;
    requestRender();
    return;
  }
  if (state.modal && e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
    e.preventDefault();
    const primary = app.querySelector<HTMLElement>('.modal .btn.primary');
    primary?.click();
    return;
  }
  if (state.screen === 'today') todayScreen.keydown(e);
  if (state.screen === 'explore') explore.keydown(e);
});

// Another editor or a sync tool may have changed files while this tab was in the background.
window.addEventListener('focus', () => {
  if (!state.index || state.demo || state.busy) return;
  if (Date.now() - lastScanAt < 30_000) return; // reading a big folder is slow on a phone; the Rescan button is always there
  void (async () => {
    const changed = await rescan();
    await notes.checkExternal();
    if (changed) {
      if (state.selected) await loadContext(state.selected).catch(() => undefined);
      requestRender();
    }
  })();
});

window.addEventListener('beforeunload', (e) => {
  if (notes.isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.index) {
    e.preventDefault();
    void go('search');
  }
});

window.__plainfile = {
  openHandle: (h, name) => loadVault(new FsaStorage(h), name ?? h.name, false),
};

requestRender();
void resumeSaved();

// Installable and available offline. The worker replaces the earlier Notebook app's, at the same address.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}
