/** Today as YYYY-MM-DD in the user's local time zone. */
export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Mon 23 Nov" */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace(',', '');
}

/** "Saturday 21 November" */
export function fmtDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .replace(',', '');
}
