import { applyFieldFix, fieldIssues, type FieldIssue } from '../src/fields';
import { fmtDate } from '../src/dates';
import { save } from './export';
import { insightToCsv } from '../src/export';
import { activity, drillItems, insightReport, folderSizes, monthStats, notesChangedOn, shiftMonth, type Drill } from '../src/insight';
import { buildPeople } from '../src/people';
import { tagCounts } from '../src/vocabulary';
import { errorMessage, getHealth, render, state, today } from './store';
import { logHtml } from './tasks';
import { esc } from './util';

/** Insight: a quiet look at your own files. When you wrote, what this month looked like, what you write about, and what needs tidying. */
export const insight = { tidy: false, error: '', drill: '' as '' | Drill | `day:${string}`, /** YYYY-MM, or '' for this month. */ month: '', weeks: 26 };

const DRILL_TITLES: Record<Drill, string> = {
  edited: 'Notes changed this month',
  notesCreated: 'Notes created this month',
  tasksCreated: 'Tasks created this month',
  tasksDone: 'Tasks finished this month (estimate)',
  open: 'Open tasks',
  overdue: 'Overdue tasks',
};

let issuesCache: { version: number; list: FieldIssue[] } | undefined;
function tidyIssues(): FieldIssue[] {
  const idx = state.index;
  if (!idx) return [];
  if (issuesCache?.version !== idx.version) issuesCache = { version: idx.version, list: fieldIssues(idx, [...idx.notes.values()]) };
  return issuesCache.list;
}

