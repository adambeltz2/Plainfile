import { addMonths, monthGrid, monthLabel } from '../src/calendar';
import { fmtDateLong } from '../src/dates';
import { journalFor, listJournals, type Journal } from '../src/journal';
import { createFromTemplate } from '../src/templates';
import { errorMessage, render, rescan, state, today, writeFailure } from './store';
import { openNote } from './notes';
import { esc } from './util';

/**
 * The Journal screen: a month calendar with a dot on every day that has a journal, and the dates in a list on the left.
 * Pick a day and open its journal. A day with no journal can have one made from the Daily journal template: today's
 * at once, any other day after asking (going back is rare). Nothing is stored apart from the notes.
 */
export const journalState = { month: '', selected: '', confirm: '', error: '', q: '', flyout: false, creating: false };

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ensure(): void {
  if (!journalState.month) journalState.month = today();
  if (!journalState.selected) journalState.selected = today();
}

/** Make the journal for a day from the Daily journal template, then open it. */
export async function startJournal(date: string): Promise<void> {
  const { storage, index } = state;
  const t = state.templates.find((x) => x.name === 'Daily journal');
  if (!storage || !index || !t || journalState.creating) return;
  journalState.creating = true;
  try {
    const r = await createFromTemplate(storage, index, t, {}, date);
    journalState.confirm = '';
    journalState.error = '';
    journalState.selected = date;
    journalState.month = date;
    await openNote(r.path);
  } catch (e) {
    const friendly = writeFailure(e);
    if (friendly) await rescan();
    journalState.error = friendly ?? `Could not make the journal. ${errorMessage(e)}`;
    render();
  } finally {
    journalState.creating = false;
  }
}

function listHtml(list: Journal[]): string {
  const q = journalState.q.trim();
  const shown = q ? list.filter((j) => j.date.includes(q)) : list;
  if (!list.length) return '<p class="muted small" style="margin:12px 0 0">No journals yet.</p>';
  if (!shown.length) return '<p class="muted small" style="margin:12px 0 0">No dates match.</p>';
  const months = new Map<string, Journal[]>();
  for (const j of shown) months.set(j.date.slice(0, 7), [...(months.get(j.date.slice(0, 7)) ?? []), j]);
  return [...months]
    .map(
      ([m, js]) =>
        `<h4>${esc(monthLabel(`${m}-01`))} <span class="n">${js.length}</span></h4><div class="opts">${js
          .map(
            (j) =>
              `<button class="opt${j.date === journalState.selected ? ' on' : ''}" data-j-pick="${j.date}" aria-pressed="${j.date === journalState.selected}"><span>${j.date}</span></button>`,
          )
          .join('')}</div>`,
    )
    .join('');
}

function calendarHtml(list: Journal[]): string {
  const have = new Set(list.map((j) => j.date));
  const month = journalState.month.slice(0, 7);
  return (
    `<div class="jgrid" role="group" aria-label="${esc(monthLabel(journalState.month))}">${DOW.map((d) => `<div class="jh" aria-hidden="true">${d}</div>`).join('')}` +
    monthGrid(journalState.month)
      .flat()
      .map((d) => {
        const has = have.has(d);
        const cls = `jday${d.slice(0, 7) !== month ? ' out' : ''}${d === today() ? ' today' : ''}${has ? ' has' : ''}${d === journalState.selected ? ' sel' : ''}`;
        return `<button class="${cls}" data-j-day="${d}" aria-pressed="${d === journalState.selected}" aria-label="${esc(fmtDateLong(d))}${has ? ', has a journal' : ''}"><b>${Number(d.slice(8))}</b>${has ? '<i class="jdot" aria-hidden="true"></i>' : ''}</button>`;
      })
      .join('') +
    '</div>'
  );
}

