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
