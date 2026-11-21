import { describe, expect, it } from 'vitest';
import { findProject, parseDueWord, parseQuickLine } from '../src/quickline';
import type { Project } from '../src/projects';

const TODAY = '2026-11-21'; // a Saturday

describe('parseDueWord', () => {
  it('understands words, weekdays, offsets and ISO dates', () => {
    expect(parseDueWord('today', TODAY)).toBe('2026-11-21');
    expect(parseDueWord('Tomorrow', TODAY)).toBe('2026-11-22');
    expect(parseDueWord('next-week', TODAY)).toBe('2026-11-28');
    expect(parseDueWord('mon', TODAY)).toBe('2026-11-23');
    expect(parseDueWord('saturday', TODAY)).toBe('2026-11-28');
    expect(parseDueWord('+3d', TODAY)).toBe('2026-11-24');
    expect(parseDueWord('2w', TODAY)).toBe('2026-12-05');
    expect(parseDueWord('2026-12-01', TODAY)).toBe('2026-12-01');
    expect(parseDueWord('soonish', TODAY)).toBeUndefined();
  });
});

describe('parseQuickLine', () => {
  it('reads the user examples', () => {
    expect(parseQuickLine('Here is a task @Adam due:today', TODAY)).toEqual({
      text: 'Here is a task @Adam due:2026-11-21',
      due: '2026-11-21',
      people: ['Adam'],
      tags: [],
    });
    const r = parseQuickLine('Here is a task +Project @Adam due:tomorrow', TODAY);
    expect(r.text).toBe('Here is a task @Adam due:2026-11-22');
    expect(r.project).toBe('Project');
    expect(r.people).toEqual(['Adam']);
    expect(r.due).toBe('2026-11-22');
  });
  it('collects tags, and flags a due word it cannot read', () => {
    const r = parseQuickLine('Plan #launch #area/home due:someday', TODAY);
    expect(r.tags).toEqual(['launch', 'area/home']);
    expect(r.badDue).toBe('someday');
    expect(r.due).toBeUndefined();
    expect(r.text).toContain('due:someday');
  });
  it('does not treat +3d style words as projects', () => {
    expect(parseQuickLine('Buy milk +3d', TODAY).project).toBeUndefined();
  });
});

describe('findProject', () => {
  const p = (path: string, title: string): Project => ({ path, title, active: true, preview: '', openTasks: 0, followups: 0 });
  const list = [p('projects/kitchen-remodel/index.md', 'Kitchen Remodel'), p('projects/site.md', 'Website relaunch')];
  it('matches title, folder or file name loosely', () => {
    expect(findProject(list, 'Kitchen-Remodel')?.path).toBe('projects/kitchen-remodel/index.md');
    expect(findProject(list, 'kitchen')?.path).toBe('projects/kitchen-remodel/index.md');
    expect(findProject(list, 'site')?.path).toBe('projects/site.md');
    expect(findProject(list, 'nope')).toBeUndefined();
  });
});
