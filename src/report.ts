import { fmtDate, fmtDateLong } from './dates';
import { daysSince } from './home';
import { hubTasks, summarize, type HubTask } from './hub';
import type { VaultIndex } from './index';
import { projectDashboard } from './projects';
import { addDays } from './query';

/**
 * A status report for one project, as markdown, built from the hub's numbers: progress, phases, what is late,
 * what is coming, what is waited on and the notes written lately. It is a snapshot to hand to someone; the
 * notes stay the source of truth. Open it in the app, copy it as formatted text, download it as Word, or save it as a note.
 */
const name = (p: string): string => p.charAt(0).toUpperCase() + p.slice(1);
const who = (t: HubTask): string => (t.people.length ? t.people.map(name).join(', ') : '');
const line = (t: HubTask, extra: string): string =>
  `- ${t.item.title}${[extra, who(t)].filter(Boolean).length ? ` (${[extra, who(t)].filter(Boolean).join(', ')})` : ''}`;

export function statusReport(index: VaultIndex, projectPath: string, today: string, nowMs = Date.now()): string | undefined {
  const d = projectDashboard(index, projectPath, today);
  if (!d) return undefined;
  const all = hubTasks(index, projectPath);
  const s = summarize(all, today, nowMs);
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const open = all.filter((t) => t.status !== 'done');
  const byDue = (a: HubTask, b: HubTask): number => (a.due ?? '').localeCompare(b.due ?? '') || a.item.title.localeCompare(b.item.title);
  const overdue = open.filter((t) => t.due && t.due < today).sort(byDue);
  const soon = open.filter((t) => t.due && t.due >= today && t.due <= addDays(today, 14)).sort(byDue);
  const waiting = open.filter((t) => t.status === 'waiting');
  const undated = open.filter((t) => !t.due);
  const out: string[] = [`# ${d.title}: status`, `*${fmtDateLong(today)}*`, ''];
  out.push(`**${pct}% complete** · ${s.done} of ${s.total} tasks done · ${s.open} open · ${s.overdue} overdue`, '');
  if (d.summary) out.push(d.summary, '');
  if (s.phases.length) {
    out.push('## Progress by phase', '', '| Phase | Done | Total | Complete |', '| --- | --- | --- | --- |');
    for (const p of s.phases) out.push(`| ${p.name} | ${p.done} | ${p.total} | ${p.total ? Math.round((p.done / p.total) * 100) : 0}% |`);
    out.push('');
  }
  if (overdue.length)
    out.push(
      '## Overdue',
      '',
      ...overdue.slice(0, 25).map((t) => line(t, `due ${fmtDate(t.due as string)}`)),
      ...(overdue.length > 25 ? [`- and ${overdue.length - 25} more`] : []),
      '',
    );
  out.push(
    '## Due in the next 14 days',
    '',
    ...(soon.length ? soon.slice(0, 25).map((t) => line(t, fmtDate(t.due as string))) : ['Nothing is due.']),
    ...(soon.length > 25 ? [`- and ${soon.length - 25} more`] : []),
    '',
  );
  if (waiting.length)
    out.push(
      '## Waiting on',
      '',
      ...waiting.slice(0, 15).map((t) => line(t, daysSince(t.item.created, today) !== undefined ? `${daysSince(t.item.created, today)} days` : '')),
      '',
    );
  if (undated.length) out.push(`## Not yet scheduled`, '', `${undated.length} open task${undated.length === 1 ? ' has' : 's have'} no date.`, '');
  if (d.followups.length) out.push('## Follow-ups', '', ...d.followups.slice(0, 10).map((f) => `- ${f.title}`), '');
  if (d.notes.length) out.push('## Recent notes', '', ...d.notes.slice(0, 8).map((n) => `- ${n.title}`), '');
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}
