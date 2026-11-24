import { fsaSupported, FsaStorage } from '../src/fsa-storage';
import * as calendarScreen from './calendar';
import * as cloudUi from './cloud';
import * as explore from './explore';
import * as guide from './guide';
import * as changelogScreen from './changelog';
import * as health from './health';
import * as homeScreen from './home';
import * as reviewScreen from './review';
import * as reportUi from './report';
import * as newmenu from './newmenu';
import * as menu from './menu';
import * as move from './move';
import * as insightScreen from './insight';
import * as notes from './notes';
import * as peopleScreen from './people';
import * as palette from './palette';
import * as projectScreen from './project';
import { installDiagnostics } from './diagnostics';
import { install, installButton, listenForInstall } from './install';
import { ALL_PROJECTS } from '../src/projects';
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
  onVaultChange,
  openFolder,
  openSample,
  render as requestRender,
  quickAddLine,
  reopenSaved,
  rescan,
  resumeSaved,
  setRenderer,
  state,
  type ScreenId,
} from './store';
import * as todayScreen from './today';
import type { QuickView } from '../src/hub';
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

/** Which header tab is the current one. Tasks and Projects are both the project screen; the path tells them apart. */
function isCurrent(id: ScreenId): boolean {
  const onAll = state.screen === 'projects' && projectScreen.projectState.path === ALL_PROJECTS;
  if (id === 'tasks') return onAll;
  if (id === 'projects') return state.screen === 'projects' && !onAll;
  return state.screen === id || (id === 'search' && state.screen === 'explore');
}

/* ---------- screens ---------- */

/** The tabs used every day sit in the header; the rest are under More, so the bar stays short. */
const NAV: { id: ScreenId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'projects', label: 'Projects' },
  { id: 'notes', label: 'Notes' },
  { id: 'search', label: 'Search' },
];
const NAV_MORE: { id: ScreenId; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'people', label: 'People' },
  { id: 'insight', label: 'Insight' },
  { id: 'health', label: 'Vault health' },
];
/** Whether the header's More menu is open. */
let navMoreOpen = false;
/** The header's folder menu (Check for changes, Open another folder) is open. */
let hdrMenuOpen = false;

async function go(screen: ScreenId, view?: QuickView): Promise<void> {
  await notes.flush();
  // Tasks is the project hub over everything, and the place to start the day: it opens on Today. The old Today screen is that view.
  if (screen === 'today') return projectScreen.openTasks('today');
  if (screen === 'tasks') return projectScreen.openTasks(view ?? 'today');
  // The Projects tab shows the list of projects, not whichever project (or the all-tasks view) was open last.
  if (screen === 'projects') projectScreen.projectState.path = '';
  if (screen === 'review' && state.screen !== 'review') reviewScreen.startReview();
  state.error = '';
  // Choosing People shows the list of people, not whichever person you looked at last.
  if (screen === 'people') peopleScreen.openList();
  state.screen = screen;
  state.modal = undefined;
  if (screen === 'notes' && !notes.notes.path) {
    const last = notes.lastOpened();
    if (last) return notes.openNote(last);
  }
  requestRender();
  if (screen === 'search') document.getElementById('search-q')?.focus();
}

const REPO = 'https://github.com/adambeltz2/Plainfile';

function footer(): string {
  return (
    '<footer class="foot">' +
    `<span class="mono">Plainfile v${esc(__APP_VERSION__)}</span>` +
    (state.index
      ? `<span class="foot-stat mono muted" title="How many notes were read, and how long it took">${state.index.notes.size} notes · scanned in ${state.scanMs} ms${state.index.fromCache ? ` (${state.index.fromCache} from the saved copy)` : ''}${state.demo ? ' · sample date 21 Nov 2026' : ''}</span>`
      : '') +
    // The footer's links open in a new tab, so you do not lose your place.
    '<a href="?go=changelog" target="_blank" rel="noopener noreferrer">What is new</a>' +
    installButton() +
    `<a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>` +
    '</footer>'
  );
}

/** A page opened in its own tab (What is new from the footer, or ?go=guide) in its own tab, before any folder is open. */
const standalone = ((): '' | 'changelog' | 'guide' => {
  const g = new URLSearchParams(location.search).get('go');
  return g === 'changelog' || g === 'guide' ? g : '';
})();

