import { ALIASES, STATUSES } from '../src/fields';
import { frontmatterKeys, tagCounts } from '../src/vocabulary';
import { state } from './store';
import { esc } from './util';

/** The cheat sheet: how notes are written, with examples you can copy, and what your own vault already uses. */

const KNOWN = new Set(['title', 'type', 'tags', 'status', 'due', 'project', 'aliases', 'active', 'sortOrder']);

const EX = {
  note: `---
title: Kickoff call with Dana
type: meeting
date: 2026-11-17
project: website-relaunch
tags: [launch, meeting]
aliases: [Dana call]
---

## Decisions
- Launch date is **Dec 8**
- [ ] Send logo files @dana due:2026-11-23
- [ ] Draft the memo status:doing       # or status:waiting`,
  tags: `tags: [launch, meeting]        # a short list in the frontmatter

tags:                          # or one per line
  - launch
  - meeting

See #launch and #area/home     # tags can sit in the text too`,
  quick: `Send logo files +website-relaunch @dana #launch due:friday

start with (A) for a priority: (A) Call Dana +site
repeat at the end: Team sync every week  ·  Standup every monday
plus: due:today  due:tomorrow  due:mon  due:next-week  due:+3d  due:2026-11-23

or dates in plain words at the end of the line:
Call Dana tomorrow  ·  Send report next fri  ·  Renew in 3 days  ·  Pay rent end of month`,
  task: `- [ ] Send logo files @dana #launch due:2026-11-23 created:2026-11-21
- [x] Share staging link`,
  taskfile: `---
title: Write pricing page copy
status: doing
due: 2026-11-24
created: 2026-11-21
project: website-relaunch
tags: [launch]
people: [dana]
---
Draft three tiers.`,
  links: `[[pricing-research]]                 a link by name
[[pricing-research|the research]]    with your own words shown
[[projects/site/index]]              with a folder, if two notes share a name
[the plan](projects/site/plan.md)    a normal markdown link
![logo](../_attachments/logo.png)    an image`,
  follow: `- Ask Dana to confirm the launch date #followup`,
  project: `---
title: Kitchen Remodel
active: true
sortOrder: 1
---
Cabinet quote came in at $14,200.`,
  dates: `created:2026-11-21      when it was added (filled in for you)
done:2026-11-23         when it was finished (filled in when you tick it)
rec:1w                  repeats a week after its due date (rec:+3d: 3 days after you finish it)
due:2026-11-23          what Plainfile writes
#due:2026-11-23         from the first Notebook app
📅 2026-11-23           Obsidian Tasks
[due:: 2026-11-23]      Dataview`,
  template: `---
plainfile:
  name: Weekly review
  folder: reviews
  filename: "{{date}} review"
title: Review {{date}}
tags: [review]
---
## Wins
{{cursor}}

## Next week`,
};

const KEYS: [string, string, string][] = [
  ['title', 'title: Kickoff call', 'The name shown in lists and links. If missing, the first # heading, then the file name.'],
  ['type', 'type: meeting', 'Groups notes. type: project makes a Project card. type: task makes a task file.'],
  ['tags', 'tags: [launch, meeting]', 'Same as #launch in the text. Find them with tag:launch in Search.'],
  ['status', 'status: doing', 'Makes a task file (in a tasks/ folder, or with type: task). Board columns: todo, doing, waiting, done.'],
  ['due', 'due: 2026-11-24', 'The date for a task file. It appears in Today.'],
  ['created', 'created: 2026-11-21', 'When a note or task was made. Plainfile fills it in for tasks, notes in a project, and new projects.'],
  ['people', 'people: [dana, sam]', 'Who a task file involves, the same as @dana in an inline task. Search with @dana.'],
  ['project', 'project: website-relaunch', 'Groups task files on the Board and links related notes in Explorer.'],
  ['aliases', 'aliases: [Dana, D. Ortiz]', 'Other names a [[link]] can use. Renaming a note adds its old name here.'],
  ['active', 'active: true', 'With sortOrder, makes a numbered Project card. active: false keeps it, collapsed.'],
  ['sortOrder', 'sortOrder: 1', 'The order of Project cards, lowest first.'],
  ['anything else', 'client: Northfield', 'Kept exactly as you wrote it and shown in the properties panel.'],
];

