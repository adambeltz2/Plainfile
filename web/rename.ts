import { dirname } from '../src/index';
import { applyOutsideRename, applyRename, planOutsideRename, planRename, type RenamePlan, type RenameResult } from '../src/rename';
import { errorMessage, render, state } from './store';
import { esc } from './util';
import { flush, notes, openNote } from './notes';

export const rn = {
  mode: 'in' as 'in' | 'out',
  path: undefined as string | undefined,
  name: '',
  alias: true,
  excluded: new Set<string>(),
  result: undefined as RenameResult | undefined,
  error: '',
};

const baseName = (p: string): string => (p.split('/').pop() ?? p).replace(/\.md$/i, '');

export async function openRename(path: string | undefined, mode: 'in' | 'out' = 'in'): Promise<void> {
  await flush();
  rn.mode = mode;
  rn.path = path;
  rn.name = path ? baseName(path) : '';
  rn.excluded = new Set();
  rn.result = undefined;
  rn.error = '';
  state.screen = 'rename';
  state.modal = undefined;
  render();
}

function currentPlan(): RenamePlan | string {
  const idx = state.index;
  if (!idx || !rn.path) return 'Open a note first.';
  try {
    return planRename(idx, rn.path, rn.name);
  } catch (e) {
    return errorMessage(e);
  }
}

function diffLines(before: string, after: string): string {
  return (
    `<div class="diff plain-box"><div class="del"><span class="sg">−</span><span>${esc(before)}</span></div>` +
    `<div class="add"><span class="sg">+</span><span>${esc(after)}</span></div></div>`
  );
}

function planHtml(plan: RenamePlan, boxes: boolean): string {
  const chosen = plan.edits.filter((e) => !rn.excluded.has(e.id));
  const files = new Set(chosen.map((e) => e.path));
  let h = `<p class="meta" style="margin:14px 0 0">${chosen.length} link${chosen.length === 1 ? '' : 's'} in ${files.size} file${files.size === 1 ? '' : 's'} will update · only the link text changes</p>`;
  for (const e of plan.edits) {
    const body = `<span class="mono small">${esc(e.path)} · line ${e.line}</span>${diffLines(e.before, e.after)}`;
    h += boxes
      ? `<div class="fcard"><label class="check"><input type="checkbox" data-include="${esc(e.id)}"${rn.excluded.has(e.id) ? '' : ' checked'}><span style="min-width:0;flex:1">${body}</span></label></div>`
      : `<div class="fcard">${body}</div>`;
  }
  if (!plan.edits.length) h += '<p class="muted small">No other notes link to this one by name.</p>';
  if (rn.alias) {
    h += `<div class="fcard"><span class="mono small">${esc(plan.to)} · frontmatter</span><div class="diff plain-box"><div class="add"><span class="sg">+</span><span>aliases: [${esc(plan.oldName)}]</span></div></div></div>`;
  }
  const skipped = plan.edits.length - chosen.length;
  if (skipped && !rn.alias) h += `<div class="notice err small">${skipped} unchecked link${skipped === 1 ? '' : 's'} will stop working. Turn on the alias to keep ${skipped === 1 ? 'it' : 'them'} working.</div>`;
  else if (skipped) h += `<div class="notice small">${skipped} unchecked link${skipped === 1 ? '' : 's'} will keep working through the alias.</div>`;
  if (plan.nameClash) h += `<div class="notice small">Another note already has this name, so updated links include the folder: <span class="mono">${esc(plan.to.replace(/\.md$/i, ''))}</span>.</div>`;
  for (const w of plan.warnings) h += `<div class="notice small">${esc(w)}</div>`;
  return h;
}