function standalonePage(): string {
  const body = standalone === 'guide' ? guide.html() : changelogScreen.html();
  return `<div class="theme-corner">${themeControl()}</div><div class="wrap"><header class="bar"><h1>Plainfile</h1><a class="btn" href="./">Open Plainfile</a></header><div class="frame two" style="grid-template-columns:minmax(0,1fr)"><section class="main">${body}</section></div>${footer()}</div>`;
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
  h += `<button class="btn" data-act="demo">Try the sample vault</button></div>`;
  h += cloudUi.html();
  if (!supported) {
    h +=
      '<div class="notice">Opening a local folder needs Chrome, Edge, Brave or Opera on a desktop computer or an Android phone. ' +
      'In other browsers, connect Dropbox above, or try the sample vault.</div>';
  }
  return `${h}</main>${footer()}`;
}

/** The phone's More sheet and which side panels are open, so a redraw does not close them. */
let moreOpen = false;
const sideOpen = new Set<string>();
const SIDE_LABEL: Record<string, string> = {
  notes: 'All notes',
  search: 'Narrow by folder or tag',
  explore: 'Most connected notes',
};

/** The bottom tab bar for phones: the screens used all day, with the rest under More. */
function tabbar(hc: number): string {
  const open = state.index ? state.index.tasks().filter((t) => !t.done).length : 0;
  const tab = (id: ScreenId, label: string): string =>
    `<button class="tab-b" data-nav="${id}" aria-current="${isCurrent(id)}">${label}${id === 'tasks' && open ? ` <span class="badge" aria-label="${open} open task${open === 1 ? '' : 's'}">${open}</span>` : ''}</button>`;
  const sheet = moreOpen
    ? '<div class="more-back" data-act="more-close"><div class="more-sheet" role="dialog" aria-label="More">' +
      ['search:Search', 'calendar:Calendar', 'people:People', 'review:Weekly review', 'insight:Insight', 'health:Vault health', 'guide:Cheat sheet']
        .map((x) => {
          const [id, label] = x.split(':') as [ScreenId, string];
          const n = id === 'health' ? hc : id === 'tasks' ? open : 0;
          return `<button class="btn" data-nav="${id}" data-more-item>${label}${n ? ` <span class="badge"${id === 'tasks' ? ` aria-label="${n} open task${n === 1 ? '' : 's'}"` : ''}>${n}</span>` : ''}</button>`;
        })
        .join('') +
      '<button class="btn" data-act="rescan" data-more-item>Check for changes</button>' +
      (fsaSupported() ? '<button class="btn" data-act="open" data-more-item>Open another folder…</button>' : '') +
      `${themeControl()}<button class="btn" data-act="more-close">Close</button></div></div>`
    : '';
  return `<nav class="tabbar" aria-label="Main">${tab('home', 'Home')}${tab('tasks', 'Tasks')}${tab('projects', 'Projects')}${tab('notes', 'Notes')}<button class="tab-b" data-act="more-toggle" aria-expanded="${moreOpen}">More${hc ? ' •' : ''}</button></nav>${sheet}`;
}

