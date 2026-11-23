import type { HubTask } from './hub';
import type { InsightReport } from './insight';

/** The columns of a task export, in order. */
export const TASK_COLUMNS = ['title', 'status', 'due', 'created', 'project', 'people', 'tags', 'phase', 'file', 'line'] as const;

function row(t: HubTask): Record<(typeof TASK_COLUMNS)[number], string | number> {
  return {
    title: t.item.title,
    status: t.status,
    due: t.due ?? '',
    created: t.item.created ?? '',
    project: (t.projects ?? []).join('; '),
    people: t.people.join('; '),
    tags: t.tags.join('; '),
    phase: t.phase ?? '',
    file: t.item.path,
    line: t.item.line,
  };
}

const cell = (v: string | number): string => {
  const s = String(v);
  // A cell that starts with = + - @ can be run as a formula by a spreadsheet; a leading apostrophe stops that.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Tasks as CSV (comma separated, quoted where needed, CRLF line ends), ready for a spreadsheet. */
export function tasksToCsv(tasks: HubTask[]): string {
  const lines = [TASK_COLUMNS.join(','), ...tasks.map((t) => TASK_COLUMNS.map((c) => cell(row(t)[c])).join(','))];
  return lines.join('\r\n') + '\r\n';
}

/** Tasks as JSON: an array of objects with the same fields as the CSV, but lists as real arrays. */
export function tasksToJson(tasks: HubTask[]): string {
  return JSON.stringify(
    tasks.map((t) => ({ ...row(t), project: t.projects ?? [], people: t.people, tags: t.tags })),
    null,
    2,
  );
}

/** The Insight report as one flat CSV: a `section` column says which table a row belongs to. */
export function insightToCsv(r: InsightReport): string {
  const rows: (string | number)[][] = [['section', 'name', 'value', 'detail']];
  for (const d of r.activity) rows.push(['activity', d.date, d.changed, 'notes changed']);
  for (const [k, v] of Object.entries(r.month)) rows.push(['month', k, v, '']);
  for (const t of r.topics) rows.push(['topic', t.tag, t.notes, 'notes']);
  for (const p of r.people) rows.push(['person', p.name, p.open, `waiting ${p.waiting}; overdue ${p.overdue}; mentioned in ${p.notes} notes`]);
  for (const f of r.folders) rows.push(['folder', f.folder, f.notes, 'notes']);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
