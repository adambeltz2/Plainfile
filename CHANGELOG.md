# Changelog

All notable changes to this project are documented here. Versions follow
`MAJOR.MINOR.PATCH`. The version in `package.json` is bumped on every
deploy-intended change, together with an entry here.

## [0.34.1] - 2026-11-21

### Changed
- **Far fewer things to tap on a phone.** On a narrow screen:
  - the header keeps the screen tabs (one scrolling row), Go to… and + New; Rescan, Open folder, the cheat
    sheet and the Light/Dark/Auto choice are behind one ⋯ button;
  - the project page shows the title, + Task and a ⋯ for Note, Meeting and Open note; the number tiles are
    hidden, tabs scroll sideways, and the first tasks are on the first screen;
  - grouping, saved views, date and people filters sit in one **Filter & group** drawer (the search box stays
    out), and the status column is one **Status** line that opens on demand;
  - task tick boxes for bulk changes only appear after **Select tasks**.
  Wide screens are unchanged.

## [0.34.0] - 2026-11-21

### Added
- **Project hub.** A project's page is now a hub built for hundreds of tasks:
  - a **rail** to switch projects, and **tabs**: Tasks, Board, Timeline, Notes, Activity;
  - **group tasks** by due date, status, person, phase, tag or note; groups collapse, show counts and a mini
    progress bar, and list 25 at a time ("Show 25 more");
  - **filter** with a search box and chips (overdue, due this week, no date, people, tags, phases, status),
    shown as removable chips;
  - a **status column** that stays in view: progress, phases (from headings or `phase:`), who has what, next
    up, and tasks finished per week (an estimate from file times);
  - **Board** (move task notes between statuses with ← →) and **Timeline** (weeks across, phases down);
  - **bulk changes**: tick tasks (or Select all shown), choose Done, Reopen, a status, a due date, a person or a
    tag, review the exact lines that will change, Apply, and Undo;
  - **saved views** (grouping plus filters) kept as small files in `.plainfile/views/`;
  - a **Table** on the Projects screen with progress, open, overdue, next due and last change, sortable.
- **Tidy and standard fields.** Frontmatter is read tolerantly (many spellings of a status or key, a date
  written as "Nov 23 2026") and never required. The hub's **Tidy** panel lists notes that differ from the
  standard fields and fixes them one line at a time, only when you press Fix. A new Standard fields section in
  the cheat sheet lists the standard names and what else is understood.

### Changed
- The hub reads a task's phase from the heading above it (headings like Goal, Notes and Tasks do not count).

## [0.33.0] - 2026-11-21

### Added
- **Paste or drop an image into a note.** Paste a screenshot (or drop an image file) in the editor: it is
  saved as `_attachments/pasted-2026-11-21-143512.png`, a link relative to the note (`![](../_attachments/...)`)
  is typed at the cursor, and the image shows in the note. Move onto its line to see the markdown. A name
  that is taken gets `-2`, never an overwrite. Works on every storage adapter, Dropbox included.
- Storage can now read and create binary files (`readBinary`, `createBinary`), covered by the storage contract.

### Changed
- **The same title twice no longer makes two notes with one title.** A second note named like an existing one is
  saved as `Gift Shopping 2.md` and its title becomes "Gift Shopping 2". The New dialog says so before you
  create it. Task notes do the same.

## [0.32.0] - 2026-11-21

### Added
- **Quick note.** One click (Notes screen, the New menu, the Go to palette, or **Alt+N**) makes a note in
  `inbox/` titled with the date and time (`2026-11-21 14:35`), with a ready header (`created`, `project`,
  `tags`, `people`) and the cursor in the body, so you can start typing at once and tag it later. Two made
  in the same minute never collide. The built-in template can be replaced by your own `Quick note`.
- Template variables `{{time}}` (14:35) and `{{timefile}}` (1435), for any template.
- Under the hood for the coming project hub: tolerant field reading and tidy fixes (`src/fields.ts`) and
  the hub's grouping, filtering and summary code (`src/hub.ts`), with tests.

## [0.31.1] - 2026-11-21

### Fixed
- **Tab finishes the highlighted suggestion** in the editor, for links, tags, people, projects and dates, as it
  already did in the form fields. With no list open, Tab behaves as before.

