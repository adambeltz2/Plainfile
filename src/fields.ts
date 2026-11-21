import { setFrontmatterField } from './frontmatter';
import type { VaultIndex } from './index';
import type { Note } from './parse';
import { listProjects, type Project } from './projects';
import { findProject } from './quickline';
import type { VaultStorage } from './storage';
import type { ChangeResult } from './writeback';

/**
 * Keeping frontmatter uniform without requiring it. Reading is tolerant: several spellings of a key or of
 * a status are understood, and a note that lacks a field simply has no value for it. Writing is canonical:
 * whatever the app writes uses the names and values below. The "tidy" fixes bring existing notes in line,
 * one guarded edit at a time, and are always optional.
 */
export type Status = 'todo' | 'doing' | 'waiting' | 'done';
export const STATUSES: Status[] = ['todo', 'doing', 'waiting', 'done'];

const STATUS_WORDS: Record<string, Status> = {
  todo: 'todo', 'to do': 'todo', 'to-do': 'todo', open: 'todo', backlog: 'todo', new: 'todo', 'not started': 'todo', planned: 'todo',
  doing: 'doing', 'in progress': 'doing', 'in-progress': 'doing', inprogress: 'doing', started: 'doing', wip: 'doing', active: 'doing',
  waiting: 'waiting', blocked: 'waiting', 'on hold': 'waiting', hold: 'waiting', 'waiting on': 'waiting',
  done: 'done', complete: 'done', completed: 'done', closed: 'done', finished: 'done', x: 'done',
};

/** A status as written, to one of the four the app uses. Undefined if it is not a word we know. */
export function normalizeStatus(raw: unknown): Status | undefined {
  return STATUS_WORDS[String(raw ?? '').trim().toLowerCase()];
}

/** Other spellings read for each canonical key. The canonical name is what gets written. */
export const ALIASES: Record<string, string[]> = {
  status: ['state'],
  due: ['deadline', 'due-date', 'due_date', 'duedate'],
  phase: ['milestone', 'section', 'stage'],
  people: ['owner', 'assignee', 'assigned', 'assigned-to'],
  project: ['projects'],
};

/** The value of a field under its canonical name or an alias, and which key it was found under. */
export function fieldOf(fm: Record<string, unknown>, canonical: string): { key: string; value: unknown } | undefined {
  for (const key of [canonical, ...(ALIASES[canonical] ?? [])]) if (fm[key] !== undefined && fm[key] !== null && fm[key] !== '') return { key, value: fm[key] };
  return undefined;
}

export function listOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,]+/) : v === undefined || v === null ? [] : [v];
  return list.map((x) => String(x).trim()).filter(Boolean);
}

