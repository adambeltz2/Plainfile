import { dirname } from '../src/index';
import { projectBook, statusReport } from '../src/report';
import { toHtml } from '../src/render';
import { ExistsError } from '../src/storage';
import { copyFormatted, downloadDocx, printDocument } from './export';
import { openNote } from './notes';
import { errorMessage, render, state, today } from './store';
import { esc } from './util';

/** The project status report: a preview you can copy for Word or email, download, print to PDF, or save as a note. */
export const rep = { path: '', message: '', kind: 'report' as 'report' | 'book' };

export function openReport(path: string, kind: 'report' | 'book' = 'report'): void {
  rep.kind = kind;
  rep.path = path;
  rep.message = '';
  render();
}

function current(): { md: string; title: string } | undefined {
  const idx = state.index;
  if (!idx || !rep.path) return undefined;
  const md = rep.kind === 'book' ? projectBook(idx, rep.path) : statusReport(idx, rep.path, today());
  if (!md) return undefined;
  return { md, title: idx.notes.get(rep.path)?.title ?? 'Project' };
}

export function html(): string {
  const r = current();
  if (!rep.path || !r) return '';
  return (
    `<div class="modal-back" data-report-backdrop><div class="modal report" role="dialog" aria-modal="true" aria-label="${rep.kind === 'book' ? 'All notes as one document' : 'Status report'}">` +
    `<h2>${rep.kind === 'book' ? 'All notes' : 'Status report'}: ${esc(r.title)}</h2><p class="muted small" style="margin:0 0 8px">A snapshot built from your notes. Copy it into an email or document, download it, or save it as a note.</p>` +
    `<div class="report-prev">${toHtml(r.md)}</div>` +
    `<div class="row-gap"><button class="btn primary" data-report-act="copy">Copy as formatted text</button><button class="btn" data-report-act="docx">Download Word</button><button class="btn" data-report-act="print">Print or PDF</button><button class="btn" data-report-act="save">Save as a note</button></div>` +
    `<div class="small" role="status" aria-live="polite" style="min-height:1.4em;margin-top:6px">${esc(rep.message)}</div>` +
    '<button class="modal-x btn small" data-report-act="close" aria-label="Close">Close</button></div></div>'
  );
}

async function saveAsNote(md: string, title: string): Promise<string> {
  const { storage, index } = state;
  if (!storage || !index) return '';
  const base = `reports/${title.replace(/[\\/:*?"<>|]+/g, '-').trim()} status ${today()}`;
  const body = `---\ntitle: "${title.replace(/"/g, '\\"')} status ${today()}"\ntype: report\ncreated: ${today()}\nproject: ${dirname(rep.path).split('/').pop() || index.notes.get(rep.path)?.name || ''}\ntags: []\n---\n\n${md}`;
  for (let n = 1; n < 100; n++) {
    const path = `${base}${n > 1 ? ` ${n}` : ''}.md`;
    try {
      await storage.create(path, body);
      await index.refreshFile(path);
      return path;
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error('Could not find a free name for the report.');
}

export async function click(target: HTMLElement): Promise<boolean> {
  if (!rep.path) return false;
  if (target.matches('[data-report-backdrop]')) {
    rep.path = '';
    render();
    return true;
  }
  const act = target.closest<HTMLElement>('[data-report-act]')?.dataset.reportAct;
  if (!act) return target.closest('.report') !== null;
  const r = current();
  if (act === 'close' || !r) {
    rep.path = '';
    render();
    return true;
  }
  try {
    if (act === 'copy') rep.message = await copyFormatted(r.md, rep.path);
    else if (act === 'docx') rep.message = await downloadDocx(r.md, `${r.title}${rep.kind === 'book' ? '' : ' status'}`, rep.path);
    else if (act === 'print') rep.message = await printDocument(r.md, `${r.title}${rep.kind === 'book' ? '' : ' status'}`, rep.path);
    else if (act === 'save') {
      const path = await saveAsNote(r.md, r.title);
      rep.path = '';
      await openNote(path);
      return true;
    }
  } catch (e) {
    rep.message = `Could not do that. ${errorMessage(e)}`;
  }
  render();
  return true;
}
