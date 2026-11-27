import { dirname, type VaultIndex } from './index';
import { relativePath } from './move';
import { ExistsError, type VaultStorage } from './storage';

/** Where pasted images are kept, at the top of the vault. */
export const ATTACHMENTS_DIR = '_attachments';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** A draw.io diagram saved as an image: `flow.drawio.svg` (or `.drawio.png`) shows anywhere and keeps its editable data inside the file. */
export const isDiagram = (path: string): boolean => /\.drawio\.(svg|png)$/i.test(path.replace(/[?#].*$/, ''));

export const isImageType = (mime: string): boolean => mime.startsWith('image/');

/** The MIME type for a file name, so an image can be shown from its bytes. */
export function mimeFor(path: string): string {
  return MIME[/\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

const two = (n: number): string => String(n).padStart(2, '0');

/** `pasted-2026-11-21-143512.png`: no spaces or colons, so links to it never need escaping. */
export function pastedName(mime: string, now: Date): string {
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `pasted-${stamp}.${EXT[mime.toLowerCase()] ?? 'png'}`;
}

/** A dropped file's own name, made safe for a link. Empty when it is just the generic name a paste gets. */
export function safeName(name: string): string {
  const clean = name
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+(\.\w+)$/, '$1')
    .replace(/^[.-]+|-+$/g, '');
  return /^(image|blob|pasted)\.\w+$/i.test(clean) || !clean ? '' : clean;
}

export interface SavedImage {
  path: string;
  /** What to type into the note: `![](../_attachments/pasted-….png)`, relative to the note. */
  markdown: string;
}

/**
 * Save an image beside the notes and say how the note should refer to it. Nothing is ever overwritten: a
 * name that is taken gets `-2`, `-3` and so on. The note itself is not touched here.
 */
export async function saveImage(
  storage: VaultStorage,
  index: VaultIndex,
  notePath: string,
  bytes: Uint8Array,
  mime: string,
  now: Date = new Date(),
  original = '',
): Promise<SavedImage> {
  const wanted = safeName(original) || pastedName(mime, now);
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const path = `${ATTACHMENTS_DIR}/${stem}${n > 1 ? `-${n}` : ''}${ext}`;
    try {
      await storage.createBinary(path, bytes);
      await index.refreshFile(path);
      return { path, markdown: `![](${relativePath(dirname(notePath), path)})` };
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error('Could not find a free name for the image.');
}