function card(title: string, body: string, wide = false): string {
  return `<section class="card home-card${wide ? ' wide' : ''}"><h3>${esc(title)}</h3>${body}</section>`;
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const t = today();
  const month = insight.month || t.slice(0, 7);
  const a = activity(idx, t, insight.weeks);
  const m = monthStats(idx, t, month);
  const before = monthStats(idx, t, shiftMonth(month, -1));
  const tags = tagCounts(idx).slice(0, 40);
  const people = buildPeople(idx, t).people.slice(0, 8);
  const folders = folderSizes(idx);
  const health = getHealth();
  const issues = tidyIssues();
  const maxTag = tags[0]?.count ?? 1;
  const maxFolder = folders[0]?.notes ?? 1;

  let h =
    '<div class="home insight"><h2 class="title">Insight</h2><p class="meta">Worked out from your own files, in this browser. Nothing is recorded anywhere. <button class="link" data-insight-export="csv">Export CSV</button> · <button class="link" data-insight-export="json">Export JSON</button></p><div class="home-grid">';
  h += card(
    `Activity: notes changed per day, last ${insight.weeks} weeks`,
    `<label class="small muted">Show <select id="insight-weeks" class="inp" aria-label="Weeks shown">${[13, 26, 52].map((w) => `<option value="${w}"${w === insight.weeks ? ' selected' : ''}>${w} weeks</option>`).join('')}</select></label>` +
      `<div class="heat" role="group" aria-label="${a.total} notes changed on ${a.days} days in the last ${insight.weeks} weeks">${a.weeks.map((w) => `<div class="heat-col">${w.map((d) => (d.count ? `<button class="lv${d.level}" data-insight-day="${esc(d.date)}" aria-label="${esc(fmtDate(d.date))}: ${d.count} note${d.count === 1 ? '' : 's'} changed. Show them." title="${esc(fmtDate(d.date))}: ${d.count} note${d.count === 1 ? '' : 's'} changed"></button>` : `<i class="lv0" title="${esc(fmtDate(d.date))}: nothing changed"></i>`)).join('')}</div>`).join('')}</div>` +
      `<p class="small muted" style="margin:6px 0 0">${a.total} note${a.total === 1 ? '' : 's'} changed on ${a.days} day${a.days === 1 ? '' : 's'}${a.busiest ? `. Busiest: ${esc(fmtDate(a.busiest.date))}, ${a.busiest.count}.` : '.'} Darker is busier. Dates come from each file's modified time.</p>`,
    true,
  );
  h += drillCard(idx, t);
  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const delta = (now: number, was: number): string =>
    now === was ? '' : ` <span class="muted small" title="compared with the month before">${now > was ? '+' : '−'}${Math.abs(now - was)}</span>`;
  h += card(
    month === t.slice(0, 7) ? 'This month' : monthLabel,
    `<div class="row-gap" style="margin:0 0 6px"><button class="btn small" data-insight-month="-1" aria-label="Previous month">‹</button><b>${esc(monthLabel)}</b><button class="btn small" data-insight-month="1" aria-label="Next month"${month >= t.slice(0, 7) ? ' disabled' : ''}>›</button>${month === t.slice(0, 7) ? '' : '<button class="btn small" data-insight-month="0">This month</button>'}</div>` +
      `<table class="plain-table"><tbody>${(
        [
          ['edited', 'Notes changed', m.edited],
          ['notesCreated', 'Notes created', m.notesCreated],
          ['tasksCreated', 'Tasks created', m.tasksCreated],
          ['tasksDone', 'Tasks finished <span class="muted small">(estimate)</span>', m.tasksDone],
          ['open', 'Open now', m.open],
          ['overdue', 'Overdue', m.overdue],
        ] as [Drill, string, number][]
      )
        .map(
          ([k, label, n]) =>
            `<tr><td>${label}</td><td><button class="stat-n" data-insight-drill="${k}" aria-pressed="${insight.drill === k}" aria-label="Show the ${n} behind: ${esc(DRILL_TITLES[k])}"><b>${n}</b></button>${['edited', 'notesCreated', 'tasksCreated', 'tasksDone'].includes(k) ? delta(n, before[k as keyof typeof before] as number) : ''}</td></tr>`,
        )
        .join('')}</tbody></table>`,
  );
  h += card(
    'Topics',
    tags.length
      ? `<div class="cloud" role="list">${tags.map((g) => `<button class="cloud-tag mono" role="listitem" style="font-size:${(13 + 15 * (maxTag > 1 ? Math.log(g.count) / Math.log(maxTag) : 0.5)).toFixed(1)}px" data-search-q="tag:${esc(g.tag)}" title="${g.count} note${g.count === 1 ? '' : 's'}">#${esc(g.tag)}<sup>${g.count}</sup></button>`).join('')}</div>`
      : '<p class="muted small" style="margin:0">No tags yet. Add <code>tags: [launch]</code> to a note or <code>#launch</code> in its text.</p>',
  );
  h += card(
    'People',
    people.length
      ? `<ul class="plain">${people.map((p) => `<li><button class="item" data-person="${esc(p.key)}"><span>${esc(p.name)}</span><span class="n">${p.open} open</span></button></li>`).join('')}</ul><button class="btn small" data-nav="people">All people</button>`
      : '<p class="muted small" style="margin:0">Nobody yet. Write <code>@dana</code> on a task.</p>',
  );
  h += card(
    'Folders',
    `<ul class="plain">${folders.map((f) => `<li class="fbar"><span class="mono small">${esc(f.folder)}</span><span class="prog"><i style="width:${Math.round((f.notes / maxFolder) * 100)}%"></i></span><span class="n">${f.notes}</span></li>`).join('')}</ul>`,
  );
  const broken = health ? health.unresolved.length + health.ambiguous.length + health.missingEmbeds.length : 0;
  h += card(
    'Health',
    `<table class="plain-table"><tbody><tr><td>Broken or unclear links</td><td><button class="stat-n" data-nav="health"><b>${broken}</b></button></td></tr><tr><td>Notes sharing a name</td><td><button class="stat-n" data-nav="health"><b>${health?.duplicates.length ?? 0}</b></button></td></tr><tr><td>Notes nothing links to</td><td><button class="stat-n" data-nav="health"><b>${health?.orphans.length ?? 0}</b></button></td></tr><tr><td>Unused attachments</td><td><button class="stat-n" data-nav="health"><b>${health?.unusedAttachments.length ?? 0}</b></button></td></tr><tr><td>Fields to tidy</td><td><button class="stat-n" data-insight-tidy aria-expanded="${insight.tidy}"><b>${issues.length}</b></button></td></tr></tbody></table>` +
      '<div class="row-gap"><button class="btn small" data-nav="health">Open Vault health</button>' +
      `<button class="btn small" data-insight-tidy aria-expanded="${insight.tidy}">${insight.tidy ? 'Hide tidy list' : issues.length ? 'Review fields to tidy' : 'Fields are uniform'}</button></div>` +
      (insight.error ? `<div class="notice err small">${esc(insight.error)}</div>` : '') +
      (insight.tidy ? tidyList(issues) : ''),
    true,
  );
  return `${h}</div>${logHtml() ? `<div class="plog">${logHtml()}</div>` : ''}</div>`;
}

