# Changelog

All notable changes to this project are documented here. Versions follow
`MAJOR.MINOR.PATCH`. The version in `package.json` is bumped on every
deploy-intended change, together with an entry here.

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
