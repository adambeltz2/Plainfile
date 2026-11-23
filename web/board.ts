import { fmtDate } from '../src/dates';
import { setTaskStatus } from '../src/writeback';
import { errorMessage, rescan, render, state, today, writeFailure, type Log } from './store';
import { openNote } from './notes';
import { esc } from './util';

const BASE = ['todo', 'doing', 'waiting', 'done'];

export const boardState = { project: '', log: undefined as Log | undefined };

function projectOf(path: string): string {
  const p = state.index?.notes.get(path)?.frontmatter.project;
  return typeof p === 'string' ? p : '';
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const all = idx.tasks().filter((t) => t.kind === 'file');
  const projects = [...new Set(all.map((t) => projectOf(t.path)).filter(Boolean))].sort();
  if (boardState.project && !projects.includes(boardState.project)) boardState.project = '';
  const tasks = boardState.project ? all.filter((t) => projectOf(t.path) === boardState.project) : all;
  const extra = [...new Set(tasks.map((t) => t.status ?? '').filter((s) => s && !BASE.includes(s)))].sort();
  const cols = [...BASE, ...extra];

  let h = '<div class="frame two"><aside class="side"><div><h2>Project</h2><ul>';
  h += `<li><button class="item" data-project="" aria-current="${boardState.project === ''}">All task files <span class="n">${all.length}</span></button></li>`;
  for (const p of projects) {
    h += `<li><button class="item mono" data-project="${esc(p)}" aria-current="${boardState.project === p}">${esc(p)} <span class="n">${all.filter((t) => projectOf(t.path) === p).length}</span></button></li>`;
  }
  h += '</ul></div><div class="stat">Group by status</div></aside><section class="main">';
  h += `<div class="ed-head"><div><h2 class="title">${esc(boardState.project || 'Board')}</h2><p class="meta" style="margin:0">Each card is a task file. Drag a card to another column, or use the arrows, and its <span class="mono">status:</span> line changes.</p></div>`;
  h += '<div class="ed-actions"><button class="btn primary" data-act="new-task-file">+ Task file</button></div></div>';

  if (!all.length) {
    h +=
      '<div class="empty">No task files yet. A task file is a note with a <code>status:</code> line in a <code>tasks/</code> folder. ' +
      'Create one with + Task file. Checkbox tasks inside notes appear in Today.</div></section></div>';
    return h;
  }
  h += `<div class="board" style="--cols:${cols.length}">`;
  for (const status of cols) {
    const cards = tasks.filter((t) => t.status === status).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title));
    h += `<section class="col" data-col="${esc(status)}" aria-label="${esc(status)}"><h3>${esc(status)} <span>${cards.length}</span></h3>`;
    for (const t of cards) {
      const late = !!t.due && t.due < today() && status !== 'done';
      const i = cols.indexOf(status);
      h +=
        `<div class="card${status === 'done' ? ' done' : ''}" draggable="true" data-card="${esc(t.id)}">` +
        `<div class="t">${esc(t.title)}</div><div class="chips">` +
        (t.due ? `<span class="chip${late ? ' late' : ''}">${late ? 'Overdue · ' : ''}${esc(fmtDate(t.due))}</span>` : '') +
        t.tags.map((g) => `<span class="chip mono">#${esc(g)}</span>`).join('') +
        `</div><div class="card-acts">` +
        `<button class="btn small" data-move="${esc(t.id)}" data-to="${esc(cols[i - 1] ?? '')}" aria-label="Move ${esc(t.title)} to ${esc(cols[i - 1] ?? '')}"${i === 0 ? ' disabled' : ''}>←</button>` +
        `<button class="btn small" data-move="${esc(t.id)}" data-to="${esc(cols[i + 1] ?? '')}" aria-label="Move ${esc(t.title)} to ${esc(cols[i + 1] ?? '')}"${i === cols.length - 1 ? ' disabled' : ''}>→</button>` +
        `<button class="btn small" data-open="${esc(t.path)}">Open</button></div></div>`;
    }
    h += '</section>';
  }
  h += '</div>';
  const log = boardState.log;
  if (log) {
    if ('message' in log) h += `<div class="diff plain"><div class="cap">Not saved</div>${esc(log.message)}</div>`;
    else if (log.written) {
      h +=
        `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(log.path)}:${log.line}</div>` +
        `<div class="del"><span class="sg">−</span><span>${esc(log.before)}</span></div>` +
        `<div class="add"><span class="sg">+</span><span>${esc(log.after)}</span></div></div>`;
    }
  }
  return `${h}</section></div>`;
}

export async function move(id: string, status: string): Promise<void> {
  const { storage, index } = state;
  if (!storage || !index || !status) return;
  try {
    boardState.log = await setTaskStatus(storage, index, id, status, { completedOn: today() });
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    boardState.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const proj = target.closest<HTMLElement>('[data-project]');
  if (proj) {
    boardState.project = proj.dataset.project ?? '';
    render();
    return true;
  }
  const mv = target.closest<HTMLButtonElement>('[data-move]');
  if (mv && !mv.disabled) {
    await move(mv.dataset.move ?? '', mv.dataset.to ?? '');
    return true;
  }
  // A click on the card itself (not a button) opens the task's note.
  const card = target.closest<HTMLElement>('[data-card]');
  const task = card?.dataset.card ? state.index?.getTask(card.dataset.card) : undefined;
  if (task && !target.closest('button')) {
    await openNote(task.path);
    return true;
  }
  return false;
}

export function dragStart(e: DragEvent): void {
  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
  if (!card || !e.dataTransfer) return;
  e.dataTransfer.setData('text/plain', card.dataset.card ?? '');
  e.dataTransfer.effectAllowed = 'move';
}

export function dragOver(e: DragEvent): void {
  const col = (e.target as HTMLElement).closest<HTMLElement>('[data-col]');
  if (!col) return;
  e.preventDefault();
  document.querySelectorAll('.col.over').forEach((c) => c !== col && c.classList.remove('over'));
  col.classList.add('over');
}

export function dragEnd(): void {
  document.querySelectorAll('.col.over').forEach((c) => c.classList.remove('over'));
}

export function drop(e: DragEvent): void {
  const col = (e.target as HTMLElement).closest<HTMLElement>('[data-col]');
  const id = e.dataTransfer?.getData('text/plain');
  if (!col || !id) return;
  e.preventDefault();
  const t = state.index?.getTask(id);
  if (t && t.status !== col.dataset.col) void move(id, col.dataset.col ?? '');
}
