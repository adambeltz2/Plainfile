import { fmtDate, localDateOf } from '../src/dates';
import { buildPeople, personPage, type PeopleIndex } from '../src/people';
import { applyPersonRename, planPersonRename, undoPersonRename, type PersonRenamePlan } from '../src/people-rename';
import { openTemplate } from './newmenu';
import { errorMessage, rescan, render, state, today, writeFailure } from './store';
import { logHtml, openTaskRow, row, toggleTask } from './tasks';
import { esc } from './util';

/**
 * People: everyone who shows up in your notes, from @mentions and people fields, joined by person notes. The
 * table lists them with what is open and who you are waiting on; a person's page lists their tasks, meetings
 * and the notes that name them. It is a view, so there is nothing to maintain.
 */
export const peopleState = {
  key: '',
  sort: 'open',
  desc: true,
  /** The Rename person panel: the name typed, what it would change, and whether it is writing. */
  rename: undefined as undefined | { name: string; keepAlias: boolean; plan?: PersonRenamePlan; busy: boolean; error: string },
  /** The last rename, so its text changes can be undone. */
  last: undefined as undefined | { plan: PersonRenamePlan; text: string },
};

let cache: { version: number; today: string; built: PeopleIndex } | undefined;
function built(): PeopleIndex | undefined {
  const idx = state.index;
  if (!idx) return undefined;
  if (cache?.version !== idx.version || cache.today !== today()) cache = { version: idx.version, today: today(), built: buildPeople(idx, today()) };
  return cache.built;
}

/** Back to the list of everyone (what choosing People in the header shows). */
export function openList(): void {
  peopleState.key = '';
  peopleState.rename = undefined;
  peopleState.last = undefined;
  state.log = undefined;
}

export function openPerson(key: string): void {
  peopleState.key = key;
  peopleState.rename = undefined;
  peopleState.last = undefined;
  state.screen = 'people';
  state.log = undefined;
  render();
}

const ago = (ms: number): string => {
  if (!ms) return '–';
  const d = localDateOf(ms);
  if (d === today()) return 'today';
  const days = Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);
  return days < 0 ? fmtDate(d) : days === 1 ? 'yesterday' : days < 45 ? `${days} days ago` : fmtDate(d);
};

