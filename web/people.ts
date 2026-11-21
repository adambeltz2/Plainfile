import { fmtDate, localDateOf } from '../src/dates';
import { buildPeople, personPage, type PeopleIndex } from '../src/people';
import { openTemplate } from './newmenu';
import { render, state, today } from './store';
import { logHtml, row, toggleTask } from './tasks';
import { esc } from './util';

/**
 * People: everyone who shows up in your notes, from @mentions and people fields, joined by person notes. The
 * table lists them with what is open and who you are waiting on; a person's page lists their tasks, meetings
 * and the notes that name them. It is a view, so there is nothing to maintain.
 */
export const peopleState = { key: '', sort: 'open', desc: true };

let cache: { version: number; today: string; built: PeopleIndex } | undefined;
function built(): PeopleIndex | undefined {
  const idx = state.index;
  if (!idx) return undefined;
  if (cache?.version !== idx.version || cache.today !== today()) cache = { version: idx.version, today: today(), built: buildPeople(idx, today()) };
  return cache.built;
}

export function openPerson(key: string): void {
  peopleState.key = key;
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
  if (!p.people.length) return '<div class="empty">No people yet. Write <code>@dana</code> on a task, add <code>people: [dana]</code> to a note, or make a note of <code>type: person</code> (+ New, Person).</div>';
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
  const th = (id: string, label: string): string => `<th><button class="plain-btn" data-people-sort="${id}" aria-sort="${peopleState.sort === id ? (peopleState.desc ? 'descending' : 'ascending') : 'none'}">${label}${peopleState.sort === id ? (peopleState.desc ? ' ▾' : ' ▴') : ''}</button></th>`;
  return (
    '<div class="table-wrap"><table class="portfolio"><thead><tr>' + th('name', 'Person') + th('open', 'Open') + th('waiting', 'Waiting') + th('overdue', 'Overdue') + th('notes', 'Notes') + th('seen', 'Last seen') + '</tr></thead><tbody>' +
    rows
      .map(
        (r) =>
          `<tr><td><button class="link" data-person="${esc(r.key)}"><b>${esc(r.name)}</b></button>${r.note ? '' : ' <span class="chip quiet" title="No note of type: person yet">no note</span>'}</td><td>${r.open}</td><td>${r.waiting}</td><td>${r.overdue ? `<span class="chip late">${r.overdue}</span>` : '0'}</td><td>${r.notes}</td><td>${esc(ago(r.lastSeen))}</td></tr>`,
      )
      .join('') +
    '</tbody></table></div>'
  );
}

function page(p: PeopleIndex, key: string): string {
  const pg = personPage(p, key, today());
  if (!pg) return '<div class="empty">That person is not in your notes any more. <button class="btn" data-people-back>All people</button></div>';
  const { person } = pg;
  const list = (title: string, n: number, body: string): string => `<section class="psec"><h3>${esc(title)} <span class="n">${n}</span></h3>${body}</section>`;
  const noteList = (notes: typeof pg.notes): string => `<ul class="plain pnotes">${notes.slice(0, 25).map((n) => `<li><button class="res-btn" data-open="${esc(n.path)}"><span class="rt">${esc(n.title)}</span><span class="chips"><span class="chip quiet">${esc(fmtDate(localDateOf(n.mtime)))}</span><span class="chip src mono">${esc(n.path)}</span></span></button></li>`).join('')}</ul>`;
  return (
    `<div class="row-gap" style="margin:0 0 8px"><button class="btn" data-people-back>All people</button></div>` +
    `<div class="ed-head"><div style="min-width:0"><h2 class="title">${esc(person.name)}</h2><div class="meta">${person.note ? esc(String(person.note.frontmatter.company ?? '')) || 'Person note' : 'No person note yet'}${pg.quietDays !== undefined ? ` · last in a note ${pg.quietDays === 0 ? 'today' : `${pg.quietDays} day${pg.quietDays === 1 ? '' : 's'} ago`}` : ''}${pg.quietDays !== undefined && pg.quietDays >= 21 ? ' · <b>worth a follow-up</b>' : ''}</div></div>` +
    `<div class="ed-actions">${person.note ? `<button class="btn" data-open="${esc(person.note.path)}">Open note</button>` : `<button class="btn primary" data-people-make="${esc(person.key)}">Make a person note</button>`}<button class="btn" data-search-q="@${esc(person.key)}">Search @${esc(person.key)}</button></div></div>` +
    `<div class="pstats"><div class="pstat"><b>${pg.open.length + pg.waiting.length}</b><span>open</span></div><div class="pstat${person.overdue ? ' late' : ''}"><b>${person.overdue}</b><span>overdue</span></div><div class="pstat"><b>${pg.waiting.length}</b><span>waiting</span></div><div class="pstat"><b>${pg.done}</b><span>done</span></div><div class="pstat"><b>${pg.meetings.length}</b><span>meetings</span></div></div>` +
    '<div class="pcols"><div>' +
    list('Open tasks', pg.open.length, pg.open.length ? `<ul class="tasks">${pg.open.map((t) => row(t.item)).join('')}</ul>` : '<p class="muted small">Nothing open.</p>') +
    list('Waiting on', pg.waiting.length, pg.waiting.length ? `<ul class="tasks">${pg.waiting.map((t) => row(t.item)).join('')}</ul>` : '<p class="muted small">Not waiting on anything.</p>') +
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
  const body = peopleState.key ? page(p, peopleState.key) : `<h2 class="title">People</h2><p class="meta">${p.people.length} ${p.people.length === 1 ? 'person' : 'people'} in your notes, from <code>@mentions</code> and <code>people:</code> fields</p>${table(p)}`;
  return `<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main people">${body}</section></div>`;
}

export async function click(target: HTMLElement): Promise<boolean> {
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
  return false;
}
