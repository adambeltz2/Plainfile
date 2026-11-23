import { describe, expect, it } from 'vitest';
import { tasksToCsv, tasksToJson } from '../src/export';
import { hubTasks } from '../src/hub';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ALL_PROJECTS } from '../src/projects';

async function tasks() {
  const index = new VaultIndex(
    new MemoryStorage({
      'projects/a/index.md': '---\ntitle: Alpha\ntype: project\n---\n- [ ] Plan, "quoted" #x @dana due:2026-12-01\n',
      'tasks/Formula.md': '---\ntitle: =SUM(A1)\nstatus: doing\ncreated: 2026-11-01\n---\n',
    }),
  );
  await index.scan();
  return hubTasks(index, ALL_PROJECTS);
}

describe('task export', () => {
  it('writes CSV with quoting, and defuses spreadsheet formulas', async () => {
    const csv = await tasks().then(tasksToCsv);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('title,status,due,created,project,people,tags,phase,file,line');
    expect(csv).toContain('"Plan, ""quoted""');
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('Alpha');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('writes JSON with real arrays', async () => {
    const rows = JSON.parse(await tasks().then(tasksToJson)) as { title: string; people: string[]; project: string[]; line: number }[];
    const plan = rows.find((r) => r.title.startsWith('Plan'))!;
    expect(plan.people).toEqual(['dana']);
    expect(plan.project).toEqual(['Alpha']);
    expect(typeof plan.line).toBe('number');
  });
});

import { insightReport } from '../src/insight';
import { insightToCsv } from '../src/export';
describe('insight export', () => {
  it('gathers what the screen shows and flattens it to one CSV', async () => {
    const index = new VaultIndex(new MemoryStorage({ 'a.md': '---\ntags: [x]\n---\n- [ ] Call @dana due:2020-01-01\n', 'sub/b.md': '# B\n#x\n' }));
    await index.scan();
    const today = '2026-11-23';
    const r = insightReport(index, today);
    expect(r.topics).toEqual([{ tag: 'x', notes: 2 }]);
    expect(r.people.map((p) => p.name)).toContain('dana');
    expect(r.folders.map((f) => f.folder).sort()).toEqual(['(top level)', 'sub']);
    expect(r.month.open).toBe(1);
    const csv = insightToCsv(r);
    expect(csv.split('\r\n')[0]).toBe('section,name,value,detail');
    expect(csv).toContain('topic,x,2,notes');
    expect(csv).toContain('month,open,1,');
    expect(csv).toContain('person,dana,1,');
  });
});
