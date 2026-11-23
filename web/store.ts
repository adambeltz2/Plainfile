import { addTaskNote } from '../src/capture';
import { localToday } from '../src/dates';
import { FsaStorage, fsaSupported } from '../src/fsa-storage';
import { checkHealth, type HealthReport } from '../src/health';
import { dirname, VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { listProjects, type Project } from '../src/projects';
import { findProject, parseQuickLine, type QuickLine } from '../src/quickline';
import type { VaultStorage } from '../src/storage';
import { loadTemplates, type Template } from '../src/templates';
import { StaleError } from '../src/writeback';
import { hasPermission, loadHandle, saveHandle } from './handle-store';
import { browserCache } from './index-cache';

export const SAMPLE_DAY = '2026-11-21';

export type ScreenId = 'home' | 'review' | 'insight' | 'recent' | 'today' | 'calendar' | 'people' | 'projects' | 'board' | 'notes' | 'explore' | 'search' | 'health' | 'rename' | 'guide' | 'changelog' | 'tasks';
export type TodayViewId = 'today' | 'upcoming' | 'inbox' | 'waiting' | 'all' | 'followups' | 'projects';

export type Modal =
  | { step: 'menu' }
  | { step: 'task'; text: string; due: string; tags: string; people: string; project: string; error: string; busy?: boolean }
  | { step: 'template'; name: string; values: Record<string, string>; extras: Record<string, string>; error: string; busy?: boolean };

export interface Context {
  path: string;
  start: number;
  lines: string[];
  hi: number;
}
export type Log = { path: string; line: number; before: string; after: string; written: boolean } | { message: string };

export const state = {
  storage: undefined as VaultStorage | undefined,
  index: undefined as VaultIndex | undefined,
  name: '',
  demo: false,
  screen: 'home' as ScreenId,
  scanMs: 0,
  /** The user dismissed the notice about files that could not be read. */
  skippedHidden: false,
  saved: undefined as FileSystemDirectoryHandle | undefined,
  busy: '',
  error: '',
  templates: [] as Template[],
  /** Notes that vanished while an identical file appeared: renamed outside the app. */
  renames: [] as { from: string; to: string }[],
  modal: undefined as Modal | undefined,
  // Today
  view: 'today' as TodayViewId,
  tag: undefined as string | undefined,
  selected: undefined as string | undefined,
  context: undefined as Context | undefined,
  log: undefined as Log | undefined,
};

export const justDone = new Set<string>();

let renderer: () => void = () => undefined;
export function setRenderer(fn: () => void): void {
  renderer = fn;
}
export function render(): void {
  renderer();
}

const vaultChangeHooks: (() => void)[] = [];
export function onVaultChange(fn: () => void): void {
  vaultChangeHooks.push(fn);
}

export const today = (): string => (state.demo ? SAMPLE_DAY : localToday());

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A friendly message for a failed write, or null if the error is not one we recognise. */
export function writeFailure(e: unknown): string | null {
  if (e instanceof StaleError || (e instanceof Error && e.name === 'ConflictError')) {
    return 'That file changed on disk, so nothing was written. The list has been refreshed. Try again.';
  }
  return null;
}

/* ---------- vault ---------- */

/** Where a folder read has got to, shown as a progress bar so a big folder does not look stuck. */
export const loading = {
  name: '',
  phase: 'listing' as 'listing' | 'reading',
  found: 0,
  checked: 0,
  done: 0,
  total: 0,
  startedAt: 0,
  abort: undefined as AbortController | undefined,
};

const num = (n: number): string => n.toLocaleString();

/** Update the progress bar and text in place, without redrawing the page. */
export function paintProgress(): void {
  const bar = document.getElementById('load-bar') as HTMLProgressElement | null;
  const text = document.getElementById('load-text');
  const time = document.getElementById('load-time');
  if (!bar || !text) return;
  const l = loading;
  if (l.phase === 'reading' && l.total > 0) {
    bar.max = l.total;
    bar.value = l.done;
    text.textContent = `Reading notes: ${num(l.done)} of ${num(l.total)} (${Math.round((l.done / l.total) * 100)}%)`;
  } else if (l.phase === 'listing' && l.checked > 0 && l.found > 0) {
    bar.max = l.found;
    bar.value = l.checked;
    text.textContent = `Checking files: ${num(l.checked)} of ${num(l.found)}`;
  } else {
    bar.removeAttribute('value');
    text.textContent = l.found ? `Looking through the folder… ${num(l.found)} files found` : 'Looking through the folder…';
  }
  if (time) time.textContent = `${Math.round((Date.now() - l.startedAt) / 1000)} s`;
}

export function cancelLoad(): void {
  loading.abort?.abort();
}

export async function loadVault(storage: VaultStorage, name: string, demo: boolean): Promise<void> {
  const ctrl = new AbortController();
  Object.assign(loading, { name, phase: 'listing', found: 0, checked: 0, done: 0, total: 0, startedAt: Date.now(), abort: ctrl });
  state.busy = 'Reading your folder…';
  state.error = '';
  render();
  const ticker = window.setInterval(paintProgress, 1000);
  try {
    const index = new VaultIndex(storage, demo ? undefined : browserCache(name));
    const r = await index.scan({
      signal: ctrl.signal,
      onProgress: (p) => {
        if (p.phase === 'listing') Object.assign(loading, { phase: 'listing', found: p.found, checked: p.checked });
        else Object.assign(loading, { phase: 'reading', done: p.done, total: p.total });
        paintProgress();
      },
    });
    state.templates = await loadTemplates(storage);
    state.storage = storage;
    state.index = index;
    state.name = name;
    state.demo = demo;
    state.scanMs = r.ms;
    state.screen = 'home';
    state.selected = undefined;
    state.context = undefined;
    state.log = undefined;
    state.tag = undefined;
    state.modal = undefined;
    state.renames = [];
    state.skippedHidden = false;
    justDone.clear();
    for (const fn of vaultChangeHooks) fn();
  } catch (e) {
    // Cancelling is not an error: just go back to where we were.
    if (!(e instanceof Error && e.name === 'AbortError')) state.error = `Could not read that folder. ${errorMessage(e)}`.trim();
  } finally {
    window.clearInterval(ticker);
    loading.abort = undefined;
  }
  state.busy = '';
  render();
}

export async function openFolder(): Promise<void> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(handle);
    state.saved = handle;
    await loadVault(new FsaStorage(handle), handle.name, false);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      state.error = `Could not open that folder. ${errorMessage(e)}`.trim();
      render();
    }
  }
}

