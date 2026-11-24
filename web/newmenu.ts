import { createFromTemplate, freePath, promptDefault, renderTemplate, templateExtras, type Template } from '../src/templates';
import { addDays } from '../src/query';
import { kindForPrompt } from '../src/vocabulary';
import { openNote } from './notes';
import { listProjects } from '../src/projects';
import { findProject, parseQuickLine } from '../src/quickline';
import { openTasks } from './project';
import { errorMessage, quickAddTask, render, state, today, words } from './store';
import { esc } from './util';

/** Make a note titled with the date and time and open it with the cursor ready to type. No questions asked. */
export async function quickNote(): Promise<void> {
  const { storage, index } = state;
  const t = state.templates.find((x) => x.name === 'Quick note');
  if (!storage || !index || !t) return;
  state.modal = undefined;
  try {
    const r = await createFromTemplate(storage, index, t, {}, today());
    await openNote(r.path, r.cursor !== undefined ? { offset: r.cursor } : {});
  } catch (e) {
    state.error = `Could not make the note. ${errorMessage(e)}`;
    render();
  }
}

export function openNew(): void {
  state.modal = { step: 'menu' };
  render();
}

/** Open a template's form. `extras` are values the app already knows, such as which project a task belongs to. */
/** The New task form, for a task made from a project's page: the project is fixed, and you stay on the page afterwards. */
export function openProjectTask(projectName: string): void {
  state.modal = { step: 'task', text: '', due: '', tags: '', people: '', project: projectName, priority: '', locked: true, error: '' };
  render();
}

export function openTemplate(name: string, extras: Record<string, string> = {}): void {
  const t = state.templates.find((x) => x.name === name);
  if (!t) return;
  // A daily note that already exists is opened, not copied.
  if (t.reuse && !t.prompts.length && state.index) {
    const r = renderTemplate(t, { ...templateExtras(state.index), ...extras }, today());
    if (state.index.files.has(r.path)) {
      state.modal = undefined;
      void openNote(r.path);
      return;
    }
  }
  state.modal = { step: 'template', name, values: Object.fromEntries(t.prompts.map((p) => [p.id, promptDefault(p, today())])), extras, error: '' };
  render();
}

/** Let the browser draw what has just changed before slow work starts. */
const paint = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function closeModal(): void {
  state.modal = undefined;
  render();
}

function currentTemplate(): Template | undefined {
  const m = state.modal;
  return m?.step === 'template' ? state.templates.find((t) => t.name === m.name) : undefined;
}

function preview(t: Template, values: Record<string, string>, extras: Record<string, string>): string {
  const r = renderTemplate(t, { ...(state.index ? templateExtras(state.index) : {}), ...extras, ...values }, today());
  const free = state.index ? freePath(state.index.files, r.path) : { path: r.path, taken: false };
  const warn = free.taken
    ? `<div class="notice small" id="tpl-taken" style="margin:0 0 6px">A note named <span class="mono">${esc(r.path)}</span> already exists. This one will be saved as <span class="mono">${esc(free.path)}</span> and titled with the same number, so nothing is overwritten.</div>`
    : '';
  return `${warn}<div class="mono small" id="tpl-path" style="overflow-wrap:anywhere;margin-bottom:6px">${esc(r.path)}</div><pre class="code" id="tpl-preview">${esc(r.content.trimEnd())}</pre>`;
}

