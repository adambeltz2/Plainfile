import { describe, expect, it } from 'vitest';
import { fmtDate, fmtDateLong } from '../src/dates';

describe('fmtDate and fmtDateLong', () => {
  it('format a day the way they always have', () => {
    expect(fmtDate('2026-11-23')).toBe('Mon 23 Nov');
    expect(fmtDateLong('2026-11-21')).toBe('Saturday 21 November');
  });
  it('give the same answer when asked again, since one formatter is reused', () => {
    expect([fmtDate('2026-12-03'), fmtDate('2026-12-03'), fmtDate('2026-01-01')]).toEqual(['Thu 3 Dec', 'Thu 3 Dec', 'Thu 1 Jan']);
  });
  it('do not throw on something that is not a date (a note title can end up here)', () => {
    expect(() => fmtDate('not a date')).not.toThrow();
    expect(() => fmtDateLong('')).not.toThrow();
    expect(fmtDate('not a date')).toBe('Invalid Date');
  });
});