## [0.31.0] - 2026-11-21

### Changed
- **One Task, always its own note.** The New menu has a single **Task** (it had two). Every task you
  create, from New > Task or the one-line box on Today, is a note in `tasks/` (or the project's `tasks/`
  folder with `project:`), with `status`, `due`, `created`, `tags` and `people`. The title is just the words:
  `Call Dana @dana #launch due:friday` becomes the note "Call Dana". The **Inbox** view lists these notes
  (until they are filed in a project) as well as lines in `inbox/`. After adding, the new task is shown in
  Today if it is due within the week, otherwise in the Inbox.
- The New > Task form has a Project field with type-ahead.

### Added
- **Type-ahead for dates.** After `due:` in a note (inline or in the frontmatter) the editor offers today,
  tomorrow, next-week, weekdays, 2w and 3d, and writes the real date. The one-line box on Today offers the
  day words after `due:` too.
- **Tag a note with projects.** The properties panel has a Projects row: add the note to one or more
  projects (type-ahead, existing projects only) and remove it with ×. One project is written
  `project: site`, several `project: [site, kitchen]`. The project dashboard lists the note and its tasks.
  The project chip opens that dashboard.

## [0.30.2] - 2026-11-21

### Changed
- The README now links to the live app near the top.

## [0.30.1] - 2026-11-21

### Changed
- Dropbox sign-in works out of the box: Plainfile's own Dropbox app key is the default (it is public by
  design). "Use my own Dropbox app" lets a private copy use its own key.

## [0.30.0] - 2026-11-21

### Added
- **Dropbox.** Connect Dropbox on the first screen and open a vault from it, in any browser, including
  iPhone, Safari and Firefox. Optionally pick a folder (such as `/Notes`). Sign-in is OAuth with PKCE,
  straight from the page, with no server and no secret. Tokens are kept only in this browser; Sign out
  forgets them. Notes, tasks, move, rename, delete, trash and history all work, and every write is
  checked against Dropbox's own revision so another device's edit is never overwritten.
- `DropboxStorage` and the sign-in code pass the same storage contract as the other adapters, with a
  fake Dropbox in the tests (pagination, token refresh, rate limits, accents in names, same-second
  edits, folder isolation) and browser tests for the whole sign-in and edit flow.
- Setup: create an app at dropbox.com/developers/apps (Scoped access; permissions
  `files.metadata.read/write` and `files.content.read/write`), add the page address as a Redirect URI, and
  paste the app key into Plainfile, or set the `DROPBOX_APP_KEY` repository variable so the key is built in.

### Known limits
- A cloud folder reads every note on first open, which is slow for thousands of notes. A saved index
  cache is next on the backlog.

## [0.29.3] - 2026-11-21

### Added
- **Storage contract tests** (`test/storage-contract.test.ts`): one suite every storage adapter must pass
  (exact reads, create refusing to overwrite, guarded writes and removes, hidden folders, deep paths),
  plus an end-to-end scenario (tick, move, rename, delete) that must leave the same files on every
  adapter. It runs on the in-memory and on-disk adapters now and is the gate for future cloud adapters.

## [0.29.2] - 2026-11-21

### Fixed
- **Deleting (and opening) a file the phone lists but will not look up by name.** Some Android folders
  say "A requested file or directory could not be found" for a name that is plainly in the folder. Delete,
  open, and every write now fall back to the exact handle the folder listing gave, and removal uses the
  file's own stored name. Folders get the same fallback.
- **Delete shows it is working.** The buttons change to "Moving to trash…" and cannot be pressed twice.

## [0.29.1] - 2026-11-21

### Added
- **A folder that shows no notes now explains itself.** The notice says how many files and folders
  were looked through, how deep, the file types seen, how many dot-named items (`.git`) were hidden,
  and that there is no limit on how deep notes can be. Notes 15 levels down are covered by a test.

### Fixed
- The Quick keys section of the cheat sheet no longer clashes with the frontmatter Keys section.
- Type-ahead browser tests wait for the suggestion list to settle (no change to the app).

## [0.29.0] - 2026-11-21