function shell(): string {
  const hc = healthCount();
  /** Open tasks, for the small number on the Tasks tab. */
  const openTasks = state.index ? state.index.tasks().filter((t) => !t.done).length : 0;
  const focusing = state.screen === 'notes' && notes.notes.focus && !!notes.notes.path;
  let h = `<div class="wrap${focusing ? ' focus' : ''}${state.screen === 'notes' ? ' notes-wide' : ''}${state.screen === 'projects' ? ' hub-wide' : ''}"><header class="bar"><h1>Plainfile</h1>`;
  h += `<span class="tag-pill${state.demo ? '' : ' inv'}" title="${esc(state.name)}">${esc(state.name)}</span>`;
  h += '<nav class="nav" aria-label="Screens">';
  for (const n of NAV) {
    h += `<button class="navbtn" data-nav="${n.id}" aria-current="${isCurrent(n.id)}">${n.label}${n.id === 'tasks' && openTasks ? ` <span class="badge" title="${openTasks} open task${openTasks === 1 ? '' : 's'}" aria-label="${openTasks} open task${openTasks === 1 ? '' : 's'}">${openTasks}</span>` : ''}</button>`;
  }
  const inMore = NAV_MORE.some((n) => isCurrent(n.id));
  h +=
    `<span class="nav-more-wrap"><button class="navbtn nav-more" data-act="nav-more" aria-haspopup="menu" aria-expanded="${navMoreOpen}" aria-current="${inMore}">More${hc ? ` <span class="badge" title="${hc} thing${hc === 1 ? '' : 's'} to look at in Vault health" aria-label="${hc} thing${hc === 1 ? '' : 's'} to look at in Vault health">${hc}</span>` : ''}</button>` +
    (navMoreOpen
      ? `<div class="nav-menu" role="menu">${NAV_MORE.map((n) => `<button role="menuitem" data-nav="${n.id}" aria-current="${isCurrent(n.id)}">${n.label}${n.id === 'health' && hc ? ` <span class="badge">${hc}</span>` : ''}</button>`).join('')}</div>`
      : '') +
    '</span>';
  h += '</nav><span class="grow"></span>';
  h +=
    '<button class="btn" data-act="palette-open" title="Open a note, add a task, or run an action (Ctrl/Cmd+P)" aria-label="Add or go to">Add or go to…</button>';
  h += '<button class="btn primary" data-act="new">+ New</button>';
  const rest =
    `<span class="hdr-menu-wrap"><button class="btn" data-act="hdr-menu" aria-haspopup="menu" aria-expanded="${hdrMenuOpen}" aria-label="Folder actions" title="Check for changes, open another folder">⋯</button>` +
    (hdrMenuOpen
      ? '<div class="nav-menu hdr-menu" role="menu"><button role="menuitem" data-act="rescan"><span>Check for changes</span><span class="muted small">read the folder again</span></button>' +
        (fsaSupported() ? '<button role="menuitem" data-act="open"><span>Open another folder…</span></button>' : '') +
        '</div>'
      : '') +
    '</span>' +
    `<button class="btn" data-nav="guide" aria-label="Syntax cheat sheet" title="Syntax cheat sheet" aria-current="${state.screen === 'guide'}">?</button>${themeControl()}`;
  // On a phone these live in the More sheet of the bottom bar, so the header is only the name, Go to… and + New.
  h += `<span class="hdr-wide">${rest}</span></header>`;
  if (state.error) h += `<div class="notice err">${esc(state.error)}</div>`;
  if (state.index && state.index.notes.size === 0) {
    const s = state.index.summary();
    h +=
      `<div class="notice small" role="status"><b>No markdown notes were found in this folder.</b> Plainfile looked through ${s.files.toLocaleString()} file${s.files === 1 ? '' : 's'} in ${s.folders.toLocaleString()} folder${s.folders === 1 ? '' : 's'}, down to ${s.depth} level${s.depth === 1 ? '' : 's'} deep` +
      (s.types.length ? ` (types: ${s.types.map(([t, c]) => `.${esc(t)} ${c}`).join(', ')})` : '') +
      `. There is no limit on how deep notes can be. Only files ending in <code>.md</code> count${s.hidden ? `, and ${s.hidden} item${s.hidden === 1 ? '' : 's'} whose names start with a dot (such as <code>.git</code>) are hidden` : ''}. Try <b>Open folder</b> and pick the folder that directly holds your notes.</div>`;
  }
  const skipped = state.index?.skipped ?? [];
  if (skipped.length && !state.skippedHidden) {
    h +=
      `<div class="notice small" role="status"><b>${skipped.length} file${skipped.length === 1 ? '' : 's'} could not be read and ${skipped.length === 1 ? 'was' : 'were'} skipped.</b> The rest of your folder opened normally. ` +
      `<details><summary>Show ${skipped.length === 1 ? 'it' : 'them'}</summary><ul class="plain mono small">${skipped
        .slice(0, 50)
        .map((s) => `<li>${esc(s.path)} <span class="muted">${esc(s.reason)}</span></li>`)
        .join('')}${skipped.length > 50 ? `<li>and ${skipped.length - 50} more</li>` : ''}</ul></details> ` +
      '<button class="btn small" data-act="skipped-hide">Dismiss</button></div>';
  }
  if (state.renames.length && state.screen !== 'rename') {
    const r = state.renames[0]!;
    h += `<div class="notice">Found during rescan: <span class="mono">${esc(r.from)}</span> was renamed to <span class="mono">${esc(r.to)}</span> outside Plainfile, so links to it are broken. <button class="btn small" data-act="review-renames">Review${state.renames.length > 1 ? ` (${state.renames.length})` : ''}</button></div>`;
  }
  switch (state.screen) {
    case 'insight':
      h += insightScreen.html();
      break;
    case 'people':
      h += peopleScreen.html();
      break;
    case 'calendar':
      h += calendarScreen.html();
      break;
    case 'home':
      h += homeScreen.html();
      break;
    case 'review':
      h += reviewScreen.html();
      break;
    case 'projects':
      h += projectScreen.html();
      break;
    case 'guide':
      h += guide.html();
      break;
    case 'changelog':
      h += changelogScreen.html();
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
      h += homeScreen.html(); // 'today' is not a screen any more: the Tasks tab opens on its Today view
  }
  const hideBar = state.screen === 'notes' && !!notes.notes.path;
  return `${h}${footer()}${hideBar ? '' : tabbar(healthCount())}</div>`;
}