function previewHtml(): string {
  if (rn.result) {
    const r = rn.result;
    let h = `<div class="notice ok"><b>Renamed to ${esc(r.to)}</b><br>${r.changes.length} link${r.changes.length === 1 ? '' : 's'} updated${rn.alias ? ', old name kept as an alias' : ''}. To undo, rename it back.</div>`;
    h += '<div class="diff"><div class="cap">What changed on disk</div>';
    h += `<div class="del"><span class="sg">−</span><span>${esc(r.from)}</span></div><div class="add"><span class="sg">+</span><span>${esc(r.to)}</span></div>`;
    for (const c of r.changes) {
      h += `<div class="muted">${esc(c.path)}:${c.line}</div><div class="del"><span class="sg">−</span><span>${esc(c.before)}</span></div><div class="add"><span class="sg">+</span><span>${esc(c.after)}</span></div>`;
    }
    h += `</div><div class="row-gap"><button class="btn primary" data-open="${esc(r.to)}">Open the renamed note</button></div>`;
    return h;
  }
  let h = '';
  if (rn.error) h += `<div class="notice err">${esc(rn.error)}</div>`;
  const plan = currentPlan();
  if (typeof plan === 'string') return `${h}<p class="meta" style="margin-top:14px">${esc(plan)}</p>`;
  const n = plan.edits.filter((e) => !rn.excluded.has(e.id)).length;
  return `${h}${planHtml(plan, true)}<div class="row-gap"><button class="btn primary" data-act="rn-go">Rename and update ${n} link${n === 1 ? '' : 's'}</button></div>`;
}

function outsideHtml(): string {
  const idx = state.index;
  if (!idx) return '';
  if (rn.result) return previewHtml();
  if (!state.renames.length) {
    return '<div class="empty">No outside renames found. If you rename a file in another app, Plainfile spots it on the next rescan, when a file disappears and an identical one appears.</div>';
  }
  let h = '';
  for (const pair of state.renames) {
    const plan = planOutsideRename(idx, pair.from, pair.to);
    h +=
      `<div class="notice" style="margin-top:12px"><b>Found during rescan.</b> <span class="mono">${esc(pair.from)}</span> is gone and <span class="mono">${esc(pair.to)}</span> appeared.` +
      '<ul style="margin:8px 0 0;padding-left:18px"><li>The text is identical</li><li>No <span class="mono">id:</span> in the file, so it was matched by content only</li></ul></div>' +
      planHtml(plan, false) +
      `<div class="row-gap"><button class="btn primary" data-out-fix="${esc(pair.from)}">Yes, it was renamed. Fix ${plan.edits.length} link${plan.edits.length === 1 ? '' : 's'}</button>` +
      `<button class="btn" data-out-dismiss="${esc(pair.from)}">No, different note</button></div>`;
  }
  return h;
}

export function html(): string {
  const idx = state.index;
  if (!idx) return '';
  const note = rn.path ? idx.notes.get(rn.path) : undefined;
  let h = '<div class="frame two"><aside class="side"><div><h2>Note</h2>';
  h += rn.path ? `<p class="mono small" style="margin:0;overflow-wrap:anywhere">${esc(rn.path)}</p>` : '<p class="muted small" style="margin:0">None chosen</p>';
  h += '</div><div><h2>Linked from</h2>';
  const back = rn.path ? idx.backlinks(rn.path) : [];
  h += back.length
    ? `<ul class="plain">${[...new Set(back.map((b) => b.from))].map((f) => `<li class="mono small" style="overflow-wrap:anywhere">${esc(f)}</li>`).join('')}</ul>`
    : '<p class="muted small" style="margin:0">Nothing links here.</p>';
  h += '</div></aside><section class="main"><h2 class="title">Rename a note</h2>';
  // "Renamed outside" is only for fixing links after a file was renamed in another app. It shows up when one is found.
  if (state.renames.length || rn.mode === 'out') {
    h += `<div class="ed-bar"><div class="seg" role="group" aria-label="Rename scenario"><button data-rn-mode="in" aria-pressed="${rn.mode === 'in'}">Rename in Plainfile</button>` +
      `<button data-rn-mode="out" aria-pressed="${rn.mode === 'out'}">Renamed outside${state.renames.length ? ` <span class="badge">${state.renames.length}</span>` : ''}</button></div></div>`;
    if (rn.mode === 'out') h += '<p class="muted small" style="margin:6px 0 0">A file was renamed in another app (Finder, Dropbox, an editor). Plainfile noticed, and can fix the links that now point nowhere.</p>';
  }
  if (rn.mode === 'in') {
    if (rn.result) {
      h += `<div id="rn-preview">${previewHtml()}</div>`;
    } else if (!rn.path || !note) {
      h += '<div class="empty">Open a note in Notes and press Rename. Renaming here rewrites every link to it, with a preview first.</div>';
    } else {
      h +=
        `<div class="fld" style="max-width:26rem"><label for="rn-name">New name</label><div style="display:flex;gap:6px;align-items:center"><input id="rn-name" class="inp" autocomplete="off" spellcheck="false" value="${esc(rn.name)}"${rn.result ? ' disabled' : ''}><span class="mono muted">.md</span></div>` +
        `<span class="muted small mono">${esc(dirname(rn.path) ? `${dirname(rn.path)}/` : '')}</span></div>` +
        `<label class="check"><input type="checkbox" id="rn-alias"${rn.alias ? ' checked' : ''}${rn.result ? ' disabled' : ''}> Keep the old name as an alias, so old links still resolve</label>` +
        `<div id="rn-preview">${previewHtml()}</div>`;
    }
  } else h += `<div id="rn-out">${outsideHtml()}</div>`;
  h += '<p class="note">Back-links are not stored anywhere. Plainfile works them out from the links in your files, so they stay correct as long as the links resolve.</p></section></div>';
  return h;
}

