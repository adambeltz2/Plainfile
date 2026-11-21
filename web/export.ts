import { toDocx } from '../src/docx';
import { dirname, joinPath } from '../src/index';
import { mimeFor } from '../src/attachments';
import { imagePaths, printPage, toHtml, toPlain, type RenderOptions } from '../src/render';
import { state } from './store';

/**
 * Getting a note out of markdown for other people: copy it as formatted text (it pastes into Word, Google Docs
 * and email with headings, lists and tables), download it as a Word file, or print it to PDF. The "clean" copy,
 * which is the default, leaves out the frontmatter and the #tags, @people and due: markers.
 */
const KEY = 'plainfile:export';

export function keepMarkers(): boolean {
  try {
    return localStorage.getItem(KEY) === 'keep';
  } catch {
    return false;
  }
}

export function setKeepMarkers(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'keep' : 'clean');
  } catch {
    /* a private window just forgets the choice */
  }
}

function dataUri(bytes: Uint8Array, mime: string): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}

/** The images a note shows, read from the folder as data addresses, so they travel with the pasted text. */
async function imageMap(md: string, notePath: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { storage, index } = state;
  if (!storage || !index) return out;
  for (const src of imagePaths(md)) {
    try {
      const rel = joinPath(dirname(notePath), decodeURI(src));
      const path = index.files.has(rel) ? rel : index.resolveEmbed(index.notes.get(notePath) ?? ({ path: notePath } as never), decodeURI(src));
      if (path) out.set(src, dataUri(await storage.readBinary(path), mimeFor(path)));
    } catch {
      /* a missing image is shown by its description instead */
    }
  }
  return out;
}

async function options(md: string, notePath: string): Promise<RenderOptions> {
  return { keepMarkers: keepMarkers(), images: await imageMap(md, notePath) };
}

const safeName = (title: string): string => title.replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'note';

/** Put the text on the clipboard as formatted text (and as plain text). Returns a short message about how it went. */
export async function copyFormatted(md: string, notePath: string): Promise<string> {
  const o = await options(md, notePath);
  const html = toHtml(md, o);
  const plain = toPlain(md, o);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      return 'Copied as formatted text. Paste it into Word, Docs or an email.';
    }
    await navigator.clipboard.writeText(plain);
    return 'Copied as plain text (this browser cannot copy formatted text).';
  } catch {
    return 'Could not copy. Allow clipboard access for this page, or use Download as Word.';
  }
}

function save(bytes: Uint8Array | string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadDocx(md: string, title: string, notePath: string): Promise<string> {
  const o = await options(md, notePath);
  save(toDocx(md, o, title), `${safeName(title)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return 'Downloaded as a Word file.';
}

/** Open the browser's print dialog for a clean copy, where Save as PDF is one of the choices. */
export async function printDocument(md: string, title: string, notePath: string): Promise<string> {
  const o = await options(md, notePath);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return 'Could not open the print view.';
  }
  doc.open();
  doc.write(printPage(title, toHtml(md, o)));
  doc.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  }, 250);
  return 'Opening the print view. Choose Save as PDF to make a file.';
}