/**
 * On a phone a screen's side panel (views, folders, the note list) would push the work below the fold.
 * Each gets a button that opens it, and a side panel with nothing to say (no change to show) is left out.
 */
function foldSidePanels(): void {
  const key = state.screen;
  const side = app.querySelector<HTMLElement>('.frame > .side');
  if (side && SIDE_LABEL[key] && !side.querySelector('[data-side-toggle]')) {
    const open = sideOpen.has(key);
    side.classList.toggle('open', open);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'side-toggle btn';
    b.dataset.sideToggle = key;
    b.setAttribute('aria-expanded', String(open));
    b.textContent = `${SIDE_LABEL[key]} ${open ? '▴' : '▾'}`;
    side.prepend(b);
  }
  const src = app.querySelector<HTMLElement>('.frame > .source');
  if (src && key === 'today') src.classList.toggle('empty-source', !src.querySelector('.diff'));
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

  app.innerHTML =
    (state.index && !state.busy ? shell() : standalone && !state.busy ? standalonePage() : landing()) +
    newmenu.html() +
    move.html() +
    menu.html() +
    reportUi.html() +
    palette.html();

  paintProgress();
  foldSidePanels();
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
    if (!state.index && (await cloudUi.click(target))) return;
    if (target.closest('[data-quick-note]') && state.index && !state.modal) return newmenu.quickNote();
    if (await palette.click(target)) return;
    if (await reportUi.click(target)) return;
    const rp = target.closest<HTMLElement>('[data-report-open]');
    if (rp?.dataset.reportOpen) return reportUi.openReport(rp.dataset.reportOpen, rp.dataset.reportKind === 'book' ? 'book' : 'report');
    if (await move.click(target)) return;
    if (await menu.click(target)) return;
    if (state.modal && (await newmenu.click(target))) return;

    const who = target.closest<HTMLElement>('[data-person]')?.dataset.person;
    if (who && state.screen !== 'people') return peopleScreen.openPerson(who);
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

    if (target.closest('.more-sheet') && target.closest('[data-more-item]')) moreOpen = false;
    if (target.closest('[data-note]')) sideOpen.delete('notes'); // choosing a note folds the list again
    const toggle = target.closest<HTMLElement>('[data-side-toggle]')?.dataset.sideToggle;
    if (toggle) {
      if (sideOpen.has(toggle)) sideOpen.delete(toggle);
      else sideOpen.add(toggle);
      return requestRender();
    }
    // A click anywhere but the header More menu closes it, and the same for the folder menu (and after picking from it).
    if (navMoreOpen && !target.closest('.nav-more-wrap')) {
      navMoreOpen = false;
      requestRender();
    }
    if (hdrMenuOpen && (!target.closest('.hdr-menu-wrap') || target.closest('[role="menuitem"]'))) {
      hdrMenuOpen = false;
      requestRender();
    }
    const nav = target.closest<HTMLElement>('[data-nav]')?.dataset.nav as ScreenId | undefined;
    if (nav) {
      navMoreOpen = false;
      moreOpen = false;
      sideOpen.clear();
      return void go(nav, target.closest<HTMLElement>('[data-nav]')?.dataset.view as QuickView | undefined);
    }

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
      case 'nav-more':
        navMoreOpen = !navMoreOpen;
        hdrMenuOpen = false;
        return requestRender();
      case 'hdr-menu':
        hdrMenuOpen = !hdrMenuOpen;
        navMoreOpen = false;
        return requestRender();
      case 'more-toggle':
        moreOpen = !moreOpen;
        return requestRender();
      case 'more-close':
        moreOpen = false;
        return requestRender();
      case 'install':
        return void install();
      case 'palette-open':
        return palette.openPalette();
      case 'skipped-hide':
        state.skippedHidden = true;
        return requestRender();
      case 'load-cancel':
        return cancelLoad();
      case 'new-task-file':
        return newmenu.openTemplate('Task');
      case 'proj-task':
      case 'proj-note': {
        const path = target.closest<HTMLElement>('[data-act]')?.dataset.path ?? '';
        const n = state.index?.notes.get(path);
        if (!n) return;
        const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        const projectName = n.name.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : n.name;
        if (act === 'proj-task') return newmenu.openProjectTask(projectName);
        return newmenu.openTemplate('Project note', { projectDir: dir, projectName });
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
      if (state.screen === 'search') search.rememberCurrent();
      return void notes.openNote(open.dataset.open, { line: open.dataset.line ? Number(open.dataset.line) : undefined, find: open.dataset.find || undefined });
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
      case 'insight':
        await insightScreen.click(target);
        break;
      case 'people':
        await peopleScreen.click(target);
        break;
      case 'calendar':
        await calendarScreen.click(target);
        break;
      case 'home':
        await homeScreen.click(target);
        break;
      case 'review':
        await reviewScreen.click(target);
        break;
      case 'projects':
        await projectScreen.click(target);
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
  } else if (form.matches('[data-cal-add]')) {
    e.preventDefault();
    void calendarScreen.submitAdd();
  } else if (form.matches('[data-person-add]')) {
    e.preventDefault();
    notes.addPerson();
  } else if (form.matches('[data-proj-add]')) {
    e.preventDefault();
    notes.addProject();
  }
});

