import { bestLinkTarget, retargetMarkdownLink, retargetWikiLink } from '../src/fixes';
import { newNoteForLink } from '../src/linknote';
import { ExistsError } from '../src/storage';
import { errorMessage, getHealth, rescan, render, state, today, writeFailure, type Log } from './store';
import { esc } from './util';

type Cat = 'links' | 'dups' | 'orphans' | 'embeds' | 'attachments';

export const healthState = { cat: 'links' as Cat, log: undefined as Log | undefined };

interface Section {
  id: Cat;
  name: string;
  help: string;
  count: number;
  items: string;
}

function openBtn(path: string, line?: number, label = 'Open'): string {
  return `<button class="btn small" data-open="${esc(path)}"${line ? ` data-line="${line}"` : ''}>${label}</button>`;
}

function sections(): Section[] {
  const r = getHealth(true);
  const idx = state.index;
  if (!r || !idx) return [];
  const item = (main: string, sub: string, acts: string): string =>
    `<li class="res"><div class="row"><div style="min-width:0"><div class="rt mono small">${main}</div><div class="sn small">${sub}</div></div><div class="acts">${acts}</div></div></li>`;

  const links = [
    ...r.unresolved.map((u) => {
      const fixTo = u.kind === 'wiki' && u.suggestionPath ? bestLinkTarget(idx, u.from, u.suggestionPath) : '';
      const fix = fixTo
        ? `<button class="btn small primary" data-fix-from="${esc(u.from)}" data-fix-line="${u.line}" data-fix-old="${esc(u.target)}" data-fix-to="${esc(fixTo)}">Link to ${esc(fixTo)}</button>`
        : u.kind === 'md' && u.suggestionPath
          ? `<button class="btn small primary" data-fixmd-from="${esc(u.from)}" data-fixmd-line="${u.line}" data-fixmd-old="${esc(u.target)}" data-fixmd-to="${esc(u.suggestionPath)}">Link to ${esc(u.suggestionPath)}</button>`
          : '';
      const create = `<button class="btn small" data-create-from="${esc(u.from)}" data-create-kind="${u.kind}" data-create-target="${esc(u.target.split('#')[0] ?? u.target)}" title="Make this note, beside the one that links to it">Create note</button>`;
      return item(
        `${u.kind === 'wiki' ? `[[${esc(u.target)}]]` : esc(u.target)}`,
        `${esc(u.from)}:${u.line}${u.suggestion ? ` · closest match: ${esc(u.suggestion)}` : ' · no close match'}`,
        fix + create + openBtn(u.from, u.line),
      );
    }),
    ...r.ambiguous.map((u) =>
      item(
        `[[${esc(u.target)}]]`,
        `${esc(u.from)}:${u.line} · matches ${u.candidates.length} notes. Pick one:`,
        (u.kind === 'wiki'
          ? u.candidates
              .map(
                (c) =>
                  `<button class="btn small" data-fix-from="${esc(u.from)}" data-fix-line="${u.line}" data-fix-old="${esc(u.target)}" data-fix-to="${esc(c.replace(/\.md$/i, ''))}">${esc(c)}</button>`,
              )
              .join('')
          : '') + openBtn(u.from, u.line),
      ),
    ),
  ];
  return [
    {
      id: 'links',
      name: 'Broken links',
      help: 'Links that point to nothing, or to more than one note. A fix edits only the link text.',
      count: links.length,
      items: links.join(''),
    },
    {
      id: 'dups',
      name: 'Duplicate names',
      help: 'Two notes share a name, so a link by name is ambiguous. Links will include the folder.',
      count: r.duplicates.length,
      items: r.duplicates
        .map((d) =>
          item(esc(d.name), esc(d.paths.join(', ')), d.paths.map((p) => openBtn(p, undefined, `Open ${esc(p.split('/').slice(-2).join('/'))}`)).join('')),
        )
        .join(''),
    },
    {
      id: 'orphans',
      name: 'Orphan notes',
      help: 'Notes with no links in or out. They are only findable by search.',
      count: r.orphans.length,
      items: r.orphans.map((p) => item(esc(p), 'No links to or from this note.', openBtn(p))).join(''),
    },
    {
      id: 'embeds',
      name: 'Missing images',
      help: 'Images and files a note refers to that are not in the folder.',
      count: r.missingEmbeds.length,
      items: r.missingEmbeds.map((m) => item(esc(m.target), `${esc(m.from)}:${m.line}`, openBtn(m.from, m.line))).join(''),
    },
    {
      id: 'attachments',
      name: 'Unused attachments',
      help: 'Images and files that no note refers to. Nothing is deleted automatically.',
      count: r.unusedAttachments.length,
      items: r.unusedAttachments.map((p) => item(esc(p), 'Not used by any note.', '')).join(''),
    },
  ];
}

