# Changelog

All notable changes to this project are documented here. Versions follow
`MAJOR.MINOR.PATCH`. The version in `package.json` is bumped on every
deploy-intended change, together with an entry here.

## [0.25.1] - 2026-11-21

### Fixed
- **Opening a big folder no longer looks frozen.** The first screen now shows a progress bar
  with live counts ("Checking files", then "Reading notes: 840 of 3,200"), elapsed seconds and
  a **Cancel** button. Cancelling returns to the first screen without an error.
- **Big folders open faster.** Listing and reading files now run in parallel (8 folders, 24
  file checks and 16 note reads at a time) instead of one file after another.

## [0.25.0] - 2026-11-21

### Added
- **Type-ahead for things that already exist.**
  - **In the editor:** `[[` offers your notes (and their aliases) and completes the link with
    the shortest name that reaches it; `#` offers your tags; `@` offers your people (from
    tasks, `people`/`attendees` frontmatter and person notes); and in the frontmatter, `project:`,
    `type:`, `status:`, and the lists in `tags: [` and `people: [` offer the values already used.
    The list appears over the page, so a phone screen does not clip it, and Esc closes it
    without leaving focus mode.
  - **In form fields:** the @people and #tags fields in quick add and the New task form, and
    template prompts named like project, people, attendees, tags, type or status, show a dropdown
    of what exists as you type. It leaves out names already in the field, never takes Enter
    unless you have moved onto a suggestion (so Enter still adds the task), and Tab takes the
    first one.
- Core: `peopleNames`, `tagNames`, `projectNames`, `valueNames`, `linkTargets`, `matchSuggestions`.

### Changed
- **The due date in quick add is now visible.** On Android an empty date field showed as a tiny
  blank box. It now has a "Due" label, is wide enough to read, and has **Today**, **Tomorrow**
  and **Next week** buttons beside it (pressing a pressed one clears it). The New task form has
  the same buttons.

### Fixed
- Esc closing a suggestion list also left focus mode, because the list was already closed by the
  time the page checked.

## [0.24.1] - 2026-11-21

### Fixed
- **Lag when pressing Create file** (and after anything that changes the notes). The Vault
  health badge recomputed a "did you mean…?" spelling suggestion for every broken link by
  comparing it with every note, each time the index changed. The badge only needs a count, so
  suggestions are now worked out only when the Vault health screen is open, and the comparison
  skips notes whose names are too different in length and stops as soon as a match is too far.
  In a 2,000-note folder on a 4x slower CPU, creating a note went from about 1.2 s to 0.4 s.
- The Create file and Add task buttons now change to "Creating…" the moment you tap them and
  ignore a second tap, so a slow folder gives feedback instead of looking frozen and a double
  tap cannot make two files.
- Returning to the tab no longer re-reads a big folder if it was read in the last 30 seconds.
  The Rescan button always works.
- The Notes list shows at most 300 notes at a time, with a Show more button and the open note
  always included, instead of thousands of buttons.
- The next project number in the New Project form is worked out once per change, not on every
  keystroke.

### Added
- `scripts/perf.mjs`: builds a large synthetic folder, slows the CPU, and prints how long Create
  takes and where the time goes. Run with `NO_MINIFY=1 npm run build` first to keep function
  names.

## [0.24.0] - 2026-11-21

### Added
- **Focus mode.** A Focus button above the editor hides the header, navigation, sidebars and
  footer and centres the note at a comfortable reading width with larger text. The cursor stays
  in the note, Undo, Redo, X-ray and the save status stay on screen, and Esc or Exit focus brings
  everything back. Works on phones.
- **Undo and Redo buttons**, so a phone can undo without a keyboard. They are disabled when there
  is nothing to undo or redo.
- **Version history.** Before the app overwrites a note it keeps what was on disk in
  `.plainfile/history/`: always for the first save in a session, then at most one every five
  minutes, and the newest 30 per note. A History section in the note's side panel lists them
  with **Compare** (exactly which lines would change) and **Restore**. Restoring is an edit, so
  Undo brings back what you had, and the version you had is kept too. History survives closing
  the note, and is hidden from the notes list and search.

### Notes on saving
- Notes autosave about 0.8 seconds after you stop typing. Ctrl or Cmd S saves at once, and leaving
  the note saves too. The status beside the title shows Unsaved changes, Saving, then Saved.

## [0.23.0] - 2026-11-21

### Added
- **Delete a note from disk.** A Delete button in Notes opens a confirmation that says which
  notes link to it, how many open tasks go with it, and when it is a project's note.
  - **Move to trash** (the default) keeps a copy in `.plainfile/trash/`, with its original path
    in the file name, and shows an **Undo** button that puts it back exactly.
  - **Delete permanently** is a separate choice with a second confirmation and no undo.
  - A **Trash** list in the Notes sidebar restores any deleted note later, or deletes it forever
    after a second click. A restore never overwrites a note that has taken its place.
  - Like every other write, it is guarded: if the note changed on disk after the app last showed
    it, nothing is deleted.
  - Notes that linked to the deleted note are left as they are; Vault health lists the links
    that now point nowhere.