function updatePreview(): void {
  const el = document.getElementById('rn-preview');
  if (el) el.innerHTML = previewHtml();
}

async function go(): Promise<void> {
  const { storage, index } = state;
  const plan = currentPlan();
  if (!storage || !index || typeof plan === 'string') return;
  try {
    const include = new Set(plan.edits.filter((e) => !rn.excluded.has(e.id)).map((e) => e.id));
    const wasOpen = notes.path === plan.from;
    rn.result = await applyRename(storage, index, plan, { include, keepAlias: rn.alias });
    if (wasOpen) {
      notes.handle?.destroy();
      notes.handle = undefined;
      notes.path = undefined;
    }
  } catch (e) {
    rn.error = `Stopped part-way. Nothing was lost: if the new file exists, the old one is still there too. ${errorMessage(e)}`;
    await index.scan().catch(() => undefined);
  }
  render();
}

async function fixOutside(from: string): Promise<void> {
  const { storage, index } = state;
  const pair = state.renames.find((r) => r.from === from);
  if (!storage || !index || !pair) return;
  try {
    const plan = planOutsideRename(index, pair.from, pair.to);
    rn.result = await applyOutsideRename(storage, index, plan, { include: new Set(plan.edits.map((e) => e.id)), keepAlias: rn.alias });
    state.renames = state.renames.filter((r) => r.from !== from);
  } catch (e) {
    rn.error = errorMessage(e);
  }
  render();
}

export async function click(target: HTMLElement): Promise<boolean> {
  const mode = target.closest<HTMLElement>('[data-rn-mode]')?.dataset.rnMode;
  if (mode === 'in' || mode === 'out') {
    rn.mode = mode;
    rn.result = undefined;
    rn.error = '';
    render();
    return true;
  }
  if (target.closest('[data-act="rn-go"]')) {
    await go();
    return true;
  }
  const fix = target.closest<HTMLElement>('[data-out-fix]')?.dataset.outFix;
  if (fix) {
    await fixOutside(fix);
    return true;
  }
  const dismiss = target.closest<HTMLElement>('[data-out-dismiss]')?.dataset.outDismiss;
  if (dismiss) {
    state.renames = state.renames.filter((r) => r.from !== dismiss);
    render();
    return true;
  }
  const open = target.closest<HTMLElement>('[data-open]')?.dataset.open;
  if (open && rn.result) {
    rn.result = undefined;
    await openNote(open);
    return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'rn-name') {
    rn.name = t.value;
    rn.error = '';
    updatePreview();
    return true;
  }
  return false;
}

export function change(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'rn-alias') {
    rn.alias = t.checked;
    updatePreview();
    return true;
  }
  const inc = t.dataset.include;
  if (inc !== undefined) {
    if (t.checked) rn.excluded.delete(inc);
    else rn.excluded.add(inc);
    updatePreview();
    return true;
  }
  return false;
}
