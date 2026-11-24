import { fmtDate, fmtDateLong } from '../src/dates';
import { portfolio } from '../src/hub';
import { triage, waitingOn, weekAhead } from '../src/home';
import { listFollowUps } from '../src/projects';
import { todayView } from '../src/query';
import { justDone, render, state, today } from './store';
import { logHtml, openTaskRow, row, toggleTask } from './tasks';
import { quickBar } from './today';
import { esc } from './util';
import { kindIcon } from './kind-icon';
import { pinnedNotes } from '../src/pins';

/**
 * Home: one screen for "what should I do now?". A capture box, today's tasks, where you left off, what needs
 * filing, what you are waiting on, the week ahead and how the projects are going. Everything is worked out
 * from the notes each time, so there is nothing to keep up to date.
 */
/** A one-time message, such as the result of a finished review. */
export const notice = { text: '' };

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const t = today();
  const v = todayView(idx.tasks(), t, justDone);
  const due = [...v.overdue, ...v.today];
  const unfiled = triage(idx);
  const waiting = waitingOn(idx, t);
  const week = weekAhead(idx, t);
  const peak = Math.max(1, ...week.map((d) => d.open));
  const rows = portfolio(idx, t)
    .filter((r) => r.project.active && !r.project.parent)
    .slice(0, 5);

  const card = (title: string, body: string, extra = ''): string => `<section class="card home-card"><h3>${esc(title)}${extra}</h3>${body}</section>`;
  const list = (items: string[]): string => `<ul class="plain home-rows">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;

  const qb = quickBar('home-quick');
  let h = `<div class="home"><div class="home-top"><span class="meta home-date">${esc(fmtDateLong(t))}</span>${qb.form}</div>${qb.below}`;
  if (logHtml()) h += `<div class="home-log">${logHtml()}</div>`;
  if (notice.text) h += `<div class="notice ok" role="status">${esc(notice.text)} <button class="btn small" data-home-dismiss>Dismiss</button></div>`;
  h += `<div class="home-stats"><div class="home-bars" role="img" aria-label="Open tasks due each day for the next seven days">${week.map((d) => `<div class="wday${d.date === t ? ' today' : ''}"><i style="height:${Math.round((d.open / peak) * 100)}%"></i><b>${d.open}</b><span>${esc(fmtDate(d.date).slice(0, 3))}</span></div>`).join('')}</div><div class="home-links"><button class="btn small" data-nav="notes" data-count title="${idx.files.size} files in the folder, ${idx.notes.size} of them notes. Open the list.">${idx.notes.size.toLocaleString()} note${idx.notes.size === 1 ? '' : 's'}</button><button class="btn small" data-nav="tasks" data-view="all">All tasks</button><button class="btn small" data-nav="search">Search</button><button class="btn small" data-nav="explore">Explore</button><button class="btn small" data-nav="review">Weekly review</button><button class="btn small" data-nav="tasks" data-view="upcoming">Upcoming</button></div></div>`;
  const todayCard = card(
    'Today',
    due.length
      ? `<ul class="tasks">${due
          .slice(0, 8)
          .map((x) => row(x))
          .join(
            '',
          )}</ul>${due.length > 8 ? `<p class="small muted">and ${due.length - 8} more</p>` : ''}<button class="btn small" data-nav="today">All of Today</button>`
      : '<p class="muted small" style="margin:0 0 6px">Nothing is due or late. Enjoy it, or look at the week below.</p><button class="btn small" data-nav="today">Open Today</button>',
    ` <span class="n">${due.length}</span>`,
  );
  h += '<div class="home-grid"><div class="home-side">';
  const pins = pinnedNotes(idx);
  h += card(
    'Pinned',
    pins.length
      ? list(pins.slice(0, 8).map((p) => `<button class="item note-quick" data-open="${esc(p.path)}"><span>${kindIcon(p)}${esc(p.title)}</span></button>`)) +
          (pins.length > 8 ? `<p class="small muted">and ${pins.length - 8} more in Notes</p>` : '')
      : '<p class="muted small" style="margin:0">Nothing pinned. Open a note, then ⋯ More, then Pin to top, and it waits here.</p>',
    pins.length ? ` <span class="n">${pins.length}</span>` : '',
  );
  h += card(
    'Projects',
    rows.length
      ? rows
          .map(
            (r) =>
              `<button class="home-proj" data-open-project="${esc(r.project.path)}"><span>${r.project.number ?? '–'} ${esc(r.project.title)}</span><span class="small muted">${r.open} open${r.overdue ? ` · ${r.overdue} late` : ''}</span><span class="prog"><i style="width:${r.total ? Math.round((r.done / r.total) * 100) : 0}%"></i></span></button>`,
          )
          .join('')
      : '<p class="muted small" style="margin:0">No projects yet. Make one from + New.</p>',
  );
  h += card(
    'Needs filing',
    unfiled.length
      ? list(
          unfiled
            .slice(0, 3)
            .map(
              (u) =>
                `<button class="item note-quick" data-open="${esc(u.path)}"><span>${esc(u.title)}</span><span class="chip quiet">${u.kind === 'task' ? 'task' : 'note'}</span></button>`,
            ),
        ) + `<button class="btn small primary" data-nav="review">${unfiled.length > 3 ? `File all ${unfiled.length}` : 'File them'}</button>`
      : '<p class="muted small" style="margin:0">Everything is filed.</p>',
    unfiled.length ? ` <span class="chip late">${unfiled.length}</span>` : '',
  );
  h += card(
    'Waiting on',
    waiting.length
      ? list(
          waiting
            .slice(0, 4)
            .map(
              (w) =>
                `<button class="item note-quick" data-open="${esc(w.task.item.path)}" data-line="${w.task.item.line}"><span>${esc(w.task.item.title)}</span><span class="muted small">${w.task.people.length ? `@${esc(w.task.people[0] ?? '')} · ` : ''}${w.days !== undefined ? `${w.days} d` : ''}</span></button>`,
            ),
        )
      : '<p class="muted small" style="margin:0">You are not waiting on anything.</p>',
  );
  const followups = listFollowUps(idx);
  h += card(
    'Follow-ups',
    followups.length
      ? list(
          followups
            .slice(0, 4)
            .map(
              (f) =>
                `<button class="item note-quick" data-open="${esc(f.path)}" data-line="${f.line}"><span>${esc(f.title)}</span><span class="muted small">${esc(f.from)}</span></button>`,
            ),
        ) + (followups.length > 4 ? `<button class="btn small" data-nav="tasks" data-view="followups">All ${followups.length} follow-ups</button>` : '')
      : '<p class="muted small" style="margin:0">None. Tag a line <code>#followup</code> in any note and it shows here.</p>',
    followups.length ? ` <span class="n">${followups.length}</span>` : '',
  );
  return `${h}</div><div class="home-today">${todayCard}</div></div></div>`;
}

export async function click(target: HTMLElement): Promise<boolean> {
  if (target.closest('[data-home-dismiss]')) {
    notice.text = '';
    render();
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
