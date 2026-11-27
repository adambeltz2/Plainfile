/** Today as YYYY-MM-DD in the user's local time zone. */
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// One formatter each: building one per call is slow (a search listing thousands of notes formats thousands of dates).
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Like `toLocaleDateString`, a value that is not a date gives "Invalid Date" instead of throwing (a formatter object throws). */
function formatDay(f: Intl.DateTimeFormat, iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'Invalid Date' : f.format(d).replace(',', '');
}

/** "Mon 23 Nov" */
export function fmtDate(iso: string): string {
  return formatDay(SHORT_DATE, iso);
}

/** "Saturday 21 November" */
export function fmtDateLong(iso: string): string {
  return formatDay(LONG_DATE, iso);
}

/** The local calendar day (YYYY-MM-DD) of a time in ms since 1970. */
export function localDateOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