const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd + P', 'Go to a note by a few letters, make a new one, or run an action. Try "move kick" to move the note whose name matches'],
  ['Ctrl/Cmd + K', 'Search'],
  ['Ctrl/Cmd + S', 'Save the open note now (it also saves by itself)'],
  ['Ctrl/Cmd + B / I', 'Bold or italic the selection (press again to take it off); with nothing selected, type between the marks'],
  ['Ctrl/Cmd + V on an image', 'Paste a screenshot into the open note: it is saved in _attachments and shown inline'],
  [
    '⋯ More, then Copy as formatted text',
    'Copy the note (or the selection) cleanly for Word, Docs or email. Also under Download as Word and Print or save as PDF',
  ],
  ['Alt + N', 'Quick note: titled with the date and time, ready to type'],
  ['J and K, then X or E (on Today)', 'Move down and up the task list, tick the chosen task (X), or open its note (E)'],
  ['F2', 'Rename the open note'],
  ['Ctrl/Cmd + Shift + M', 'Move the open note to another folder'],
  ['Ctrl/Cmd + Shift + X', 'Toggle X-ray'],
  ['Ctrl/Cmd + Shift + E', 'Explore notes related to the open note'],
  ['Right-click or long-press a note', 'Its actions: open, move, rename, duplicate, pin, copy link, delete'],
  ['?', 'This cheat sheet'],
  ['Esc', 'Close a menu, dialog or focus mode'],
];

const OPERATORS: [string, string][] = [
  ['tag:launch   #launch', 'Notes and tasks with that tag'],
  ['folder:projects', 'Only inside a folder'],
  ['type:meeting', 'Notes of a type. type:task finds tasks'],
  ['is:task  is:note  is:open  is:done', 'Narrow by kind or state'],
  ['due:<2026-12-01   due:>2026-11-20   due:2026-11-24', 'Tasks by due date'],
  ['modified:today  modified:week  modified:<2026-11-01', 'Notes changed on a day, in the last week, or before a date'],
  ['created:today  created:2026-11-21', 'Notes and tasks by their created date'],
  ['@dana', 'A person on a task, or a name in the text'],
  ['"exact phrase"', 'Words in that order'],
];

function block(id: string, caption: string, code: string): string {
  return (
    `<div class="ex"><div class="ex-h"><span>${esc(caption)}</span><button class="btn small" data-copy="${id}">Copy</button></div>` +
    `<pre class="code" id="ex-${id}">${esc(code)}</pre></div>`
  );
}

function section(id: string, title: string, body: string): string {
  return `<section class="gsec" id="sec-${id}"><h3>${esc(title)}</h3>${body}</section>`;
}

function vault(): string {
  const idx = state.index;
  if (!idx) return '<p class="muted">Open a folder to see the tags and keys your own notes use.</p>';
  const tags = tagCounts(idx).slice(0, 60);
  const keys = frontmatterKeys(idx);
  let h = '';
  if (!tags.length) h += '<p class="muted">No tags yet. Add <code>tags: [launch]</code> to a note, or <code>#launch</code> in its text.</p>';
  else {
    const max = tags[0]?.count ?? 1;
    h += '<div class="cloud" role="list" aria-label="Tags in your vault, bigger means more notes">';
    for (const t of tags) {
      const size = max > 1 ? 13 + 15 * (Math.log(t.count) / Math.log(max)) : 16;
      h += `<button class="cloud-tag mono" role="listitem" style="font-size:${size.toFixed(1)}px" data-search-q="tag:${esc(t.tag)}" title="${t.count} note${t.count === 1 ? '' : 's'}. Click to search.">#${esc(t.tag)}<sup>${t.count}</sup></button>`;
    }
    h += '</div>';
  }
  h += '<h4>Frontmatter keys your notes use</h4>';
  if (!keys.length) return `${h}<p class="muted">None of your notes have frontmatter yet. That is fine: plain notes work too.</p>`;
  h += '<div class="table-wrap"><table><thead><tr><th>Key</th><th>Notes</th><th>Example values</th><th>Plainfile uses it</th></tr></thead><tbody>';
  for (const k of keys) {
    h += `<tr><td class="mono">${esc(k.key)}</td><td>${k.count}</td><td class="mono small">${k.samples.map(esc).join(' &nbsp; ')}</td><td>${KNOWN.has(k.key) ? 'yes' : '<span class="muted">kept as written</span>'}</td></tr>`;
  }
  return `${h}</tbody></table></div>`;
}

