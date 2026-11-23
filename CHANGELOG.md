# Changelog

All notable changes to this project are documented here. Versions follow
`MAJOR.MINOR.PATCH`. The version in `package.json` is bumped on every
deploy-intended change, together with an entry here.

## [0.47.2] - 2026-11-23

### Added
- **Pick a project when adding a task.** The quick add on Home and on the Tasks tab has a project picker beside Add. The task is filed in that project (in its folder, with `project:` set). A `+Project` typed in the line wins over the picker, and the choice is kept for the next task so you can add several in a row.

## [0.47.1] - 2026-11-23

### Added
- **Add tasks from the Tasks tab.** The same one-line quick add as Home (`Call Dana +Website @dana due:friday`, with the live preview and a Quick note button) sits at the top of the Tasks tab. Home and Tasks share one piece of code for it.

## [0.47.0] - 2026-11-23

### Added
- **Tasks tab: everything, in one place.** A new Tasks tab (and the All tasks button on Home and in Projects) opens the project hub over every task in every project and in notes that belong to none. Group by the new **Project** option to see them side by side; a task in several projects appears under each. Tasks, board, timeline, filters and saved views work as in a project. No file moves: a task belongs to a project by link, wherever it lives.

## [0.46.1] - 2026-11-22

### Added
- **What is new** in the footer opens the change log inside the app, by version and without dates, with a GitHub link. The README and that screen now say how Plainfile relates to SilverBullet and Obsidian.

### Changed
- Tidied: removed code and styles nothing used any more (the old "Pick up where you left off" helper, unused imports and CSS), and updated the project notes in `CLAUDE.md`.

## [0.46.0] - 2026-11-22

### Added
- **Mermaid diagrams (experimental).** A fenced block starting with ```` ```mermaid ```` is drawn as a diagram under its code in the editor, in the app's black and white. The code stays visible, so the markdown is unchanged. A diagram that cannot be drawn shows the reason instead.
  - Mermaid 11.4.1 is loaded from the jsDelivr CDN the first time a note has a diagram, pinned with an integrity hash. Offline, or if it fails to load, the note shows its code as before.
  - It is one removable module: `web/mermaid.ts`, `web/mermaid-widget.ts`, `src/diagrams.ts`, and the lines marked `MERMAID` in `web/editor.ts`.
  - Not in Word, PDF or copy-as-formatted export yet (they show the code).

## [0.45.1] - 2026-11-22

### Fixed
- Clicking a task in a project's task list did nothing. It now opens the note at that line. A new browser test (`tests/e2e/clicks.spec.ts`) clicks a note or task row on every screen that lists them, so a dead click is caught by CI.

## [0.45.0] - 2026-11-22

### Added
- **Insight numbers open the data behind them.** Click any This month number (changed, created, tasks created, finished, open, overdue) or a day on the activity grid to see the notes or tasks counted, and click one to open it. The Health numbers go to Vault health, and "Fields to tidy" opens the tidy list.

## [0.44.2] - 2026-11-22

### Added
- Home shows the note count ("128 notes"); click it to open the Notes list. Search and Explore buttons sit beside it.

## [0.44.1] - 2026-11-22

### Fixed
- A link you have just typed (still shown as raw `[[text]]` on the line you are writing) can be clicked straight away, to open the note or to create it. The "no note called…" bar now stays in view when the note is scrolled.

## [0.44.0] - 2026-11-22

### Added
- **Click a link to go to the note.** A `[[link]]` or `[text](note.md)` in a note opens its target on one click. If the note does not exist, a bar offers to create it beside the note you are in (titled, dated, ready to type).
- **Hide the side panels.** On a wide screen the Notes screen has Notes list and Details buttons to hide either panel, and it now uses the full window width. The choice is remembered.

### Changed
- **Search and Explore share one tab.** Explore is no longer a separate item in the navigation; a Search | Explore connections switch sits at the top of both. The Go to… palette and Ctrl+Shift+E still reach Explore directly.
- The note menu stays on screen when it is tall.

## [0.43.0] - 2026-11-22

### Added
- **Click the title to rename it.** The title above a note is now a box: type, then Enter (or click away) to save, Escape to cancel. Only the `title:` line changes, and it is quoted only when it needs to be. The file name stays the same; use ⋯ More, Rename to change that and fix links.

## [0.42.4] - 2026-11-22

### Changed
- Recent is a flat table: note, folder, project, type and when it changed (Today 22:54), one row each. Click anywhere on the row to open it.

## [0.42.3] - 2026-11-22

### Changed
- Focus mode uses more of the screen: the writing column is up to 68rem wide (it was 46rem), still centred.

## [0.42.2] - 2026-11-22

### Fixed
- Clicking a card on the Board, or in a project's board view, did nothing. It now opens the note. The Open and arrow buttons work as before.

## [0.42.1] - 2026-11-22

### Fixed
- Clicking a task on Calendar or People did nothing for the same reason. It now opens the note too.
- Clicking a task on Home did nothing, because Home has no side panel to show it in. It now opens the note, at the task's line.

## [0.42.0] - 2026-11-21

### Added
- **Recent screen.** Every note by when it last changed, newest first, grouped (Today, Yesterday, Earlier this week,
  then by month), with a filter box and Show more. It replaces Home's "Pick up where you left off" card, which only
  showed four notes. Home keeps a Recent button.

### Changed
- **Home is tighter.** No "Home" heading; the date and a one-line quick add (with Quick note) sit at the top, then the
  week bars and the projects, with Today and the rest below.

## [0.41.1] - 2026-11-21

### Changed
- **Rename no longer shows a confusing "Renamed outside" tab.** That choice is only for repairing links after a file
  was renamed in another app, and Plainfile offers it by itself (the banner, with a count) when it notices one.
  Otherwise the Rename screen is just the rename.

## [0.41.0] - 2026-11-21

### Added
- **Insight.** A quiet look at your own files, all worked out in the browser from modified times, dates and tags:
  an **activity heatmap** (notes changed per day, last 26 weeks), **this month** (notes changed and created, tasks
  created and finished, open and overdue), **topics** (a tag cloud that leads to a search), **people**, **folders**
  by size, and **health** (broken links, shared names, orphans, unused attachments) with a **vault-wide Tidy list**
  that fixes non-standard fields one line at a time. It is in the header, under More on a phone, and in Go to….

## [0.40.0] - 2026-11-21

### Added
- **Share a note outside markdown.** In a note's **⋯ More** menu (and in Go to…):
  - **Copy as formatted text** puts clean HTML and plain text on the clipboard, so it pastes into Word, Google Docs
    or an email with headings, bold, lists, checkboxes (☐ ☑), tables and pasted images. Select part of the note
    first to copy only that.
  - **Download as Word (.docx)** writes a real Word file, with no library.
  - **Print or save as PDF** opens the browser's print dialog on a clean copy.
  Copies are **clean** by default: no frontmatter, no `#tags`, `@people`, `due:` or `created:` markers, `[[links]]` as
  plain words. A menu switch keeps them when you want them.