app.addEventListener('input', (e) => {
  suggest.onInput(e);
  if (!state.index && cloudUi.input(e)) return;
  if (palette.input(e)) return;
  if (move.input(e)) return;
  if (state.modal && newmenu.input(e)) return;
  if (state.screen === 'projects' && projectScreen.input(e)) return;
  if (state.screen === 'people' && peopleScreen.input(e)) return;
  if (state.screen === 'review' && reviewScreen.input(e)) return;
  if (state.screen === 'calendar' && calendarScreen.input(e)) return;
  if (todayScreen.input(e)) return;
  if (explore.input(e)) return;
  if (rename.input(e)) return;
  if (notes.input(e)) return;
  search.input(e);
});

app.addEventListener('change', (e) => {
  if (state.screen === 'projects' && projectScreen.change(e)) return;
  if (state.screen === 'insight' && insightScreen.change(e)) return;
  if ((state.screen === 'today' || state.screen === 'projects') && todayScreen.change(e)) return;
  if (state.screen === 'review' && reviewScreen.change(e)) return;
  if (state.screen === 'calendar' && calendarScreen.change(e)) return;
  if (rename.change(e)) return;
  notes.change(e);
});

app.addEventListener('dragstart', (e) => calendarScreen.dragStart(e));
app.addEventListener('dragover', (e) => calendarScreen.dragOver(e));
app.addEventListener('drop', (e) => calendarScreen.drop(e));
app.addEventListener('dragend', () => calendarScreen.dragEnd());

// CodeMirror closes its suggestion list while handling Escape, before this page-level handler runs,
// so note whether one was open at the start of the key press.
let listOpenAtEscape = false;
app.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') listOpenAtEscape = !!document.querySelector('.cm-tooltip-autocomplete, .date-menu');
  },
  true,
);

