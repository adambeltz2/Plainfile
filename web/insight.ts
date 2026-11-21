import { applyFieldFix, fieldIssues, type FieldIssue } from '../src/fields';
import { fmtDate } from '../src/dates';
import { activity, folderSizes, monthStats } from '../src/insight';
import { buildPeople } from '../src/people';
import { tagCounts } from '../src/vocabulary';
import { errorMessage, getHealth, render, state, today } from './store';
import { logHtml } from './tasks';
import { esc } from './util';

/** Insight: a quiet look at your own files. When you wrote, what this month looked like, what you write about, and what needs tidying. */
export const insight = { tidy: false, error: '' };

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
  const a = activity(idx, t);
  const m = monthStats(idx, t);
  const tags = tagCounts(idx).slice(0, 40);
  const people = buildPeople(idx, t).people.slice(0, 8);
  const folders = folderSizes(idx);
  const health = getHealth();
  const issues = tidyIssues();
  const maxTag = tags[0]?.count ?? 1;
  const maxFolder = folders[0]?.notes ?? 1;

  let h = '<div class="home insight"><h2 class="title">Insight</h2><p class="meta">Worked out from your own files, in this browser. Nothing is recorded anywhere.</p><div class="home-grid">';
  h += card(
    'Activity: notes changed per day, last 26 weeks',
    `<div class="heat" role="img" aria-label="${a.total} notes changed on ${a.days} days in the last 26 weeks">${a.weeks.map((w) => `<div class="heat-col">${w.map((d) => `<i class="lv${d.level}" title="${esc(fmtDate(d.date))}: ${d.count} note${d.count === 1 ? '' : 's'} changed"></i>`).join('')}</div>`).join('')}</div>` +
      `<p class="small muted" style="margin:6px 0 0">${a.total} note${a.total === 1 ? '' : 's'} changed on ${a.days} day${a.days === 1 ? '' : 's'}${a.busiest ? `. Busiest: ${esc(fmtDate(a.busiest.date))}, ${a.busiest.count}.` : '.'} Darker is busier. Dates come from each file's modified time.</p>`,
    true,
  );
  h += card(
    'This month',
    `<table class="plain-table"><tbody><tr><td>Notes changed</td><td><b>${m.edited}</b></td></tr><tr><td>Notes created</td><td><b>${m.notesCreated}</b></td></tr><tr><td>Tasks created</td><td><b>${m.tasksCreated}</b></td></tr><tr><td>Tasks finished <span class="muted small">(estimate)</span></td><td><b>${m.tasksDone}</b></td></tr><tr><td>Open now</td><td><b>${m.open}</b></td></tr><tr><td>Overdue</td><td><b>${m.overdue}</b></td></tr></tbody></table>`,
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
  h += card('Folders', `<ul class="plain">${folders.map((f) => `<li class="fbar"><span class="mono small">${esc(f.folder)}</span><span class="prog"><i style="width:${Math.round((f.notes / maxFolder) * 100)}%"></i></span><span class="n">${f.notes}</span></li>`).join('')}</ul>`);
  const broken = health ? health.unresolved.length + health.ambiguous.length + health.missingEmbeds.length : 0;
  h += card(
    'Health',
    `<table class="plain-table"><tbody><tr><td>Broken or unclear links</td><td><b>${broken}</b></td></tr><tr><td>Notes sharing a name</td><td><b>${health?.duplicates.length ?? 0}</b></td></tr><tr><td>Notes nothing links to</td><td><b>${health?.orphans.length ?? 0}</b></td></tr><tr><td>Unused attachments</td><td><b>${health?.unusedAttachments.length ?? 0}</b></td></tr><tr><td>Fields to tidy</td><td><b>${issues.length}</b></td></tr></tbody></table>` +
      '<div class="row-gap"><button class="btn small" data-nav="health">Open Vault health</button>' +
      `<button class="btn small" data-insight-tidy aria-expanded="${insight.tidy}">${insight.tidy ? 'Hide tidy list' : issues.length ? 'Review fields to tidy' : 'Fields are uniform'}</button></div>` +
      (insight.error ? `<div class="notice err small">${esc(insight.error)}</div>` : '') +
      (insight.tidy ? tidyList(issues) : ''),
    true,
  );
  return `${h}</div>${logHtml() ? `<div class="plog">${logHtml()}</div>` : ''}</div>`;
}

function tidyList(issues: FieldIssue[]): string {
  if (!issues.length) return '<p class="muted small">Every note follows the standard fields.</p>';
  const fixable = issues.filter((i) => i.fix);
  return (
    '<p class="small muted" style="margin:8px 0 6px">Each fix changes one line in one note, and only when you press it.</p>' +
    (fixable.length ? `<div class="row-gap" style="margin:0 0 8px"><button class="btn small primary" data-insight-fixall>Fix all ${fixable.length}</button></div>` : '') +
    `<ul class="plain tidy">${issues
      .slice(0, 60)
      .map((i) => `<li><div><button class="link" data-open="${esc(i.path)}">${esc(i.title)}</button> <span class="muted small">${esc(i.message)}</span></div>${i.fix ? `<div class="mono small">${esc(i.fix.before)} → ${esc(i.fix.after)} <button class="btn small" data-insight-fix="${esc(i.id)}">Fix</button></div>` : ''}</li>`)
      .join('')}${issues.length > 60 ? `<li class="muted">and ${issues.length - 60} more</li>` : ''}</ul>`
  );
}

export async function click(target: HTMLElement): Promise<boolean> {
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