export function html(): string {
  const m = state.modal;
  if (!m) return '';
  let body = '';
  if (m.step === 'menu') {
    body =
      '<h2>New</h2><ul class="plain menu">' +
      `<li><button class="menu-item" data-quick-note><b>Quick note</b><span>No questions: named with the date and time, ready to type. Rename and tag it later. Alt+N</span></button></li>` +
      '<li><button class="menu-item" data-new-task><b>Task</b><span>A task with its own note. It shows in Tasks and your Inbox.</span></button></li>' +
      state.templates
        .filter((t) => !t.hidden && t.name !== 'Quick note')
        .map(
          (t) =>
            `<li><button class="menu-item" data-tpl="${esc(t.name)}"><b>${esc(t.name)}</b><span>${esc(t.description || (t.source === 'built-in' ? '' : 'Your template'))}</span></button></li>`,
        )
        .join('') +
      '</ul><p class="muted small" style="margin:10px 0 0">Add your own templates as markdown files in <code>.plainfile/templates/</code>.</p>';
  } else if (m.step === 'task') {
    body =
      '<h2>New task</h2><p class="muted small" style="margin:0 0 10px">Made as its own note in <code>tasks/</code> (or the project\'s <code>tasks/</code> folder), dated today. It also shows in your Inbox until it is filed in a project. Everything below can also be typed in the task line itself: <code>(A) Call Dana @dana #launch due:friday</code>.</p>' +
      `<div class="fld"><label for="new-task-text">Task</label><input id="new-task-text" class="inp" type="text" autocomplete="off" data-suggest="line" value="${esc(m.text)}" placeholder="Call Dana about the logo files @dana due:friday"></div>` +
      `<div class="fld"><label for="new-task-priority">Priority (optional)</label><select id="new-task-priority" class="inp">${[
        ['', 'None'],
        ['A', 'A (first)'],
        ['B', 'B'],
        ['C', 'C'],
      ]
        .map(([v, l]) => `<option value="${v}"${m.priority === v ? ' selected' : ''}>${l}</option>`)
        .join('')}</select></div>` +
      `<div class="fld"><label for="new-task-due">Due date (optional)</label><div class="qdue"><input id="new-task-due" class="inp date" type="date" value="${esc(m.due)}"><span class="qpicks">${[
        ['Today', 0],
        ['Tomorrow', 1],
        ['Next week', 7],
      ]
        .map(
          ([l, n]) =>
            `<button type="button" class="chip qpick" data-mdue="${addDays(today(), n as number)}" aria-pressed="${m.due === addDays(today(), n as number)}">${l}</button>`,
        )
        .join('')}</span></div></div>` +
      `<div class="fld"><label for="new-task-people">People (optional)</label><input id="new-task-people" class="inp" type="text" autocomplete="off" data-suggest="people" placeholder="@dana @sam" value="${esc(m.people)}"></div>` +
      (m.locked
        ? `<div class="fld"><label>Project</label><div><b>${esc(m.project)}</b></div></div>`
        : `<div class="fld"><label for="new-task-project">Project (optional)</label><input id="new-task-project" class="inp" type="text" autocomplete="off" data-suggest="projects" placeholder="website-relaunch" value="${esc(m.project)}"></div>`) +
      `<div class="fld"><label for="new-task-tags">Tags (optional)</label><input id="new-task-tags" class="inp" type="text" autocomplete="off" data-suggest="tags" placeholder="#launch #home" value="${esc(m.tags)}"></div>` +
      (m.error ? `<div class="notice err small">${esc(m.error)}</div>` : '') +
      `<div class="row-gap"><button class="btn primary" data-act="create-task"${m.busy ? ' disabled' : ''}>${m.busy ? 'Adding…' : 'Add task'}</button><button class="btn" data-act="${m.locked ? 'modal-close' : 'modal-back'}"${m.busy ? ' disabled' : ''}>${m.locked ? 'Cancel' : 'Back'}</button></div>`;
  } else {
    const t = currentTemplate();
    if (!t) return '';
    const fields = t.prompts.length
      ? t.prompts
          .map((p) => {
            const kind = kindForPrompt(p.id);
            return `<div class="fld"><label for="tpl-${esc(p.id)}">${esc(p.label)}</label><input id="tpl-${esc(p.id)}" class="inp" data-tpl-field="${esc(p.id)}"${kind ? ` data-suggest="${kind}" data-suggest-sep="${kind === 'people' || kind === 'tags' ? ', ' : ''}"` : ''} type="text" autocomplete="off" value="${esc(m.values[p.id] ?? '')}"></div>`;
          })
          .join('')
      : '<p class="muted small">This template has nothing to fill in.</p>';
    body =
      `<h2>New ${esc(t.name.toLowerCase())}</h2><div class="tplgrid"><div>${fields}` +
      (m.error ? `<div class="notice err small">${esc(m.error)}</div>` : '') +
      `<div class="row-gap"><button class="btn primary" data-act="create-template"${m.busy ? ' disabled' : ''}>${m.busy ? 'Creating…' : 'Create file'}</button><button class="btn" data-act="modal-back"${m.busy ? ' disabled' : ''}>Back</button></div></div>` +
      `<div><div class="grp" style="margin-top:0">Creates</div>${preview(t, m.values, m.extras)}</div></div>`;
  }
  return `<div class="modal-back" data-backdrop><div class="modal" role="dialog" aria-modal="true" aria-label="New">${body}<button class="modal-x btn small" data-act="modal-close" aria-label="Close">Close</button></div></div>`;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const m = state.modal;
  if (!m) return false;
  if (target.matches('[data-backdrop]')) {
    closeModal();
    return true;
  }
  if (target.closest('[data-quick-note]')) {
    await quickNote();
    return true;
  }
  if (target.closest('[data-new-task]')) {
    state.modal = { step: 'task', text: '', due: '', tags: '', people: '', project: '', priority: '', error: '' };
    render();
    return true;
  }
  const md = target.closest<HTMLElement>('[data-mdue]')?.dataset.mdue;
  if (md && m.step === 'task') {
    m.due = m.due === md ? '' : md;
    render();
    return true;
  }
  const tpl = target.closest<HTMLElement>('[data-tpl]')?.dataset.tpl;
  if (tpl) {
    openTemplate(tpl);
    return true;
  }
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'modal-close') {
    closeModal();
    return true;
  }
  if (act === 'modal-back') {
    openNew();
    return true;
  }
  if (act === 'create-task' && m.step === 'task') {
    if (m.busy) return true;
    m.busy = true;
    m.error = '';
    render();
    await paint();
    // The task line can carry @people, #tags, due: and (A) as well, the way the quick add does; the fields add to it.
    const line = parseQuickLine(m.text, today());
    const wanted = (m.project.trim() || line.project || '').trim();
    const project = wanted && state.index ? findProject(listProjects(state.index), wanted.replace(/^\+/, '')) : undefined;
    const err = line.badDue
      ? `Could not read "due:${line.badDue}". Try due:today, due:tomorrow, due:mon or due:2026-11-30.`
      : wanted && !project
        ? `No project called "${wanted}".`
        : await quickAddTask({
            title: line.title || line.text,
            due: m.due || line.due,
            priority: m.priority || line.priority,
            repeat: line.rec,
            tags: [...new Set([...line.tags, ...words(m.tags)])],
            people: [...new Set([...line.people, ...words(m.people)])],
            project,
          });
    if (err) {
      m.busy = false;
      m.error = err;
      render();
    } else {
      const stay = m.locked;
      state.modal = undefined;
      if (!stay) openTasks('all');
      else render();
    }
    return true;
  }
  if (act === 'create-template' && m.step === 'template') {
    const t = currentTemplate();
    const { storage, index } = state;
    if (!t || !storage || !index || m.busy) return true;
    m.busy = true;
    m.error = '';
    render();
    await paint();
    try {
      const r = await createFromTemplate(storage, index, t, { ...m.extras, ...m.values }, today());
      state.modal = undefined;
      await openNote(r.path, r.cursor !== undefined ? { offset: r.cursor } : {});
    } catch (e) {
      m.busy = false;
      m.error = `Could not create the file. ${errorMessage(e)}`;
      render();
    }
    return true;
  }
  return target.closest('.modal') !== null;
}

export function input(e: Event): boolean {
  const m = state.modal;
  const t = e.target as HTMLInputElement;
  if (!m) return false;
  if (m.step === 'task') {
    if (t.id === 'new-task-text') m.text = t.value;
    else if (t.id === 'new-task-due') m.due = t.value;
    else if (t.id === 'new-task-people') m.people = t.value;
    else if (t.id === 'new-task-project') m.project = t.value;
    else if (t.id === 'new-task-tags') m.tags = t.value;
    else if (t.id === 'new-task-priority') m.priority = t.value;
    else return false;
    return true;
  }
  if (m.step === 'template' && t.dataset.tplField) {
    m.values[t.dataset.tplField] = t.value.replace(/[\s,]+$/, '');
    const tpl = currentTemplate();
    const box = document.querySelector('.modal .tplgrid > div:last-child');
    if (tpl && box) box.innerHTML = `<div class="grp" style="margin-top:0">Creates</div>${preview(tpl, m.values, m.extras)}`;
    return true;
  }
  return false;
}