function table(p: PeopleIndex): string {
  if (!p.people.length)
    return '<div class="empty">No people yet. Write <code>@dana</code> on a task, add <code>people: [dana]</code> to a note, or make a note of <code>type: person</code> (+ New, Person).</div>';
  const key: Record<string, (x: (typeof p.people)[number]) => string | number> = {
    name: (x) => x.name.toLowerCase(),
    open: (x) => x.open,
    waiting: (x) => x.waiting,
    overdue: (x) => x.overdue,
    notes: (x) => x.notes,
    seen: (x) => x.lastSeen,
  };
  const k = key[peopleState.sort] ?? key.open!;
  const rows = [...p.people].sort((a, b) => {
    const x = k(a);
    const y = k(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (peopleState.desc ? -c : c) || a.name.localeCompare(b.name);
  });
  const th = (id: string, label: string): string =>
    `<th aria-sort="${peopleState.sort === id ? (peopleState.desc ? 'descending' : 'ascending') : 'none'}"><button class="plain-btn" data-people-sort="${id}">${label}${peopleState.sort === id ? (peopleState.desc ? ' ▾' : ' ▴') : ''}</button></th>`;
  return (
    '<div class="table-wrap"><table class="portfolio"><thead><tr>' +
    th('name', 'Person') +
    th('open', 'Open') +
    th('waiting', 'Waiting') +
    th('overdue', 'Overdue') +
    th('notes', 'Notes') +
    th('seen', 'Last seen') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td><button class="link" data-person="${esc(r.key)}"><b>${esc(r.name)}</b></button>${r.note ? '' : ' <span class="chip quiet" title="No person note yet. Make one from their page.">no note</span>'}</td><td>${r.open}</td><td>${r.waiting}</td><td>${r.overdue ? `<span class="chip late">${r.overdue}</span>` : '0'}</td><td>${r.notes}</td><td>${esc(ago(r.lastSeen))}</td></tr>`,
      )
      .join('') +
    '</tbody></table></div>'
  );
}

/** The preview under the name box: how many lines in how many notes, the note that is renamed, and a warning if two people join. */
function renamePreview(plan: PersonRenamePlan | undefined): string {
  if (!plan) return '<span class="muted small">Type the new name to see what changes.</span>';
  if (plan.error) return `<span class="err-text">${esc(plan.error)}</span>`;
  const files = new Set(plan.changes.map((c) => c.path)).size;
  let h = `<div class="small"><b>${plan.changes.length}</b> line${plan.changes.length === 1 ? '' : 's'} in <b>${files}</b> note${files === 1 ? '' : 's'} will change: <code>@${esc(plan.token)}</code> and <code>people:</code> values.</div>`;
  if (plan.note)
    h += `<div class="small">The person note <code>${esc(plan.note.from)}</code> becomes <code>${esc(plan.note.to)}</code>${plan.note.edits.length ? `, and ${plan.note.edits.length} link line${plan.note.edits.length === 1 ? '' : 's'} to it are updated` : ''}.</div>`;
  if (plan.joins)
    h += `<div class="notice small">${esc(plan.joins)} already exists. Everything named ${esc(plan.oldName)} will become ${esc(plan.joins)}.</div>`;
  const show = plan.changes.slice(0, 8);
  h += `<div class="diff">${show.map((c) => `<div class="muted">${esc(c.path)}:${c.line}</div><div class="del"><span class="sg">−</span><span>${esc(c.before)}</span></div><div class="add"><span class="sg">+</span><span>${esc(c.after)}</span></div>`).join('')}${plan.changes.length > show.length ? `<div class="muted">and ${plan.changes.length - show.length} more lines</div>` : ''}</div>`;
  return h;
}

function renamePanel(name: string): string {
  const r = peopleState.rename;
  if (!r) return '';
  const hasNote = !!built()?.people.find((x) => x.key === peopleState.key)?.note;
  if (r.busy)
    return `<div class="notice loading" role="status" aria-live="polite"><b>Renaming ${esc(name)}…</b><span class="small muted">Notes are changed one at a time. Keep this page open.</span></div>`;
  const ok = !!r.plan && !r.plan.error && (r.plan.changes.length > 0 || !!r.plan.note);
  return (
    `<div class="notice" role="group" aria-label="Rename person"><b>Rename ${esc(name)} everywhere</b>` +
    `<div class="row-gap" style="margin:8px 0"><label class="small" for="person-new-name">New name</label><input id="person-new-name" class="inp" type="text" autocomplete="off" value="${esc(r.name)}" placeholder="For example Ken Smith"></div>` +
    (hasNote
      ? `<label class="check small"><input type="checkbox" id="person-keep-alias"${r.keepAlias ? ' checked' : ''}> Keep the old name as an alias on their note, so old links still work</label>`
      : '') +
    `<div id="person-rename-preview" class="small" aria-live="polite">${renamePreview(r.plan)}</div>` +
    (r.error ? `<div class="notice err small">${esc(r.error)}</div>` : '') +
    `<div class="row-gap" style="margin-top:8px"><button class="btn primary small" data-people-rename-go${ok ? '' : ' disabled'}>Rename</button><button class="btn small" data-people-rename-cancel>Cancel</button></div></div>`
  );
}

function page(p: PeopleIndex, key: string): string {
  const pg = personPage(p, key, today());
  if (!pg) return '<div class="empty">That person is not in your notes any more. <button class="btn" data-people-back>All people</button></div>';
  const { person } = pg;
  const list = (title: string, n: number, body: string): string => `<section class="psec"><h3>${esc(title)} <span class="n">${n}</span></h3>${body}</section>`;
  const noteList = (notes: typeof pg.notes): string =>
    `<ul class="plain pnotes">${notes
      .slice(0, 25)
      .map(
        (n) =>
          `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(fmtDate(localDateOf(n.mtime)))}</span><span class="chip src mono">${esc(n.path)}</span></span></button></li>`,
      )
      .join('')}</ul>`;
  return (
    `<div class="row-gap" style="margin:0 0 8px"><button class="btn" data-people-back>All people</button></div>` +
    `<div class="ed-head"><div style="min-width:0"><h2 class="title">${esc(person.name)}</h2><div class="meta">${person.note ? esc(String(person.note.frontmatter.company ?? '')) || 'Person note' : 'No person note yet'}${pg.quietDays !== undefined ? ` · last in a note ${pg.quietDays === 0 ? 'today' : `${pg.quietDays} day${pg.quietDays === 1 ? '' : 's'} ago`}` : ''}${pg.quietDays !== undefined && pg.quietDays >= 21 ? ' · <b>worth a follow-up</b>' : ''}</div></div>` +
    `<div class="ed-actions">${person.note ? `<button class="btn" data-open="${esc(person.note.path)}">Open note</button>` : `<button class="btn primary" data-people-make="${esc(person.key)}">Make a person note</button>`}<button class="btn" data-people-rename>Rename person</button><button class="btn" data-search-q="@${esc(person.key)}">Search @${esc(person.key)}</button></div></div>` +
    renamePanel(person.name) +
    (peopleState.last
      ? `<div class="notice ok small" role="status">${esc(peopleState.last.text)} <button class="btn small" data-people-rename-undo>Undo the note changes</button></div>`
      : '') +
    `<div class="pstats"><div class="pstat"><b>${pg.open.length + pg.waiting.length}</b><span>open</span></div><div class="pstat${person.overdue ? ' late' : ''}"><b>${person.overdue}</b><span>overdue</span></div><div class="pstat"><b>${pg.waiting.length}</b><span>waiting</span></div><div class="pstat"><b>${pg.done}</b><span>done</span></div><div class="pstat"><b>${pg.meetings.length}</b><span>meetings</span></div></div>` +
    '<div class="pcols"><div>' +
    list(
      'Open tasks',
      pg.open.length,
      pg.open.length ? `<ul class="tasks">${pg.open.map((t) => row(t.item)).join('')}</ul>` : '<p class="muted small">Nothing open.</p>',
    ) +
    list(
      'Waiting on',
      pg.waiting.length,
      pg.waiting.length ? `<ul class="tasks">${pg.waiting.map((t) => row(t.item)).join('')}</ul>` : '<p class="muted small">Not waiting on anything.</p>',
    ) +
    '</div><div>' +
    list('Meetings', pg.meetings.length, pg.meetings.length ? noteList(pg.meetings) : '<p class="muted small">No dated notes name them.</p>') +
    list('Notes', pg.notes.length, pg.notes.length ? noteList(pg.notes) : '<p class="muted small">No other notes name them.</p>') +
    '</div></div>' +
    (logHtml() ? `<div class="plog" aria-live="polite">${logHtml()}</div>` : '')
  );
}

export function html(): string {
  const p = built();
  if (!p) return '';
  const body = peopleState.key
    ? page(p, peopleState.key)
    : `<h2 class="title">People</h2><p class="meta">${p.people.length} ${p.people.length === 1 ? 'person' : 'people'} in your notes, from <code>@mentions</code> and <code>people:</code> fields</p>${table(p)}`;
  return `<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main people">${body}</section></div>`;
}

let planSeq = 0;

/** Work out what the typed name would change, and show it under the box without redrawing the box. */
async function refreshPlan(): Promise<void> {
  const r = peopleState.rename;
  const { storage, index } = state;
  const people = built();
  if (!r || !storage || !index || !people) return;
  const seq = ++planSeq;
  const name = r.name;
  const plan = name.trim()
    ? await planPersonRename(storage, index, people, peopleState.key, name).catch((e) => ({ error: errorMessage(e) }) as unknown as PersonRenamePlan)
    : undefined;
  if (seq !== planSeq || peopleState.rename !== r) return;
  r.plan = plan;
  const prev = document.getElementById('person-rename-preview');
  if (prev) prev.innerHTML = renamePreview(plan);
  const go = document.querySelector<HTMLButtonElement>('[data-people-rename-go]');
  if (go) go.disabled = !(plan && !plan.error && (plan.changes.length > 0 || !!plan.note));
}

/** Typing the new name, and the alias box, in the Rename person panel. */
export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  const r = peopleState.rename;
  if (!r) return false;
  if (t.id === 'person-new-name') {
    r.name = t.value;
    r.error = '';
    void refreshPlan();
    return true;
  }
  if (t.id === 'person-keep-alias') {
    r.keepAlias = t.checked;
    return true;
  }
  return false;
}

async function doRename(): Promise<void> {
  const r = peopleState.rename;
  const { storage, index } = state;
  if (!r?.plan || r.plan.error || !storage || !index) return;
  const plan = r.plan;
  r.busy = true;
  render();
  await new Promise((res) => setTimeout(res, 0)); // let the working message paint first
  try {
    const out = await applyPersonRename(storage, index, plan, { keepAlias: r.keepAlias });
    const lines = out.changes.length;
    peopleState.rename = undefined;
    const people = buildPeople(index, today());
    peopleState.key = people.resolve(plan.newName);
    peopleState.last = plan.edits.length
      ? {
          plan,
          text: `Renamed ${plan.oldName} to ${plan.newName}: ${plan.changes.length} line${plan.changes.length === 1 ? '' : 's'} in ${lines} note${lines === 1 ? '' : 's'}${out.renamed ? ', and the person note' : ''}.`,
        }
      : undefined;
    state.log = out.changes[out.changes.length - 1] ?? out.renamed?.changes[out.renamed.changes.length - 1] ?? state.log;
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    r.busy = false;
    r.error = friendly ?? `Could not rename. ${errorMessage(e)}`;
    r.plan = undefined;
  }
  render();
}

async function undoRename(): Promise<void> {
  const last = peopleState.last;
  const { storage, index } = state;
  if (!last || !storage || !index) return;
  try {
    await undoPersonRename(storage, index, last.plan);
    peopleState.last = undefined;
    peopleState.key = buildPeople(index, today()).resolve(last.plan.oldName);
  } catch (e) {
    peopleState.last = undefined;
    state.log = { message: `Could not undo, a note has changed since. ${errorMessage(e)}` };
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  if (target.closest('[data-people-rename]')) {
    peopleState.last = undefined;
    peopleState.rename = { name: '', keepAlias: true, busy: false, error: '' };
    render();
    document.getElementById('person-new-name')?.focus();
    return true;
  }
  if (target.closest('[data-people-rename-cancel]')) {
    peopleState.rename = undefined;
    render();
    return true;
  }
  if (target.closest('[data-people-rename-go]')) {
    await doRename();
    return true;
  }
  if (target.closest('[data-people-rename-undo]')) {
    await undoRename();
    return true;
  }
  const person = target.closest<HTMLElement>('[data-person]')?.dataset.person;
  if (person) {
    openPerson(person);
    return true;
  }
  if (target.closest('[data-people-back]')) {
    peopleState.key = '';
    state.log = undefined;
    render();
    return true;
  }
  const sort = target.closest<HTMLElement>('[data-people-sort]')?.dataset.peopleSort;
  if (sort) {
    peopleState.desc = peopleState.sort === sort ? !peopleState.desc : sort !== 'name';
    peopleState.sort = sort;
    render();
    return true;
  }
  const make = target.closest<HTMLElement>('[data-people-make]')?.dataset.peopleMake;
  if (make) {
    const name = built()?.people.find((x) => x.key === make)?.name ?? make;
    openTemplate('Person');
    const m = state.modal;
    if (m?.step === 'template') {
      m.values.title = name.charAt(0).toUpperCase() + name.slice(1);
      render();
    }
    return true;
  }
  const tg = target.closest<HTMLElement>('[data-toggle]')?.dataset.toggle;
  if (tg) {
    await toggleTask(tg);
    return true;
  }
  if (await openTaskRow(target)) return true;
  return false;
}