export function html(): string {
  const secs = sections();
  const r = getHealth(true);
  if (!secs.length || !r) return '';
  const total = secs.reduce((n, s) => n + s.count, 0);
  const cur = secs.find((s) => s.id === healthState.cat) ?? secs[0]!;
  let h = '<div class="frame two"><aside class="side"><div><h2>Checks</h2><ul>';
  for (const s of secs) {
    h += `<li><button class="item" data-cat="${s.id}" aria-current="${s.id === cur.id}">${esc(s.name)} <span class="n">${s.count || '✓'}</span></button></li>`;
  }
  h += `</ul></div><div class="stat">${state.index?.notes.size ?? 0} notes</div></aside><section class="main"><h2 class="title">Vault health</h2>`;
  h += `<p class="meta">${total ? `${total} thing${total === 1 ? '' : 's'} worth a look. None of them stop anything from working.` : 'All checks are clear.'}</p>`;
  h += `<div class="grp" style="margin-top:0">${esc(cur.name)}</div><p class="muted small" style="margin:0 0 6px">${esc(cur.help)}</p>`;
  h += cur.count ? `<ul class="plain">${cur.items}</ul>` : '<div class="empty">Nothing to fix here.</div>';
  const log = healthState.log;
  if (log) {
    if ('message' in log) h += `<div class="diff plain"><div class="cap">Not saved</div>${esc(log.message)}</div>`;
    else {
      h +=
        `<div class="diff"><div class="cap">What changed on disk</div><div class="muted">${esc(log.path)}:${log.line}</div>` +
        `<div class="del"><span class="sg">−</span><span>${esc(log.before)}</span></div>` +
        `<div class="add"><span class="sg">+</span><span>${esc(log.after)}</span></div></div>`;
    }
  }
  h += `<p class="note">Nothing here blocks you from working. Every fix edits the smallest piece of text and shows what it changed. ${r.untyped.length} note${r.untyped.length === 1 ? ' has' : 's have'} no type, which is fine.</p></section></div>`;
  return h;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const cat = target.closest<HTMLElement>('[data-cat]')?.dataset.cat as Cat | undefined;
  if (cat) {
    healthState.cat = cat;
    healthState.log = undefined;
    render();
    return true;
  }
  const create = target.closest<HTMLElement>('[data-create-from]');
  if (create) {
    const { storage, index } = state;
    if (!storage || !index) return true;
    let log: Log;
    try {
      const plan = newNoteForLink(
        create.dataset.createFrom ?? '',
        { kind: create.dataset.createKind === 'md' ? 'md' : 'wiki', target: create.dataset.createTarget ?? '' },
        today(),
      );
      await storage.create(plan.path, plan.content);
      await index.refreshFile(plan.path);
      log = { path: plan.path, line: 2, before: '', after: `title: ${plan.title}`, written: true };
    } catch (e) {
      const friendly = e instanceof ExistsError ? 'That note already exists. Rescan to update this list.' : writeFailure(e);
      log = { message: friendly ?? `Could not create the note. ${errorMessage(e)}` };
    }
    await rescan(); // the list is worked out again from the files
    healthState.log = log;
    render();
    return true;
  }
  const fixMd = target.closest<HTMLElement>('[data-fixmd-from]');
  if (fixMd) {
    const { storage, index } = state;
    if (!storage || !index) return true;
    try {
      healthState.log = await retargetMarkdownLink(
        storage,
        index,
        fixMd.dataset.fixmdFrom ?? '',
        Number(fixMd.dataset.fixmdLine),
        fixMd.dataset.fixmdOld ?? '',
        fixMd.dataset.fixmdTo ?? '',
      );
    } catch (e) {
      const friendly = writeFailure(e);
      if (friendly) await rescan();
      healthState.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
    }
    render();
    return true;
  }
  const fix = target.closest<HTMLElement>('[data-fix-from]');
  if (fix) {
    const { storage, index } = state;
    if (!storage || !index) return true;
    try {
      healthState.log = await retargetWikiLink(
        storage,
        index,
        fix.dataset.fixFrom ?? '',
        Number(fix.dataset.fixLine),
        fix.dataset.fixOld ?? '',
        fix.dataset.fixTo ?? '',
      );
    } catch (e) {
      const friendly = writeFailure(e);
      if (friendly) await rescan();
      healthState.log = { message: friendly ?? `Could not save that change. ${errorMessage(e)}` };
    }
    render();
    return true;
  }
  return false;
}