function barHtml(list: Journal[]): string {
  const sel = journalState.selected;
  const j = journalFor(list, sel);
  const isToday = sel === today();
  const title = `<h3>${esc(fmtDateLong(sel))}${isToday ? ' <span class="chipq">today</span>' : ''}</h3>`;
  const err = journalState.error ? `<div class="notice err small" role="alert">${esc(journalState.error)}</div>` : '';
  if (journalState.confirm === sel && !j) {
    return (
      `${err}<div class="notice jbar" role="group" aria-label="Make a journal"><div><b>Make a journal for ${esc(fmtDateLong(sel))}?</b>` +
      `<p class="small muted" style="margin:2px 0 0">It is made from your Daily journal template as <span class="mono">journal/${sel}.md</span>.</p></div>` +
      `<div class="row-gap"><button class="btn primary" data-j-create="${sel}"${journalState.creating ? ' disabled' : ''}>Make it</button><button class="btn" data-j-cancel>Cancel</button></div></div>`
    );
  }
  if (j) {
    // A day with a journal opens it when picked; this bar is only here if it was reached another way (Today, the month arrows).
    return `${err}<div class="jbar card"><div>${title}<p class="mono small muted" style="margin:2px 0 0">${esc(j.path)}</p></div><div class="row-gap"><button class="btn primary" data-journal-open="${esc(j.path)}">Open journal</button></div></div>`;
  }
  return (
    `${err}<div class="jbar card"><div>${title}<p class="muted small" style="margin:2px 0 0">No journal for this date.</p></div>` +
    `<div class="row-gap"><button class="btn primary" data-j-new="${sel}">${isToday ? "Start today's journal" : `+ Journal for ${esc(fmtDateLong(sel).replace(/^\w+ /, ''))}`}</button></div></div>`
  );
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  ensure();
  const list = listJournals(idx);
  return (
    `<div class="jwrap"><aside class="fpane jpane${journalState.flyout ? ' fly' : ''}" aria-label="Journals"><div class="fh"><h3>Journals</h3>` +
    '<button class="plain-btn x f-narrow" data-j-flyout aria-label="Close the list">✕</button></div>' +
    `<input id="journal-q" class="inp" type="search" autocomplete="off" placeholder="Search dates" aria-label="Search journals by date" value="${esc(journalState.q)}">` +
    `<div class="fscroll">${listHtml(list)}</div><div class="ff f-narrow"><button class="btn primary wide" data-j-flyout>Done</button></div></aside>` +
    (journalState.flyout ? '<div class="fly-back" data-j-flyout></div>' : '') +
    '<div class="jmain"><div class="calbar">' +
    `<h2 class="title">${esc(monthLabel(journalState.month))}</h2><span class="grow"></span>` +
    `<button class="btn pill j-entries" data-j-flyout>Entries ${list.length}</button>` +
    '<button class="btn small" data-j-month="-1" aria-label="Previous month">‹</button><button class="btn small" data-j-today>Today</button><button class="btn small" data-j-month="1" aria-label="Next month">›</button></div>' +
    `${calendarHtml(list)}${barHtml(list)}</div></div>`
  );
}

/** Clicks on the Journal screen, and the journal buttons on Home. Returns true when it used the click. */
export async function click(target: HTMLElement): Promise<boolean> {
  const q = (attr: string): string | undefined => target.closest<HTMLElement>(`[${attr}]`)?.getAttribute(attr) ?? undefined;
  const open = q('data-journal-open');
  if (open) {
    await openNote(open);
    return true;
  }
  const start = q('data-journal-start');
  if (start) {
    await startJournal(start);
    return true;
  }
  if (state.screen !== 'journal') return false;
  const pick = q('data-j-pick') ?? q('data-j-day');
  if (pick) {
    Object.assign(journalState, { selected: pick, month: pick, confirm: '', error: '', flyout: false });
    // A day with a journal opens it. A day without one is selected, and the bar offers to make it.
    const idx = state.index;
    const j = idx ? journalFor(listJournals(idx), pick) : undefined;
    if (j) await openNote(j.path);
    else render();
    return true;
  }
  const month = q('data-j-month');
  if (month) {
    journalState.month = addMonths(journalState.month, Number(month));
    render();
    return true;
  }
  if (target.closest('[data-j-today]')) {
    Object.assign(journalState, { selected: today(), month: today(), confirm: '', error: '' });
    render();
    return true;
  }
  const mk = q('data-j-new');
  if (mk) {
    if (mk === today()) await startJournal(mk);
    else {
      journalState.confirm = mk;
      render();
    }
    return true;
  }
  const create = q('data-j-create');
  if (create) {
    await startJournal(create);
    return true;
  }
  if (target.closest('[data-j-cancel]')) {
    journalState.confirm = '';
    render();
    return true;
  }
  if (target.closest('[data-j-flyout]')) {
    journalState.flyout = !journalState.flyout;
    render();
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id !== 'journal-q') return false;
  journalState.q = t.value;
  render();
  return true;
}
