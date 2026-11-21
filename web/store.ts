import { addTask } from '../src/capture';
import { localToday } from '../src/dates';
import { FsaStorage, fsaSupported } from '../src/fsa-storage';
import { checkHealth, type HealthReport } from '../src/health';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import type { VaultStorage } from '../src/storage';
import { loadTemplates, type Template } from '../src/templates';
import { StaleError, type ChangeResult } from '../src/writeback';
import { hasPermission, loadHandle, saveHandle } from './handle-store';

export const SAMPLE_DAY = '2026-11-21';

export type ScreenId = 'today' | 'board' | 'notes' | 'search' | 'health' | 'rename' | 'guide';
export type TodayViewId = 'today' | 'upcoming' | 'inbox' | 'waiting' | 'all' | 'followups' | 'projects';

export type Modal =
  | { step: 'menu' }
  | { step: 'task'; text: string; due: string; tags: string; people: string; error: string }
  | { step: 'template'; name: string; values: Record<string, string>; extras: Record<string, string>; error: string };

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
  screen: 'today' as ScreenId,
  scanMs: 0,
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

export async function loadVault(storage: VaultStorage, name: string, demo: boolean): Promise<void> {
  state.busy = 'Reading your folder…';
  state.error = '';
  render();
  try {
    const index = new VaultIndex(storage);
    const r = await index.scan();
    state.templates = await loadTemplates(storage);
    state.storage = storage;
    state.index = index;
    state.name = name;
    state.demo = demo;
    state.scanMs = r.ms;
    state.screen = 'today';
    state.selected = undefined;
    state.context = undefined;
    state.log = undefined;
    state.tag = undefined;
    state.modal = undefined;
    state.renames = [];
    justDone.clear();
    for (const fn of vaultChangeHooks) fn();
  } catch (e) {
    state.error = `Could not read that folder. ${errorMessage(e)}`.trim();
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
export async function rescan(): Promise<boolean> {
  if (!state.index) return false;
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

let healthCache: { version: number; report: HealthReport } | undefined;
export function getHealth(): HealthReport | undefined {
  const index = state.index;
  if (!index) return undefined;
  if (healthCache?.version !== index.version) healthCache = { version: index.version, report: checkHealth(index) };
  return healthCache.report;
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

export async function quickAdd(text: string, due: string, tags = '', people = ''): Promise<string | null> {
  const { storage, index } = state;
  if (!storage || !index) return 'Open a folder first.';
  try {
    const r: ChangeResult = await addTask(storage, index, { text, due: due || undefined, created: today(), tags: words(tags), people: words(people) });
    state.log = r;
    state.selected = `${r.path}:${r.line}`;
    state.context = undefined;
    return null;
  } catch (e) {
    return writeFailure(e) ?? errorMessage(e);
  }
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
