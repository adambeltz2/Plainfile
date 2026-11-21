import { describe, expect, it } from 'vitest';
import { newFilters } from '../src/hub';
import { MemoryStorage } from '../src/memory-storage';
import { deleteView, listViews, parseView, saveView, serializeView, viewPath } from '../src/views';

describe('saved views', () => {
  const v = () => ({ name: 'My open tasks', groupBy: 'person' as const, filters: { ...newFilters(), people: ['dana'], due: 'week' as const, text: 'logo' } });

  it('round trips, and ignores what it does not understand', () => {
    expect(parseView(serializeView(v()))).toEqual(v());
    const odd = parseView('{"name":"X","groupBy":"nonsense","filters":{"statuses":["doing","banana"],"due":"never","people":"notalist"}}')!;
    expect(odd).toMatchObject({ name: 'X', groupBy: 'due' });
    expect(odd.filters.statuses).toEqual(['doing']);
    expect(odd.filters.due).toBeUndefined();
    expect(odd.filters.people).toEqual([]);
    expect(parseView('not json')).toBeUndefined();
    expect(parseView('{"groupBy":"due"}')).toBeUndefined();
  });

  it('lives as a small file in .plainfile/views and is listed, replaced and deleted by name', async () => {
    const s = new MemoryStorage({});
    expect(viewPath('My open tasks!')).toBe('.plainfile/views/my-open-tasks.json');
    await saveView(s, v());
    await saveView(s, { name: 'Waiting on', groupBy: 'status', filters: { ...newFilters(), statuses: ['waiting'] } });
    expect((await listViews(s)).map((x) => x.name)).toEqual(['My open tasks', 'Waiting on']);
    await saveView(s, { ...v(), groupBy: 'phase' });
    expect((await listViews(s)).find((x) => x.name === 'My open tasks')?.groupBy).toBe('phase');
    await deleteView(s, 'Waiting on');
    expect((await listViews(s)).map((x) => x.name)).toEqual(['My open tasks']);
    expect(await listViews(new MemoryStorage({}))).toEqual([]);
  });
});