export async function reopenSaved(): Promise<void> {
  const h = state.saved;
  if (!h) return;
  if (await hasPermission(h, true)) await loadVault(new FsaStorage(h), h.name, false);
  else {
    state.error = 'Permission to open that folder was not granted.';
    render();
  }
}

export function openSample(sample: Record<string, string>): Promise<void> {
  return loadVault(new MemoryStorage(sample), 'Sample vault', true);
}

/** Re-read the folder. Returns true if anything changed. */
/** When the folder was last read, so returning to the tab does not re-read a big folder every time. */
export let lastScanAt = 0;

export async function rescan(): Promise<boolean> {
  if (!state.index) return false;
  lastScanAt = Date.now();
  const r = await state.index.scan();
  state.scanMs = r.ms;
  for (const p of r.renamed) if (!state.renames.some((x) => x.from === p.from && x.to === p.to)) state.renames.push(p);
  state.renames = state.renames.filter((x) => !state.index?.notes.has(x.from) && state.index?.notes.has(x.to));
  if (r.added.length + r.changed.length + r.removed.length === 0) return false;
  if (state.storage) state.templates = await loadTemplates(state.storage);
  if (state.selected && !state.index.getTask(state.selected)) {
    state.selected = undefined;
    state.context = undefined;
  }
  return true;
}

export async function resumeSaved(): Promise<void> {
  if (!fsaSupported()) return;
  const h = await loadHandle();
  if (!h) return;
  state.saved = h;
  if (await hasPermission(h, false)) await loadVault(new FsaStorage(h), h.name, false);
  else render();
}

/* ---------- derived ---------- */