/** `2026-11-23`, from `2026-11-23`, `Nov 23 2026` or `23 November 2026`. Undefined if it is not a date. */
export function normalizeDate(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(s)?.[1];
  if (iso) return iso;
  if (!/[A-Za-z]|\//.test(s)) return undefined;
  const t = Date.parse(`${s} 12:00`);
  if (!Number.isFinite(t)) return undefined;
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type IssueKind = 'missing-status' | 'status-value' | 'alias-key' | 'due-format' | 'project-name' | 'unknown-status' | 'unreadable-due';

export interface FieldIssue {
  id: string;
  path: string;
  title: string;
  kind: IssueKind;
  message: string;
  /** What the fix writes. Absent when a person has to decide. */
  fix?: { key: string; value: string | null; remove?: string; before: string; after: string };
}

const isTaskNote = (n: Note): boolean => !!n.fileTask || /(^|\/)tasks\//.test(n.path) || String(n.frontmatter.type ?? '').toLowerCase() === 'task';

/** What could be tidied in these notes' frontmatter. Only reports; it changes nothing. */
export function fieldIssues(index: VaultIndex, notes: Note[]): FieldIssue[] {
  const out: FieldIssue[] = [];
  const projects: Project[] = listProjects(index);
  const add = (n: Note, kind: IssueKind, message: string, fix?: FieldIssue['fix']): void => void out.push({ id: `${n.path}#${kind}:${fix?.key ?? ''}`, path: n.path, title: n.title, kind, message, fix });
  for (const n of notes) {
    const fm = n.frontmatter;
    if (isTaskNote(n)) {
      const st = fieldOf(fm, 'status');
      if (!st) add(n, 'missing-status', 'A task note without a status is not counted as a task.', { key: 'status', value: 'todo', before: '(no status)', after: 'status: todo' });
      else {
        const canon = normalizeStatus(st.value);
        if (!canon) add(n, 'unknown-status', `“${String(st.value)}” is not a status Plainfile knows (todo, doing, waiting, done).`, { key: 'status', value: 'todo', remove: st.key === 'status' ? undefined : st.key, before: `${st.key}: ${String(st.value)}`, after: 'status: todo' });
        else if (st.key !== 'status') add(n, 'alias-key', `Written as “${st.key}”. The standard name is “status”.`, { key: 'status', value: canon, remove: st.key, before: `${st.key}: ${String(st.value)}`, after: `status: ${canon}` });
        else if (String(st.value) !== canon) add(n, 'status-value', `“${String(st.value)}” is written as “${canon}”.`, { key: 'status', value: canon, before: `status: ${String(st.value)}`, after: `status: ${canon}` });
      }
      const due = fieldOf(fm, 'due');
      if (due) {
        const iso = normalizeDate(due.value);
        if (!iso) add(n, 'unreadable-due', `Could not read the date “${String(due.value)}”.`);
        else if (due.key !== 'due' || String(due.value) !== iso) add(n, due.key !== 'due' ? 'alias-key' : 'due-format', due.key !== 'due' ? `Written as “${due.key}”. The standard name is “due”.` : `“${String(due.value)}” is written as ${iso}.`, { key: 'due', value: iso, remove: due.key === 'due' ? undefined : due.key, before: `${due.key}: ${String(due.value)}`, after: `due: ${iso}` });
      }
    }
    for (const alias of ['phase', 'people'] as const) {
      const f = fieldOf(fm, alias);
      if (f && f.key !== alias && isTaskNote(n)) add(n, 'alias-key', `Written as “${f.key}”. The standard name is “${alias}”.`, { key: alias, value: Array.isArray(f.value) ? `[${f.value.map(String).join(', ')}]` : String(f.value), remove: f.key, before: `${f.key}: ${Array.isArray(f.value) ? `[${f.value.join(', ')}]` : String(f.value)}`, after: `${alias}: ${Array.isArray(f.value) ? `[${f.value.join(', ')}]` : String(f.value)}` });
    }
    const pr = fieldOf(fm, 'project');
    if (pr) {
      for (const name of listOf(pr.value)) {
        const p = findProject(projects, name);
        if (!p) add(n, 'project-name', `“${name}” is not a project that exists.`);
      }
    }
  }
  return out;
}

/** The note's text after a fix: the canonical key written, the alias removed. Everything else is untouched. */
export function applyFix(text: string, fix: NonNullable<FieldIssue['fix']>): string {
  let next = setFrontmatterField(text, fix.key, fix.value);
  if (fix.remove) next = setFrontmatterField(next, fix.remove, null);
  return next;
}

/** Make one fix on disk, guarded by the file's modified time. */
export async function applyFieldFix(storage: VaultStorage, index: VaultIndex, issue: FieldIssue): Promise<ChangeResult> {
  if (!issue.fix) throw new Error('That one needs a person to decide.');
  const stat = await storage.stat(issue.path);
  const text = await storage.read(issue.path);
  const next = applyFix(text, issue.fix);
  if (next !== text) await storage.write(issue.path, next, stat.mtime);
  await index.refreshFile(issue.path);
  return { path: issue.path, line: 1, before: issue.fix.before, after: issue.fix.after, written: next !== text };
}
