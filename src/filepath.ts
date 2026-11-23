/**
 * A note's location on this computer. A browser knows a folder only by name, never by where it sits on disk, so the
 * app is told once (and remembers it in this browser) and then joins it to a note's path inside the folder, in the
 * style it was written: `C:\Users\you\Notes` gets backslashes, `/Users/you/Notes` gets slashes.
 */
export function fullPath(base: string, rel: string): string {
  const b = base.trim().replace(/[\\/]+$/, '');
  const windows = /^[A-Za-z]:/.test(b) || b.startsWith('\\\\') || (b.includes('\\') && !b.startsWith('/'));
  const sep = windows ? '\\' : '/';
  const parts = rel.split('/').filter(Boolean);
  return [windows ? b.replace(/\//g, '\\') : b, ...parts].join(sep);
}

/** A path in Dropbox: the folder that was opened (if not the whole Dropbox) and then the note's path inside it. */
export function dropboxPath(root: string, rel: string): string {
  const r = root.trim().replace(/^\/+|\/+$/g, '');
  return `/${[r, rel].filter(Boolean).join('/')}`;
}