export function html(): string {
  const toc: [string, string][] = [
    ['note', 'A note'],
    ['keys', 'Keys'],
    ['tags', 'Tags'],
    ['tasks', 'Tasks'],
    ['links', 'Links'],
    ['notebook', 'Follow-ups and projects'],
    ['search', 'Search'],
    ['fields', 'Standard fields'],
    ['shortcuts', 'Quick keys'],
    ['templates', 'Templates'],
    ['vault', 'Your vault'],
  ];
  let h = '<div class="frame" style="grid-template-columns:minmax(0,1fr)"><section class="main guide">';
  h +=
    '<h2 class="title">Cheat sheet</h2><p class="meta">How to write notes so Plainfile can use them. Everything here is plain text in your files. Nothing is required.</p>';
  h += `<nav class="toc" aria-label="Sections">${toc.map(([id, l]) => `<button class="chip" data-scroll="sec-${id}">${esc(l)}</button>`).join('')}</nav>`;

  h += section(
    'note',
    'A note',
    '<p>A note is a markdown file. While you type, <code>[[</code>, <code>#</code>, <code>@</code> and frontmatter values such as <code>project:</code> offer what already exists. The block between the two <code>---</code> lines at the top is the <b>frontmatter</b>: properties as <code>key: value</code>. Everything under it is the note.</p>' +
      block('note', 'A meeting note', EX.note),
  );

  h += section(
    'keys',
    'Keys Plainfile understands',
    '<p>Any key is allowed and is kept exactly as you wrote it. These ones also do something:</p><div class="table-wrap"><table><thead><tr><th>Key</th><th>Looks like</th><th>What it does</th></tr></thead><tbody>' +
      KEYS.map(([k, e, d]) => `<tr><td class="mono">${esc(k)}</td><td class="mono small">${esc(e)}</td><td>${esc(d)}</td></tr>`).join('') +
      '</tbody></table></div>',
  );

  h += section(
    'tags',
    'Tags',
    '<p>Tags are not case sensitive. They can use letters, numbers, <code>-</code>, <code>_</code> and <code>/</code> for nesting, and need at least one letter, so <code>#2026</code> is not a tag.</p>' +
      block('tags', 'Three ways to tag', EX.tags),
  );

  h += section(
    'tasks',
    'Tasks',
    '<p>A task is a checkbox line in any note, or a note of its own. Typing <code>- [ ] </code> turns into a checkbox as you type, and a typed <code>*</code> is saved as <code>-</code>.</p>' +
      block('quick', 'Quick add: one line in the box on Today', EX.quick) +
      block('task', 'A task inside a note', EX.task) +
      block('taskfile', 'A task as its own file (in a tasks/ folder)', EX.taskfile) +
      '<p>Dates are read in several styles, and written the first way:</p>' +
      block('dates', 'Due dates', EX.dates),
  );

  h += section(
    'links',
    'Links',
    '<p>Links are worked out from your files, so back-links are never stored. Rename a note in Plainfile and every link to it is rewritten.</p>' +
      block('links', 'Linking', EX.links),
  );

  h += section(
    'notebook',
    'Follow-ups and projects',
    '<p>From the first Notebook app, still supported. Any line tagged <code>#followup</code> appears in Follow-ups. A note with <code>active</code> or <code>sortOrder</code> becomes a numbered card in Projects. Make one with <b>+ New</b> then <b>Project</b>: it creates a folder with an index note, and the + Task and + Note buttons on its card file new things inside it.</p>' +
      block('follow', 'A follow-up', EX.follow) +
      block('project', 'A project note', EX.project),
  );

  h += section(
    'search',
    'Search',
    '<p>Words search titles, text, paths and tags. Add operators to narrow them. Press Ctrl or Cmd K anywhere.</p><div class="table-wrap"><table><tbody>' +
      OPERATORS.map(([o, d]) => `<tr><td class="mono small">${esc(o)}</td><td>${esc(d)}</td></tr>`).join('') +
      '</tbody></table></div>',
  );

  h += section(
    'fields',
    'Standard fields (keeping notes uniform)',
    '<p>Plainfile reads many spellings and never requires any of them: a note that lacks a field just has no value for it. What the app <b>writes</b> always uses the standard names below. In a project, the <b>Tidy</b> panel lists notes that differ and fixes them one line at a time, only when you press Fix.</p><div class="table-wrap"><table><thead><tr><th>Field</th><th>Standard value</th><th>Also understood</th></tr></thead><tbody>' +
      `<tr><td class="mono">status</td><td class="mono small">${STATUSES.join(' · ')}</td><td class="small">${esc('"In Progress", wip, blocked, on hold, complete, closed …')}; or the key <span class="mono">${ALIASES.status?.join(', ')}</span></td></tr>` +
      `<tr><td class="mono">due</td><td class="mono small">2026-11-23</td><td class="small">${esc('"Nov 23 2026"')}; or the key <span class="mono">${ALIASES.due?.join(', ')}</span></td></tr>` +
      `<tr><td class="mono">phase</td><td class="mono small">Phase 1</td><td class="small">the heading above an inline task; or the key <span class="mono">${ALIASES.phase?.join(', ')}</span></td></tr>` +
      `<tr><td class="mono">people</td><td class="mono small">[dana, sam]</td><td class="small">@name on a task line; or the key <span class="mono">${ALIASES.people?.join(', ')}</span></td></tr>` +
      '<tr><td class="mono">project</td><td class="mono small">site, or [site, kitchen]</td><td class="small">the folder the note is in</td></tr>' +
      '<tr><td class="mono">tags</td><td class="mono small">[launch]</td><td class="small">#launch in the text</td></tr>' +
      '<tr><td class="mono">created</td><td class="mono small">2026-11-21</td><td class="small">➕ 2026-11-21, [created:: 2026-11-21]</td></tr>' +
      '</tbody></table></div>',
  );

  h += section(
    'shortcuts',
    'Quick keys and menus',
    '<p>On a phone, use <b>Go to…</b> in the header and the <b>⋯ More</b> menu on a note. Pin a note to keep it at the top of the list (it writes <code>pinned: true</code>). Moving a note updates the links that would break and offers Undo.</p><div class="table-wrap"><table><tbody>' +
      SHORTCUTS.map(([k, d]) => `<tr><td class="mono small">${esc(k)}</td><td>${esc(d)}</td></tr>`).join('') +
      '</tbody></table></div>',
  );

  h += section(
    'templates',
    'Templates',
    '<p>A template is a markdown file in <code>.plainfile/templates/</code>. Its <code>plainfile:</code> block names it and says where the new note goes, and is removed from the note it makes. Each <code>{{name}}</code> becomes a question when you use it. <code>{{date}}</code>, <code>{{date+7d}}</code>, <code>{{time}}</code>, <code>{{weekday}}</code>, <code>{{day}}</code>, <code>{{week}}</code>, <code>{{month}}</code>, <code>{{year}}</code>, <code>{{datelong}}</code> and <code>{{cursor}}</code> are built in.</p>' +
      block('template', '.plainfile/templates/weekly-review.md', EX.template),
  );

  h += section('vault', 'In your vault', `<p class="muted">Bigger tags are on more notes. Click one to search it.</p>${vault()}`);
  return `${h}</section></div>`;
}

/** Copy an example. Falls back to selecting it, because some browsers refuse clipboard access. */
export async function copy(button: HTMLElement): Promise<void> {
  const pre = document.getElementById(`ex-${button.dataset.copy}`);
  if (!pre) return;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(pre.textContent ?? '');
    button.textContent = 'Copied';
  } catch {
    const r = document.createRange();
    r.selectNodeContents(pre);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    button.textContent = 'Selected. Press Ctrl+C';
  }
  window.setTimeout(() => {
    button.textContent = original;
  }, 2200);
}

export function scrollTo(id: string): void {
  const el = document.getElementById(id);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}