- **Project status report.** A **Report** button on a project's page builds a snapshot from the hub's numbers (progress,
  phases, overdue, due in two weeks, who you are waiting on, follow-ups, recent notes), shown as a preview you can
  copy for an email, download as Word, print, or **save as a note** under `reports/`.

## [0.39.0] - 2026-11-21

### Added
- **People.** A table of everyone in your notes, from `@mentions`, `people:` and `attendees:` fields and notes of
  `type: person`: open, waiting, overdue, notes and last seen, sortable. A person's note (its title, file name and
  `aliases:`) joins spellings such as `@dana`, `@dana-ortiz` and "Dana O" into one person. Each person has a page
  with their open tasks (tick them there), what you are waiting on from them, meetings and the notes that name them,
  and a "worth a follow-up" flag after three quiet weeks. Someone without a note gets **Make a person note**, which
  starts from their name. Nothing is stored; it is a view over your notes.

## [0.38.0] - 2026-11-21

### Added
- **Calendar.** A month, a week or an agenda of your tasks (by due date) and your dated notes (meetings, journal
  entries: any note with a `date:`). Today is marked and every day lists what is on it, with a field to move a task
  to another date and a box to add a task for that day. **Drag a task** to another day and its due date changes in
  its own file (only that one value). On a phone the month shows a count per day and tapping a day lists it.
  Next/Previous/Today buttons move through time. It is under Calendar in the header, under More on a phone, and in
  Go to….

## [0.37.0] - 2026-11-21

### Added
- **Home** is now the first screen: a capture box (the one-line quick add), today's tasks you can tick, where you
  left off, **Needs filing**, **Waiting on**, the week ahead as a small chart, and project progress, all worked
  out from your notes.
- **Weekly review**, in four steps, each a small guarded edit to your own notes:
  1. **Triage**: give unfiled quick notes and task notes a project and tags (only those two fields change);
  2. **Slipped**: move overdue tasks to tomorrow, next week or no date, or finish them;
  3. **Waiting on**: mark what arrived, or check again tomorrow or next week;
  4. **Plan the week**: see the next seven days (heavy days are marked) and give undated tasks a day.
  Open it from Home, More on a phone, or Go to… Finishing returns Home with a count of the changes made.

### Changed
- The phone's bottom bar is Home, Today, Projects, Notes and More (Search, Board, Explore, Weekly review, Vault
  health and the rest are under More; Search is also under Go to… and Ctrl/Cmd+K).

### Fixed
- Filing a note whose frontmatter had `project:` with nothing after it wrote `project:site` with no space.

## [0.36.0] - 2026-11-21

### Added
- **Saved index.** The browser keeps a copy of the parsed notes (in IndexedDB, per folder). Reopening a folder,
  local or Dropbox, reads only the notes whose file changed, so a big folder opens in a fraction of the time. The
  copy is only a cache: a note is used from it only when its path, modified time and size all match, it is dropped
  when the parser changes, and nothing breaks if storage is blocked. Today's sidebar says how many notes came
  from the saved copy.
- **Dropbox rescans ask only what changed.** After the first listing, Rescan (and returning to the tab) makes one
  small request using Dropbox's change cursor instead of listing the whole folder. Deleted files and folders,
  edits from other devices and new files are picked up; if Dropbox stops accepting the cursor the folder is
  listed in full again.

## [0.35.0] - 2026-11-21

### Changed
- **Phone navigation.** On a phone there is now a **bottom tab bar** (Today, Projects, Notes, Search, More). More
  holds Board, Explore, Vault health, the cheat sheet, Rescan, Open folder and the Light/Dark/Auto choice. The
  header is just the name, Go to… and + New. The bar steps aside while a note is open so the keyboard has room.
- **Side panels fold away on a phone** (Today's views, folders and tags; the Notes list; Board's projects; Search's
  filters; Explore's list) behind one button, so the work starts at the top of the screen. The note list folds again
  once you choose a note. Today's "what changed on disk" panel only shows when there is something to show, and the
  quick add hint is hidden.
  Wide screens are unchanged.

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
