export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape text and wrap each occurrence of a search word in <mark>. Words are matched case-insensitively. */
export function highlight(s: string, words: string[]): string {
  const ws = words.filter(Boolean);
  if (!ws.length) return esc(s);
  const low = s.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    let best = -1;
    let len = 0;
    for (const w of ws) {
      const p = low.indexOf(w, i);
      if (p > -1 && (best < 0 || p < best)) {
        best = p;
        len = w.length;
      }
    }
    if (best < 0) {
      out += esc(s.slice(i));
      break;
    }
    out += `${esc(s.slice(i, best))}<mark>${esc(s.slice(best, best + len))}</mark>`;
    i = best + len;
  }
  return out;
}