let healthCache: { version: number; withSuggestions: boolean; report: HealthReport } | undefined;
/**
 * The vault health report, cached until the index changes. The navigation badge only needs counts,
 * so by default the "did you mean" suggestions are left out; the Health screen asks for them.
 */
export function getHealth(withSuggestions = false): HealthReport | undefined {
  const index = state.index;
  if (!index) return undefined;
  const c = healthCache;
  if (!c || c.version !== index.version || (withSuggestions && !c.withSuggestions)) {
    healthCache = { version: index.version, withSuggestions, report: checkHealth(index, { suggestions: withSuggestions }) };
  }
  return healthCache?.report;
}

export function healthCount(): number {
  const h = getHealth();
  return h ? h.unresolved.length + h.ambiguous.length + h.duplicates.length + h.orphans.length + h.missingEmbeds.length : 0;
}

/* ---------- capture ---------- */

/** Quick add a task to the Inbox. Returns an error message, or null on success. */
/** Split "launch, home #work" into ["launch", "home", "work"]. */
export function words(s: string): string[] {
  return s.split(/[\s,]+/).map((x) => x.replace(/^[#@]/, '')).filter(Boolean);
}

/** The name a project goes by in `project:`, and the folder its task notes are filed in. */
export function projectRef(p: Project): { name: string; dir: string } {
  const dir = dirname(p.path);
  const file = (p.path.split('/').pop() ?? p.path).replace(/\.md$/i, '');
  return { name: file.toLowerCase() === 'index' && dir ? (dir.split('/').pop() as string) : file, dir };
}

/** Create a task as its own note (it also shows in the Inbox view). Returns an error message, or null on success. */
export async function quickAddTask(input: { title: string; due?: string; tags?: string[]; people?: string[]; project?: Project }): Promise<string | null> {
  const { storage, index } = state;
  if (!storage || !index) return 'Open a folder first.';
  try {
    const r = await addTaskNote(storage, index, { title: input.title, due: input.due || undefined, created: today(), tags: input.tags, people: input.people, project: input.project ? projectRef(input.project) : undefined });
    state.log = r;
    state.selected = r.taskId;
    state.context = undefined;
    return null;
  } catch (e) {
    return writeFailure(e) ?? errorMessage(e);
  }
}

/** Where a typed line will go, and what it means, so the preview and the save agree. */
export function planQuickLine(line: string, chosen = ''): { parsed: QuickLine; project?: Project; error?: string } {
  const parsed = parseQuickLine(line, today());
  // A +Project typed in the line wins; otherwise the project picked beside the box, if any.
  let project: Project | undefined = parsed.project === undefined && chosen && state.index ? listProjects(state.index).find((p) => p.path === chosen) : undefined;
  if (parsed.project !== undefined && state.index) {
    project = findProject(listProjects(state.index), parsed.project);
    if (!project) return { parsed, error: `No project called "${parsed.project}". Make it from + New, or leave off the +.` };
  }
  if (parsed.badDue) return { parsed, project, error: `Could not read "due:${parsed.badDue}". Try due:today, due:tomorrow, due:mon or due:2026-11-30.` };
  return { parsed, project };
}

/** Add one typed line such as "Call Dana +Website @dana due:friday" as a task note. Returns an error message, or null on success. */
export async function quickAddLine(line: string, chosen = ''): Promise<string | null> {
  if (!state.storage || !state.index) return 'Open a folder first.';
  const plan = planQuickLine(line, chosen);
  if (plan.error) return plan.error;
  const { parsed, project } = plan;
  return quickAddTask({ title: parsed.title || parsed.text, due: parsed.due, tags: parsed.tags, people: parsed.people, project });
}

export async function loadContext(id: string): Promise<void> {
  const t = state.index?.getTask(id);
  if (!t || !state.storage) {
    state.context = undefined;
    return;
  }
  const text = (await state.storage.read(t.path)).split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const start = Math.max(1, t.line - 3);
  const end = Math.min(text.length, t.line + 3);
  state.context = { path: t.path, start, lines: text.slice(start - 1, end), hi: t.line };
}