### Added
- **Move a note to another folder.** From the note's **⋯ More** menu, the list's right-click menu,
  Ctrl/Cmd+Shift+M or the palette. Pick or type a folder (a new one is created), see the exact link
  lines that will change, then move. Links that would break (folder paths, relative markdown links,
  and relative links and images inside the note) are rewritten; links by name keep working. The new
  file is made first and the old one removed last, and an **Undo** snackbar moves it back.
- **Notes landing.** Notes reopens the last note you were in. With none open it shows a home: Pinned,
  Modified today, Recent and folders. The list has Pinned and Recent sections.
- **⋯ More menu** on a note (X-ray, Explore, History, Move, Rename, Duplicate, Pin, Copy link, Add
  default frontmatter, Delete). The header keeps Undo, Redo, Focus and X-ray. The same actions open by
  right-click or long-press on a note in the list (a bottom sheet on a phone).
- **Duplicate** a note (the copy's `title:` gets " copy") and **Pin** a note (`pinned: true`).
- **Go to… palette** (Ctrl/Cmd+P or the header button): find a note by a few letters, create one, jump to
  a screen, or run an action. "move kick" moves the note whose name matches.
- **Quick keys:** F2 rename, Ctrl/Cmd+Shift+M move, +X X-ray, +E explore, ? cheat sheet. They are listed
  in a new Keys section of the cheat sheet.

### Changed
- Rename, Explore and Delete moved from the note header into the ⋯ More menu.

## [0.28.2] - 2026-11-21

### Fixed
- **One unreadable file no longer stops a folder from opening.** A file or folder the browser
  refuses (for example "Name is not allowed" on Android, or no permission) is skipped, and a
  notice lists what was skipped, with Dismiss. Files are tried again on every rescan. Files whose
  names `getFileHandle` rejects are now opened through the handle the folder listing gave us.

## [0.28.1] - 2026-11-21

### Added
- README rewritten with screenshots of each screen, a feature list and the new module table.
  `npm run screenshots` regenerates the images from the sample vault.
- `test/readme.test.ts` fails if a header screen is missing from the README or a screenshot it
  references is missing, and `CLAUDE.md` now requires README and screenshot updates with UI changes.

## [0.28.0] - 2026-11-21

### Added
- **Project dashboard.** A new **Projects** screen shows every project as a card. Opening one
  gives a page with: the goal, counts (open, overdue, done, notes, follow-ups), a progress bar,
  open tasks grouped Overdue / Coming up / No date (tick them in place; the exact change on disk
  is shown), the project's notes newest first, follow-ups, and the people and tags involved
  (click to search). **+ Task**, **+ Note**, **+ Meeting** and **Open note** start from the
  project. A project covers its folder and any note elsewhere whose `project:` names it, such as
  a meeting. Today's project cards and a project note's side panel link to the dashboard.

### Changed
- Internal: task rows, ticking and the "what changed on disk" readout now live in one module
  (`web/tasks.ts`) shared by Today and the dashboard.

## [0.27.0] - 2026-11-21

### Added
- **Add default frontmatter.** A note with no frontmatter shows a button in its Properties panel
  that puts a starter block (title, today as `created:`, empty `tags`) above it. The note's own
  text is not touched, and its line endings are kept.
- **Find what changed today.** Search has `modified:` and `created:` (`today`, `yesterday`,
  `week`, `month`, `3d`, a date, `<date`, `>date`), plus "Modified today", "Yesterday",
  "This week" and "Created today" chips. Results show when each note was edited, newest first,
  and an empty search lists recently modified notes.

### Changed
- **Meeting notes have people and a project.** The Meeting template asks for People and a
  Project (both with type-ahead) and writes `project:` and `people:` (it used `attendees:`).

## [0.26.0] - 2026-11-21

### Changed
- **Quick add is one line.** Type `Here is a task +Project @Adam #tag due:tomorrow` and press
  Enter. A preview under the box shows where it goes, who, which tags and which day before you
  save. `due:` takes `today`, `tomorrow`, `mon`..`sun`, `next-week`, `+3d`, `2w` or a date;
  `+Project` files the task in that project's note. An unknown project or date is explained
  instead of guessed. The separate people, tags and due fields are gone from Today (the
  New > Task form keeps them).
- Type-ahead works inside the line: `@` offers people, `#` tags, `+` projects.

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