function drillCard(idx: NonNullable<typeof state.index>, t: string): string {
  const k = insight.drill;
  if (!k) return '';
  const day = k.startsWith('day:') ? k.slice(4) : '';
  const items = day ? notesChangedOn(idx, day) : drillItems(idx, t, k as Drill, insight.month || t.slice(0, 7));
  const inMonth = insight.month
    ? ` in ${new Date(`${insight.month}-01T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : ' this month';
  const title = day ? `Notes changed on ${fmtDate(day)}` : DRILL_TITLES[k as Drill].replace(' this month', inMonth);
  const shown = items.slice(0, 100);
  return card(
    `${title} · ${items.length}`,
    (items.length
      ? `<ul class="plain home-rows">${shown.map((x) => `<li><button class="item note-quick" data-open="${esc(x.path)}"${x.line ? ` data-line="${x.line}"` : ''}><span>${esc(x.title)}<span class="muted mono small" style="display:block">${esc(x.path)}</span></span><span class="muted mono small">${esc(x.hint ? (/^\d{4}-\d{2}-\d{2}$/.test(x.hint) ? fmtDate(x.hint) : x.hint) : '')}</span></button></li>`).join('')}${items.length > shown.length ? `<li class="muted small">and ${items.length - shown.length} more</li>` : ''}</ul>`
      : '<p class="muted small" style="margin:0">Nothing here.</p>') +
      '<div class="row-gap"><button class="btn small" data-insight-drill="">Close</button></div>',
    true,
  );
}

function tidyList(issues: FieldIssue[]): string {
  if (!issues.length) return '<p class="muted small">Every note follows the standard fields.</p>';
  const fixable = issues.filter((i) => i.fix);
  return (
    '<p class="small muted" style="margin:8px 0 6px">Each fix changes one line in one note, and only when you press it.</p>' +
    (fixable.length
      ? `<div class="row-gap" style="margin:0 0 8px"><button class="btn small primary" data-insight-fixall>Fix all ${fixable.length}</button></div>`
      : '') +
    `<ul class="plain tidy">${issues
      .slice(0, 60)
      .map(
        (i) =>
          `<li><div><button class="link" data-open="${esc(i.path)}">${esc(i.title)}</button> <span class="muted small">${esc(i.message)}</span></div>${i.fix ? `<div class="mono small">${esc(i.fix.before)} → ${esc(i.fix.after)} <button class="btn small" data-insight-fix="${esc(i.id)}">Fix</button></div>` : ''}</li>`,
      )
      .join('')}${issues.length > 60 ? `<li class="muted">and ${issues.length - 60} more</li>` : ''}</ul>`
  );
}

export function change(e: Event): boolean {
  const t = e.target as HTMLSelectElement;
  if (t.id !== 'insight-weeks') return false;
  insight.weeks = Number(t.value) || 26;
  render();
  return true;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const mv = target.closest<HTMLElement>('[data-insight-month]')?.dataset.insightMonth;
  if (mv !== undefined) {
    const cur = insight.month || today().slice(0, 7);
    const next = mv === '0' ? '' : shiftMonth(cur, Number(mv));
    insight.month = next >= today().slice(0, 7) ? '' : next;
    insight.drill = '';
    render();
    return true;
  }
  const exp = target.closest<HTMLElement>('[data-insight-export]')?.dataset.insightExport;
  if (exp && state.index) {
    const r = insightReport(state.index, today());
    if (exp === 'csv') save('\ufeff' + insightToCsv(r), `insight-${today()}.csv`, 'text/csv;charset=utf-8');
    else save(JSON.stringify(r, null, 2), `insight-${today()}.json`, 'application/json');
    return true;
  }
  const dr = target.closest<HTMLElement>('[data-insight-drill]');
  const day = target.closest<HTMLElement>('[data-insight-day]')?.dataset.insightDay;
  if (dr || day) {
    const next = day ? (`day:${day}` as const) : ((dr?.dataset.insightDrill ?? '') as '' | Drill);
    insight.drill = insight.drill === next ? '' : next;
    render();
    return true;
  }
  if (target.closest('[data-insight-tidy]')) {
    insight.tidy = !insight.tidy;
    render();
    return true;
  }
  const fix = target.closest<HTMLElement>('[data-insight-fix]')?.dataset.insightFix;
  const all = target.closest('[data-insight-fixall]');
  if (fix || all) {
    const { storage, index } = state;
    if (!storage || !index) return true;
    insight.error = '';
    const todo = (all ? tidyIssues().filter((i) => i.fix) : tidyIssues().filter((i) => i.id === fix)).map((i) => i.id);
    for (const id of todo) {
      try {
        // Worked out again from what is on disk now, since one note can have several fixes.
        issuesCache = undefined;
        const now = tidyIssues().find((i) => i.id === id);
        if (now) state.log = await applyFieldFix(storage, index, now);
      } catch (e) {
        insight.error = `Could not tidy a note. ${errorMessage(e)}`;
        break;
      }
    }
    issuesCache = undefined;
    render();
    return true;
  }
  return false;
}