### Changed
- On a phone, Notes shows the note list or the open note, not both stacked, with an **All notes**
  button to go back, and the note's buttons stay on one line.
- The delete guard compares with the modified time the app last showed you, not the time of the
  click.

## [0.22.0] - 2026-11-21

### Added
- **Explore screen**, for finding related content. Pick a note (start from the most connected
  ones, search by title, or press Explore on any note) and see:
  - a **graph** of its neighbourhood: solid lines are real links, dashed lines are notes related
    by tags or words but not linked. Click any note to move the focus there, and Back to return.
    1 hop or 2 hops. Large tap targets for phones, and it works from the keyboard.
  - **Links to** and **Linked from**, each with the line the link sits on.
  - **Related, not linked**: notes sharing its tags, similar text (with the shared words as the
    reason), or the same folder or project, leaving out notes already linked.
  - Notes that **mention this one by name without linking**, and notes **this one mentions
    without linking**, with the match highlighted.
  - Links that go nowhere, and the open tasks in the note.
- Core: `src/related.ts` (links, related by tags, text, place, mentions, hubs, graph and layout).

## [0.21.0] - 2026-11-21

### Added
- **New Project.** + New then Project creates `projects/<name>/index.md` (type project, active,
  numbered after your last project, with today as its created date) and shows it in Projects.
  Each project card, and the project's own page, has **+ Task** and **+ Note** buttons that file a
  new task file or note inside the project folder with `project:` already set. The project's page
  lists its open tasks and notes. Tasks and notes made this way also show on the Board under
  that project.
- **Created date on tasks.** Quick add writes `created:<today>`, new task files get a `created:`
  line, and Today shows a quiet "added" date. Read in three styles: `created:`, `➕ date` and
  `[created:: date]`.
- **Tags and people placeholders.** Quick add has `@people` and `#tags` fields, and new task
  files start with `tags: []` and `people: []` to fill in. `people` on a task file shows as
  `@names` and is found by `@dana` in Search.
- The cheat sheet covers `created`, `people` and the project buttons.

### Changed
- Template variables can use `|slug` (for example `{{title|slug}}`) and the app supplies
  `{{sortOrder}}`, `{{projectDir}}` and `{{projectName}}`.

## [0.20.0] - 2026-11-21

### Added
- **Cheat sheet** (the ? button in the header, and a footer link): how a note is written, the
  frontmatter keys Plainfile understands, tags, tasks, dates, links, follow-ups and projects,
  search operators and templates, each with an example you can copy. It also shows **your own
  vault**: a tag cloud sized by how many notes use each tag (click one to search it) and the
  frontmatter keys your notes actually use, with example values.
- **Footer** on every screen with the app version, a link to what is new, and GitHub.
- A **new app icon**: a plain white note on black, readable down to the 16 pixel tab icon.
- A much larger **backlog**, grouped by area, with the suggested next items at the top.

### Changed
- The version shown in the footer comes from `package.json` at build time.

## [0.19.0] - 2026-11-21

### Added
- **Follow-ups view** in Today: every line tagged `#followup`, from every note, with the tag
  and bullet removed. Open jumps to that line. This is the first Notebook app's Follow-ups rail.
- **Projects view** in Today: numbered cards like Notebook's dashboard. A project is a note
  with `active` or `sortOrder` in its frontmatter, or `type: project`. Active projects are
  numbered 1 to N in sort order, each shows a plain-text preview and its open task and
  follow-up counts, and inactive ones are kept, dashed and unnumbered, behind a Show button.
  A folder's `index.md` covers every note in that folder.
- Core: `listProjects`, `listFollowUps`, follow-up and preview extraction in the parser.

## [0.18.0] - 2026-11-21

### Added
- **Installable app.** Plainfile has a web manifest, black and white icons (including a
  maskable one) and a service worker, so Chrome, Edge and Safari offer to install it and it
  opens in its own window. After the first visit the app also opens with no connection
  (the shell only: opening a folder still needs the browser's folder permission, and the
  sample vault works offline).
- The worker replaces the earlier Notebook app's, which lived at the same address, and
  deletes the caches Notebook left behind. It is network first, so a new release shows up
  as soon as there is a connection.
- Browser tests check the manifest and icons, that the app opens offline, that old caches
  are cleared, and that Chromium reports no installability errors.

## [0.17.0] - 2026-11-21

### Added
- A **Light | Dark | Auto** control on every screen, including the first screen before a
  folder is open. It shows the current choice, Auto follows the device setting, and the choice
  is remembered on this device.

