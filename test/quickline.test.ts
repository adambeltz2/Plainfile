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
      title: 'Here is a task',
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
  it('gives a clean title without people, tags, due or project', () => {
    expect(parseQuickLine('Send logos +site @Adam #launch due:friday now', TODAY).title).toBe('Send logos now');
  });
});

describe('a priority in the quick add', () => {
  it('reads a leading (A) and keeps it out of the title', () => {
    const q = parseQuickLine('(A) Call Dana +site due:friday', TODAY);
    expect(q.priority).toBe('A');
    expect(q.title).toBe('Call Dana');
    expect(q.text.startsWith('(A) Call Dana')).toBe(true);
  });
  it('ignores a (A) that is not first, or not a capital', () => {
    expect(parseQuickLine('Call (A) Dana', TODAY).priority).toBeUndefined();
    expect(parseQuickLine('(a) Call Dana', TODAY).priority).toBeUndefined();
    expect(parseQuickLine('(a) Call Dana', TODAY).title).toBe('(a) Call Dana');
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

describe('a repeat in the quick add', () => {
  it('reads every week, every 2 weeks, every monday and weekly at the end of the line', () => {
    expect(parseQuickLine('Team sync every week', TODAY)).toMatchObject({ rec: '1w', title: 'Team sync', text: 'Team sync rec:1w' });
    expect(parseQuickLine('Pay rent +site every month', TODAY)).toMatchObject({ rec: '1m', title: 'Pay rent', project: 'site' });
    expect(parseQuickLine('Check in every 2 weeks', TODAY)).toMatchObject({ rec: '2w', title: 'Check in' });
    expect(parseQuickLine('Water plants daily', TODAY)).toMatchObject({ rec: '1d', title: 'Water plants' });
  });
  it('makes `every monday` repeat weekly and first due on the next Monday', () => {
    const q = parseQuickLine('Standup every monday', TODAY);
    expect(q.rec).toBe('1w');
    expect(q.due).toBe('2026-11-23');
    expect(q.title).toBe('Standup');
    expect(q.text).toBe('Standup rec:1w due:2026-11-23');
  });
  it('takes rec: typed by hand, and leaves a title that only mentions every alone', () => {
    expect(parseQuickLine('Plan rec:+3d due:friday', TODAY)).toMatchObject({ rec: '+3d', title: 'Plan' });
    expect(parseQuickLine('Fix every bug in the list', TODAY).rec).toBeUndefined();
    expect(parseQuickLine('Fix every bug in the list', TODAY).title).toBe('Fix every bug in the list');
  });
});
