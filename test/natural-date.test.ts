import { describe, expect, it } from 'vitest';
import { phraseDate, trailingPlainDate } from '../src/natural-date';
import { parseQuickLine } from '../src/quickline';

const TODAY = '2026-11-23'; // a Monday

describe('plain-words dates', () => {
  it('reads the phrases', () => {
    const d = (s: string) => phraseDate(s.split(' '), TODAY);
    expect(d('today')).toBe('2026-11-23');
    expect(d('tomorrow')).toBe('2026-11-24');
    expect(d('friday')).toBe('2026-11-27');
    expect(d('monday')).toBe('2026-11-30'); // never today
    expect(d('on thu')).toBe('2026-11-26');
    expect(d('this fri')).toBe('2026-11-27');
    expect(d('next fri')).toBe('2026-12-04'); // the Friday of next week
    expect(d('next mon')).toBe('2026-11-30');
    expect(d('next week')).toBe('2026-11-30');
    expect(d('next month')).toBe('2026-12-23');
    expect(d('in 3 days')).toBe('2026-11-26');
    expect(d('in 2 weeks')).toBe('2026-12-07');
    expect(d('in 1 month')).toBe('2026-12-23');
    expect(d('end of month')).toBe('2026-11-30');
    expect(d('eom')).toBe('2026-11-30');
    expect(d('fri')).toBeUndefined(); // a bare short name is too likely to be a word
    expect(d('soon')).toBeUndefined();
    expect(phraseDate(['in', '1', 'month'], '2026-01-31')).toBe('2026-02-28');
  });

  it('only looks at the end of the line, and skips @people, #tags and +Project after the date', () => {
    expect(trailingPlainDate(['Call', 'Dana', 'tomorrow'], TODAY)).toEqual({ iso: '2026-11-24', positions: [2] });
    expect(trailingPlainDate(['Call', 'tomorrow', '@dana', '#x', '+site'], TODAY)).toEqual({ iso: '2026-11-24', positions: [1] });
    expect(trailingPlainDate(['Plan', "tomorrow's", 'talk'], TODAY)).toBeUndefined();
    expect(trailingPlainDate(['Plan', 'tomorrow', 'talk'], TODAY)).toBeUndefined();
    expect(trailingPlainDate(['tomorrow'], TODAY)).toBeUndefined(); // the whole line is not a date
    expect(trailingPlainDate(['Renew', 'in', '3', 'days.'], TODAY)).toEqual({ iso: '2026-11-26', positions: [1, 2, 3] });
  });

  it('works in the quick add line, and an explicit due: wins', () => {
    const q = parseQuickLine('Call Dana tomorrow @dana #launch', TODAY);
    expect(q).toMatchObject({ due: '2026-11-24', title: 'Call Dana', people: ['dana'], tags: ['launch'] });
    expect(q.text).toBe('Call Dana due:2026-11-24 @dana #launch');
    expect(parseQuickLine('Send report next fri +Website', TODAY)).toMatchObject({ due: '2026-12-04', title: 'Send report', project: 'Website' });
    expect(parseQuickLine('Pay rent end of month', TODAY)).toMatchObject({ due: '2026-11-30', title: 'Pay rent' });
    const explicit = parseQuickLine('Call tomorrow due:fri', TODAY);
    expect(explicit.due).toBe('2026-11-27');
    expect(explicit.title).toBe('Call tomorrow');
    expect(parseQuickLine('Buy milk', TODAY).due).toBeUndefined();
    expect(parseQuickLine('Plan tomorrow talk', TODAY).due).toBeUndefined();
  });
});