### Changed
- Replaces the single header button, which was labelled with the mode it would switch to and
  was missing from the first screen.

## [0.16.1] - 2026-11-21

### Fixed
- The text cursor in the editor was black on black in dark mode, so it could not be seen.
  It now follows the theme in both modes, and a test checks it.

## [0.16.0] - 2026-11-21

### Added
- **Board screen**: task files in status columns (todo, doing, waiting, done, plus any other
  status you use), filtered by project. Drag a card to another column or use the arrows and
  only its `status:` line changes, with a readout of what changed on disk.
- **Rename screen**. Rename a note in Plainfile and see every link that will change before
  anything is written, with a checkbox per link, an option to keep the old name as an alias,
  and a note when another note already has the new name. The new file is created first, links
  are rewritten with the usual guards, and the old file is removed last, so a failure part-way
  never loses a note.
- **Renamed outside the app**: when a file vanishes and an identical one appears, Plainfile
  offers to point the broken links at the new name and add the old name as an alias.
- Core: `planRename`, `applyRename`, `planOutsideRename`, `applyOutsideRename`.

### Fixed
- Checkboxes, selects and date fields follow the black and white theme.

## [0.15.0] - 2026-11-21

### Added
- **Notes screen with the live editor** (CodeMirror 6, pinned). Typing `- [ ] ` becomes a
  checkbox, `#` a heading and `- ` a bullet as you type; a typed `*` or `+` list marker is
  saved as `-`. `**bold**`, `[[links]]`, `@people`, `#tags` and due dates render when the
  cursor leaves the line. X-ray shows the raw markdown. Clicking a `due:` chip opens a quick
  date picker. Autosave with a modified-time guard, a conflict banner if the file changed
  elsewhere, and a readout of what changed on disk. CRLF files keep their line endings.
- **Properties panel** for the open note: status and due date edit one frontmatter line,
  with a Show YAML toggle, plus the notes that link here.
- **+ New menu** and **quick add**: add a task to the Inbox from the top of Today, or create
  a note, task file, meeting, daily journal or person from a template with prompts and a live
  preview of the file. Your own templates go in `.plainfile/templates/`. A taken name gets a
  number and is never overwritten.
- **Search screen**: words plus `tag:`, `folder:`, `type:`, `is:`, `due:` and `@name`,
  highlighted matches, and facets that narrow the query. Ctrl or Cmd K opens it.
- **Vault health screen**: broken and ambiguous links with one-click fixes that edit only the
  link text, duplicate names, orphans, missing images and unused attachments.
- Today now has Upcoming, Inbox, Waiting on and All open views, a Folders list, and an Open
  button on every task.
- Core: `create`, `listDir` and `remove` on every storage adapter, frontmatter editing,
  `setTaskStatus`, link retargeting, templates and quick add.

### Fixed
- The quick-add date no longer carries over to the next task.

## [0.14.0] - 2026-11-21

### Added
- Browser app, first screen: Today. Opens a folder with the File System Access
  API and remembers it for the next visit. Shows overdue, due today and this week,
  an All open view, a tag filter, a source panel with the exact file lines, and a
  readout of what changed on disk after ticking a task.
- `FsaStorage`, the browser folder adapter, with a modified-time check before every
  write. A task ticked just now stays on screen, struck through.
- A sample vault to try in any browser, black and white light and dark themes, and
  a phone layout.
- Rescan on tab focus and a Rescan button, because browsers have no folder watcher.
- Build (`npm run build`) and local server (`npm run serve`) scripts.
- Browser tests (Playwright) that run the real adapter against a browser-held
  folder: byte-for-byte write checks, an edit made elsewhere, and rescan.

### Changed
- CI now runs typecheck, unit tests and browser tests, and deploys the built app
  to Pages in place of the status page.
- `todayView` can keep listed done tasks visible.

## [0.13.0] - 2026-11-21

Rewrite. Notebook, the single-file app that lived in this repository up to
0.12.1, is replaced by Plainfile. The last Notebook release is preserved at the
commit `76ac8ba`.

### Added
- Core library: storage interface, parser, incremental index, link resolution
  and back-links, rename detection by content hash.
- Today view and search with `tag:`, `folder:`, `type:`, `is:`, `due:` and `@name`
  operators.
- Safe write-back that edits one checkbox character or one `status:` value and
  leaves every other byte unchanged, guarded against external edits.
- Vault health checks: unresolved and ambiguous links, duplicate names, orphans,
  missing images, unused attachments.
- Command-line tool and a sample vault.
- Reads Notebook's `#due:date` and `#followup` syntax.
- Planning mockups in `docs/mockups.html`.

### Removed
- The Notebook app (`index.html`, service worker, manifest, Dropbox sync,
  Playwright tests). See commit `76ac8ba`.