app.addEventListener('focusin', (e) => suggest.onFocus(e));
app.addEventListener('focusout', (e) => suggest.onBlur(e));

app.addEventListener('keydown', (e) => {
  if (state.screen === 'notes' && notes.titleKey(e)) return;
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
  if (state.screen === 'today' || state.screen === 'projects') todayScreen.keydown(e);
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

// Menus, the move dialog and the palette take the keys first, wherever the focus is.
document.addEventListener(
  'keydown',
  (e) => {
    if (palette.keydown(e) || move.keydown(e) || menu.keydown(e)) e.stopPropagation();
  },
  true,
);

// The header More menu closes on Escape. This is on the document because redrawing the header drops the focus.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (navMoreOpen || hdrMenuOpen)) {
    navMoreOpen = false;
    hdrMenuOpen = false;
    requestRender();
  }
});

document.addEventListener('keydown', (e) => {
  if (!state.index || state.busy) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
  const path = state.screen === 'notes' ? notes.notes.path : undefined;
  if (mod && !e.shiftKey && k === 'k') {
    e.preventDefault();
    void go('search');
  } else if (mod && !e.shiftKey && k === 'p') {
    e.preventDefault();
    palette.openPalette();
  } else if (mod && e.shiftKey && path && (k === 'm' || k === 'x' || k === 'e')) {
    e.preventDefault();
    void menu.run(k === 'm' ? 'move' : k === 'x' ? 'xray' : 'explore', path);
  } else if (e.altKey && !mod && e.code === 'KeyN') {
    e.preventDefault();
    void newmenu.quickNote();
  } else if (e.key === 'F2' && path) {
    e.preventDefault();
    void menu.run('rename', path);
  } else if (
    (state.screen === 'today' || (state.screen === 'projects' && !!projectScreen.projectState.path)) &&
    !state.modal &&
    !palette.pal.open &&
    todayScreen.listKey(e)
  ) {
    // handled: j and k move through the tasks, x ticks, e opens
  } else if (e.key === '?' && !typing && !mod && !state.modal && !palette.pal.open) {
    e.preventDefault();
    void go('guide');
  }
});

palette.setRunner(async (item) => {
  switch (item.kind) {
    case 'note':
      return notes.openNote(item.path);
    case 'create': {
      newmenu.openTemplate('Note');
      const m = state.modal;
      if (m?.step === 'template') {
        m.values.title = item.title;
        requestRender();
      }
      return;
    }
    case 'screen':
      return item.screen === 'tasks-all' ? go('tasks', 'all') : go(item.screen as ScreenId);
    case 'quick-note':
      return newmenu.quickNote();
    case 'add-task': {
      const err = await quickAddLine(item.line);
      if (err) state.error = err;
      else state.error = '';
      return requestRender();
    }
    case 'new-task':
      state.modal = { step: 'task', text: '', due: '', tags: '', people: '', project: '', priority: '', error: '' };
      return requestRender();
    default:
      return;
  }
});

app.addEventListener('contextmenu', (e) => {
  if (state.screen === 'notes') menu.contextMenu(e);
});

window.__plainfile = {
  openHandle: (h, name) => loadVault(new FsaStorage(h), name ?? h.name, false),
};

installDiagnostics();
listenForInstall();

// App shortcuts (the manifest's "New task", "Today", "Search") open the page with ?go=...: act on it once a folder is open.
const goParam = new URLSearchParams(location.search).get('go');
if (goParam && ['quick', 'today', 'search', 'changelog', 'guide'].includes(goParam)) {
  let done = false;
  onVaultChange(() => {
    if (done) return;
    done = true;
    history.replaceState(null, '', location.pathname);
    window.setTimeout(() => {
      void go(goParam === 'quick' ? 'home' : (goParam as ScreenId)).then(
        () => window.setTimeout(() => document.getElementById(goParam === 'quick' ? 'quick-text' : 'search-q')?.focus(), 60), // only the first two have a box to focus
      );
    }, 0);
  });
}
requestRender();
void (async () => {
  if (await cloudUi.finishConnect()) return;
  await resumeSaved();
})();

// Installable and available offline. The worker replaces the earlier Notebook app's, at the same address.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}
