import { fsaSupported, FsaStorage } from '../src/fsa-storage';
import * as health from './health';
import * as newmenu from './newmenu';
import * as notes from './notes';
import * as search from './search';
import {
  healthCount,
  loadContext,
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

function isDark(): boolean {
  const set = document.documentElement.getAttribute('data-theme');
  return set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function toggleTheme(): void {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('plainfile-theme', next);
  } catch {
    /* private window: the choice just lasts for this visit */
  }
  requestRender();
}

/* ---------- screens ---------- */

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search' },
  { id: 'health', label: 'Vault health' },
];

async function go(screen: ScreenId): Promise<void> {
  await notes.flush();
  state.screen = screen;
  state.modal = undefined;
  requestRender();
  if (screen === 'search') document.getElementById('search-q')?.focus();
}

function landing(): string {
  const supported = fsaSupported();
  let h = '<main class="landing"><h1>Plainfile</h1>';
  h += '<p>One place for the tasks and notes in a folder of plain markdown files. Your files stay yours. Nothing is uploaded.</p>';
  if (state.busy) h += `<div class="notice">${esc(state.busy)}</div>`;
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
  return `${h}</main>`;
}

function shell(): string {
  const hc = healthCount();
  let h = '<div class="wrap"><header class="bar"><h1>Plainfile</h1>';
  h += `<span class="tag-pill${state.demo ? '' : ' inv'}" title="${esc(state.name)}">${esc(state.name)}</span>`;
  h += '<nav class="nav" aria-label="Screens">';
  for (const n of NAV) {
    h += `<button class="navbtn" data-nav="${n.id}" aria-current="${state.screen === n.id}">${n.label}${n.id === 'health' && hc ? ` <span class="badge">${hc}</span>` : ''}</button>`;
  }
  h += '</nav><span class="grow"></span>';
  h += '<button class="btn primary" data-act="new">+ New</button>';
  h += '<button class="btn" data-act="rescan">Rescan</button>';
  if (fsaSupported()) h += '<button class="btn" data-act="open">Open folder</button>';
  h += `<button class="btn" data-act="theme" aria-label="Switch to ${isDark() ? 'light' : 'dark'} mode">${isDark() ? 'Light' : 'Dark'}</button></header>`;
  if (state.error) h += `<div class="notice err">${esc(state.error)}</div>`;
  switch (state.screen) {
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
  return `${h}</div>`;
}

function render(): void {
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
      case 'theme':
        return toggleTheme();
      case 'new':
        return newmenu.openNew();
      case 'new-note':
        return newmenu.openTemplate('Note');
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
  if (state.modal && newmenu.input(e)) return;
  if (todayScreen.input(e)) return;
  if (notes.input(e)) return;
  search.input(e);
});

app.addEventListener('change', (e) => {
  notes.change(e);
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.modal) {
    newmenu.closeModal();
    return;
  }
  if (state.modal && e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
    e.preventDefault();
    const primary = app.querySelector<HTMLElement>('.modal .btn.primary');
    primary?.click();
    return;
  }
  if (state.screen === 'today') todayScreen.keydown(e);
});

// Another editor or a sync tool may have changed files while this tab was in the background.
window.addEventListener('focus', () => {
  if (!state.index || state.demo || state.busy) return;
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
