# Backlog

Deferred features, bugs, and debt, per `CLAUDE.md` §4. Tags: `[BUG]`, `[FEATURE]`,
`[REFACTOR]`, `[DEBT]`. Items are grouped by area and written to be picked up on their own.
Nothing here is a promise of order. Remove an item when it ships.

## Suggested next

1. Edit tasks in place (status, due, name) and drag Board cards and Timeline bars.
2. Recurring tasks, and a review note saved when the weekly review finishes.
3. Move several notes at once, a folder tree in the Notes list, and rename or move a folder.
4. OneDrive adapter, then Google Drive; read offline from the saved copy.
5. Split `web/notes.ts` and give each screen its own click handling (`web/main.ts` ordering).

## Refactors

- `[REFACTOR]` **Split `web/notes.ts` (about 750 lines).** Separate the version history panel, the
  trash and delete flow, and the properties panel into their own modules. Affects `web/notes.ts`.
- `[REFACTOR]` **Replace innerHTML string templates with a tiny render helper** that escapes by
  default, so a missing `esc()` cannot become an injection bug. Affects `web/*.ts`.
- `[REFACTOR]` **One module for "what changed on disk" lines.** Tasks use `web/tasks.ts`; the note
  editor still has its own multi-line version (`diffHtml` in `web/notes.ts`).
- `[DEBT]` **Per-screen event routing in `web/main.ts`** is a long chain of `target.closest`
  checks. Give each screen a `handles(target)` so ordering stops mattering (a `data-project`
  clash with the Board already cost a failed test).


## Sharing and export

- `[FEATURE]` **Images in the Word file** (they are in copies and print, but the .docx shows a description). Affects `src/docx.ts`.
- `[FEATURE]` **Export a whole folder or several notes as one document** (a table of contents and each note as a chapter). Affects `src/render.ts`, `web/export.ts`.
- `[FEATURE]` **Export presets and a custom report template** kept in `.plainfile/`. Affects `src/report.ts`.

## Move and organise

- `[FEATURE]` **Folder tree in the Notes list**, with drag a note onto a folder to move it. Affects `web/notes.ts`, `web/move.ts`.
- `[FEATURE]` **Move several notes at once** (tick notes in the list). Affects `web/notes.ts`, `src/move.ts`.
- `[FEATURE]` **Rename a folder** and move a whole folder, rewriting links. Affects `src/move.ts`.
- `[DEBT]` **A move can change which note a short link means** when two notes share a name and one was chosen because it sat in the same folder; today only full-path links are rewritten in that case. Affects `src/move.ts`.

## Insight

- `[FEATURE]` **Choose a time range** for the heatmap and month stats, and compare months. Affects `src/insight.ts`, `web/insight.ts`.
- `[FEATURE]` **Tasks finished per week** from the review history if a review note is saved. Affects `src/insight.ts`.

## Calendar

- `[FEATURE]` **Import a read-only `.ics` file** (or a link to one) to show outside events beside your own. Affects `src/calendar.ts`.
- `[FEATURE]` **Drag across weeks in the Week view and resize multi-day items.** Affects `web/calendar.ts`.
- `[FEATURE]` **Recurring tasks** (`repeat: weekly`) that reappear on the calendar. Affects `src/calendar.ts`, `src/writeback.ts`.

## Home and review

- `[FEATURE]` **Save a review note** when the weekly review finishes (what was filed, moved and finished) as `reviews/<date>.md`. Affects `web/review.ts`.
- `[FEATURE]` **Choose what Home shows** (hide or reorder cards), saved as a small file in `.plainfile/`. Affects `web/home.ts`.
- `[FEATURE]` **Review reminders**: a "review due" nudge on Home when the last review was more than a week ago. Affects `web/home.ts`.

## Phones

- `[DEBT]` **Phone check on real devices** (Android Chrome, iPhone Safari with Dropbox): safe-area insets, keyboard behaviour with the bottom bar, long-press menus. Affects `web/app.css`.

## Project hub

- `[FEATURE]` **Edit in place**: click a due chip, status or name on a task row to change it without opening the note, and j/k/x/d/s keys. Bulk changes cover this today. Affects `web/tasks.ts`, `web/hub.ts`, `src/bulk.ts`.
- `[FEATURE]` **Drag a Board card or a Timeline bar** to change status or date. The buttons work today. Affects `web/hub.ts`.
- `[FEATURE]` **Bulk: move tasks to another project**, and set a phase. Affects `src/bulk.ts`.

## Cloud storage (Dropbox, OneDrive, Google Drive)

Each is a new `VaultStorage` adapter that must pass `test/storage-contract.test.ts`. Suggested order below.

- `[REFACTOR]` **An optional `move`** on `VaultStorage` so providers can rename without copying. Binary reads and creates are done. Affects `src/storage.ts`, adapters.
- `[DEBT]` **Pasted images are never deleted** with their note; Vault health lists unused attachments for cleanup. Affects `src/health.ts`.
- `[FEATURE]` **Read offline from the saved copy**: when Dropbox cannot be reached, open the saved notes read-only with a clear banner. Affects `web/store.ts`, `web/cloud.ts`.
- `[FEATURE]` **OneDrive adapter** (Microsoft Graph, MSAL PKCE, path addressing, `eTag` and delta queries). Sign-in
  expires daily in a static app. Affects new `src/onedrive-storage.ts`.
- `[FEATURE]` **Google Drive adapter** (ID based, so paths need a map; the `drive.file` scope cannot see an existing
  folder and the broad scope needs Google's security review). Last. Affects new `src/gdrive-storage.ts`.
- `[FEATURE]` **A provider picker** on the first screen once a second cloud provider exists. Affects `web/cloud.ts`.

## Migration and compatibility

- `[FEATURE]` **Import the first Notebook app's projects.** Notebook kept its data in this
  browser's `localStorage` under `notebook_projects` on the same site, so the new app can read it
  directly. Show "Import from Notebook" when that key exists, preview each project, and write one
  `.md` file per project with `title`, `active` and `sortOrder` frontmatter into a chosen folder.
  Never delete the old data. _Affected: new `src/notebook-import.ts`, `web/import.ts`._
- `[FEATURE]` Import from other tools: Obsidian (callouts, `key:: value` inline fields, `![[note]]`
  embeds), Logseq (outliner blocks, `TODO` markers), Notion export (markdown plus CSV), Todoist and
  Google Keep exports, and a folder of plain `.txt` files. _Affected: new `src/import/`._
- `[FEATURE]` Render `![[note]]` embeds (transclusion) in the editor, and read Dataview-style
  inline fields (`status:: doing`) as properties. _Affected: `src/parse.ts`, `web/editor.ts`._
- `[FEATURE]` Export the whole vault, or a project, as a zip, and import a zip (mode C for browsers
  with no folder access). The browser has no zip writer, so write a small stored-method one first.
  _Affected: new `src/zip.ts`, `web/main.ts`._

## Platform, storage and sync

- `[FEATURE]` **Local server fallback (mode B)** for Safari, Firefox and phones: `npx plainfile
  serve <folder>`, bound to localhost with a token, plus an `HttpStorage` adapter in the web app
  that implements the same `VaultStorage` interface. _Affected: new `src/server.ts`,
  `src/http-storage.ts`._
- `[FEATURE]` GitHub repository adapter: a vault in a private repo through the contents API, one
  commit per save, conflicts caught by file `sha`. Gives history and sync for free.
  _Affected: new `src/github-storage.ts`._
- `[FEATURE]` WebDAV adapter (Nextcloud and similar). _Affected: new `src/webdav-storage.ts`._
- `[FEATURE]` Several vaults: remember more than one folder and switch between them.
  _Affected: `web/handle-store.ts`, `web/store.ts`._
- `[FEATURE]` "Forget this folder" control, using `forgetHandle`. _Affected: `web/main.ts`,
  `web/store.ts`._
- `[FEATURE]` Use `FileSystemObserver` where the browser has it, so changes appear without a rescan.
  _Affected: `src/fsa-storage.ts`, `web/store.ts`._
- `[FEATURE]` Optional git sync in server mode: commit and pull on a schedule. _Affected:
  `src/server.ts`._
- `[FEATURE]` Conflict screen: when a file changed on disk and you have unsaved edits, show both
  versions side by side and let you keep either or merge. _Affected: `web/notes.ts`._
- `[DEBT]` The File System Access API has no compare-and-swap, so a very small window remains
  between the modified-time check and the write closing. _Affected: `src/fsa-storage.ts`._
- `[DEBT]` Keep a persisted index (IndexedDB) so very large vaults open quickly, and move scanning
  into a Web Worker. _Affected: `src/index.ts`, `web/main.ts`._

## Capture

- `[FEATURE]` Plain-words dates in quick add: `tomorrow`, `next fri`, `in 3 days`, `end of month`.
  _Affected: new `src/natural-date.ts`, `web/today.ts`._
- `[FEATURE]` Choose where a quick-added task goes: Inbox, today's journal, or a project note.
  _Affected: `src/capture.ts`, `web/today.ts`._
- `[FEATURE]` Web Share Target: receive text and links shared from other apps on a phone straight
  into the Inbox. _Affected: `web/manifest.json`, `web/sw.js`._
- `[FEATURE]` Bookmarklet that clips a web page's title, link and selection into a note.
  _Affected: new `web/clip.ts`._
- `[FEATURE]` Process Inbox: step through inbox items one at a time and give each a project, due
  date and tags, or file it away. _Affected: new `web/inbox.ts`._
- `[FEATURE]` Extract action items from a note: turn lines such as `TODO`, `action:` or `[ ]` without
  a list marker into tasks, with a preview. _Affected: new `src/extract.ts`._
- `[FEATURE]` Command palette: Ctrl or Cmd K opens notes, actions and views, not only search.
  _Affected: `web/main.ts`, new `web/palette.ts`._

## Tasks

- `[FEATURE]` **Recurring tasks** (`repeat: weekly`, `🔁 every monday`): completing one creates the
  next, with a readout of what was written. _Affected: `src/writeback.ts`, `src/parse.ts`._
- `[FEATURE]` Reschedule from Today: buttons for tomorrow, next Monday, and pick a date, each a
  one-token edit. _Affected: `src/writeback.ts`, `web/today.ts`._
- `[FEATURE]` Completed dates: stamp `done:2026-11-21` when ticking, and add a Done this week view.
  _Affected: `src/writeback.ts`, `web/today.ts`._
- `[FEATURE]` Priorities (`!high`, `priority: 2`) with sorting and grouping. _Affected:
  `src/parse.ts`, `web/today.ts`._
- `[FEATURE]` Scheduled and start dates separate from due dates, so a task can appear later than it
  is due. _Affected: `src/parse.ts`, `src/query.ts`._
- `[FEATURE]` Waiting on: capture who you are waiting for and a follow-up date, and resurface it.
  _Affected: `src/parse.ts`, `web/today.ts`._
- `[FEATURE]` Edit a task's title inline in Today, as a surgical edit of the line. _Affected:
  `src/writeback.ts`, `web/today.ts`._
- `[FEATURE]` Show the heading a task lives under (for example "Action items") and the note's title
  on every task row. _Affected: `src/parse.ts`, `web/today.ts`._
- `[FEATURE]` Subtask progress: `3 of 5` on notes and project cards from nested checkboxes.
  _Affected: `src/projects.ts`._
- `[FEATURE]` Task dependencies: `blocked by [[note]]`, with blocked tasks hidden from Today until
  the other is done. _Affected: `src/parse.ts`, `src/query.ts`._
- `[FEATURE]` Time estimates and a day planner: drag tasks into today's plan and see the total.
  _Affected: new `web/planner.ts`._
- `[FEATURE]` Optional reminders: a badge with the overdue count on the installed app icon
  (`navigator.setAppBadge`), and notifications while the app is open. _Affected: `web/main.ts`._

## Projects

- `[FEATURE]` Move a task or note into a project (and out of one) with every link updated.
  _Affected: `src/rename.ts`, `web/today.ts`._
- `[FEATURE]` Offer to also move a closed-out project's folder to `archive/` (needs folder moves). `src/move.ts`, `web/hub.ts`.
  _Affected: `src/frontmatter.ts`, `web/notes.ts`._
- `[FEATURE]` Reorder projects by dragging cards, writing `sortOrder` for each. _Affected:
  `web/today.ts`._

## Views

- `[FEATURE]` Table view over frontmatter fields: sortable columns, filters, and editing a cell as a
  one-line frontmatter edit. _Affected: new `web/table.ts`._
- `[FEATURE]` Board: group by owner or due week, and show checkbox tasks as cards too. _Affected:
  `web/board.ts`._
- `[FEATURE]` Make the Today rails and layout configurable. _Affected: `web/today.ts`._

## Notes and the editor

- `[FEATURE]` History: keep versions on a timer while you type, label a version ("before the
  rewrite"), see a word-level diff, and clear a note's history. _Affected: `src/history.ts`,
  `web/notes.ts`._
- `[FEATURE]` Focus mode extras: a typewriter scroll, a dimmed-paragraph mode, and a daily word goal.
  _Affected: `web/notes.ts`, `web/app.css`._
- `[FEATURE]` Type-ahead extras: suggestions for block-style lists in the frontmatter (`- launch`), a new-tag
  prompt ("create #newtag?"), and ranking by how recently a name was used. The basics are built.
  _Affected: `web/editor.ts`, `web/suggest.ts`._
- `[FEATURE]` Slash menu: `/` inserts a heading, task, date, link, table or template. _Affected:
  `web/editor.ts`._
- `[FEATURE]` Hold Alt to see the raw markdown, as the mockup showed. _Affected: `web/editor.ts`._
- `[FEATURE]` Render italics (`*x*`), strikethrough, blockquotes, horizontal rules, tables in place,
  and numbered lists that continue. _Affected: `web/editor.ts`._
- `[FEATURE]` Tab and Shift Tab to indent list items, and move a line up or down. _Affected:
  `web/editor.ts`._
- `[FEATURE]` Paste a URL over selected text to make a link, and fetch a title for a bare URL.
  _Affected: `web/editor.ts`._
- `[FEATURE]` Hover a `[[link]]` to preview the note. _Affected: `web/editor.ts`._
- `[FEATURE]` Outline panel from headings, fold sections, and find in note (Ctrl F). _Affected:
  `web/editor.ts`, `web/notes.ts`._
- `[FEATURE]` Several notes open as tabs, and a recent notes list. _Affected: `web/notes.ts`._
- `[FEATURE]` Properties panel: edit tags as chips with autocomplete, add any key, a date picker for
  every date-like key, and a type menu. _Affected: `web/notes.ts`._
- `[FEATURE]` Insert a template into the current note at the cursor. _Affected: `src/templates.ts`,
  `web/editor.ts`._
- `[FEATURE]` Callouts, math and diagrams rendered in place. _Affected: `web/editor.ts`._
- `[FEATURE]` A formatting toolbar for phones with checkbox, heading, link and date buttons.
  _Affected: `web/editor.ts`, `web/app.css`._
- `[DEBT]` Mixed line endings: a file with both CRLF and LF keeps stray carriage returns visible in
  the editor. _Affected: `web/editor.ts`._
- `[DEBT]` The editor scans the whole document to build styling on each change. _Affected:
  `web/editor.ts`._

## Files and folders

- `[FEATURE]` Delete from Explore, Board and Today as well, and delete several notes at once.
  _Affected: `web/explore.ts`, `web/board.ts`, `web/today.ts`._
- `[FEATURE]` Empty the trash, and clear items older than 30 days automatically. _Affected:
  `src/delete.ts`, `web/notes.ts`._
- `[FEATURE]` Delete a task from Today (removing its line or its file). _Affected:
  `src/writeback.ts`, `web/today.ts`._
- `[FEATURE]` Delete an attachment, and offer to delete unused ones from Vault health. Needs binary
  storage. _Affected: `src/delete.ts`, `web/health.ts`._
- `[FEATURE]` Rename from the Notes list, and rename or move a whole folder with every note and
  link inside it. _Affected: `web/notes.ts`, `src/rename.ts`._
- `[FEATURE]` Archive a note or project into an `archive/` folder. _Affected: `src/rename.ts`._
- `[FEATURE]` Move unused attachments to an `_unused/` folder from Vault health. _Affected:
  `src/storage.ts`, `web/health.ts`._
- `[FEATURE]` Browse attachments: a grid of images and files with the notes that use each.
  _Affected: new `web/attachments.ts`._
- `[FEATURE]` Folder rules in `.plainfile/config.md` that give files a type and template without
  editing them. _Affected: new `src/config.ts`._
- `[FEATURE]` Daily journal: open today's note if it exists instead of numbering a copy.
  _Affected: `src/templates.ts`._
- `[DEBT]` Rename detection of outside renames matches identical content only, so a renamed and
  edited file is not noticed. _Affected: `src/index.ts`._
- `[DEBT]` A rename that fails part-way leaves both files and some updated links. It says so and
  nothing is lost, but there is no one-click resume. _Affected: `src/rename.ts`._

## Undo and safety

- `[FEATURE]` **Undo for every write the app makes** (tick, board move, quick add, link fix, rename,
  template create), using the before and after lines already shown in each readout. _Affected:
  `src/writeback.ts`, `web/store.ts`._
- `[FEATURE]` A visible history of what the app changed this session, so nothing is a surprise.
  _Affected: `web/store.ts`, new `web/activity.ts`._
- `[FEATURE]` Dry-run mode for any bulk change: show every file and line first, apply on confirm.
  _Affected: `src/rename.ts`, `src/fixes.ts`._
- `[DEBT]` Property tests for write-back: random markdown files, toggle a task, assert only one byte
  changed. _Affected: new `test/writeback.prop.test.ts`._

## Linking and exploring

- `[FEATURE]` **Word cloud** of the words in a note, a project, a tag or the whole vault, with a
  stopword list you can edit, and a click to search. The tag cloud already ships in the cheat sheet.
  _Affected: new `src/wordcloud.ts`, `web/explore.ts`._
- `[FEATURE]` Whole-vault graph with filters by tag and folder, orphans highlighted, and a path
  between two notes. The neighbourhood graph is built. _Affected: `src/related.ts`, `web/explore.ts`._
- `[FEATURE]` One-click "Link it" on an unlinked mention, wrapping that text in `[[ ]]` as a guarded
  edit. _Affected: `src/fixes.ts`, `web/explore.ts`._
- `[FEATURE]` Related notes in the editor's side panel, and tag suggestions from similar notes.
  _Affected: `web/notes.ts`._
- `[FEATURE]` Tag manager: rename, merge or delete a tag across every note, a tag tree for
  `area/home` style tags, unused tags, and a warning for `Launch` versus `launch`. _Affected: new
  `src/tags.ts`, `web/tags.ts`._
- `[FEATURE]` Show the line each back-link sits on in the Notes panel, not only the file.
  _Affected: `web/notes.ts`._
- `[FEATURE]` Create a note or task from a link that points nowhere. _Affected: `web/health.ts`._
- `[FEATURE]` Fix markdown-style `[text](path.md)` broken links, not only `[[wiki]]` links.
  _Affected: `src/fixes.ts`._

## Search

- `[FEATURE]` Ranked search (BM25) with typo tolerance, and several matches per note with a jump to
  each. _Affected: `src/query.ts`._
- `[FEATURE]` Saved searches and recent searches. _Affected: `web/search.ts`._
- `[FEATURE]` Find and replace across the vault with a full preview and per-line checkboxes.
  _Affected: new `src/replace.ts`, `web/search.ts`._
- `[FEATURE]` Open a search result with the match highlighted in the editor. _Affected:
  `web/notes.ts`._
- `[DEBT]` Search is a substring match over every note held in memory. Move to a ranked index once
  vaults get large. _Affected: `src/query.ts`._

## Templates

- `[FEATURE]` Template manager: create, edit and delete templates in the app, and "Save this note as
  a template". _Affected: new `web/templates.ts`._
- `[FEATURE]` More variables: `{{time}}`, `{{weekday}}`, `{{clipboard}}`, `{{selection}}`, and
  prompt types (menu, date, yes or no). _Affected: `src/templates.ts`._
- `[FEATURE]` Project scaffolds with more than one file: for example a project that starts with a kickoff note and three task files. _Affected:
  `src/templates.ts`._
- `[FEATURE]` Create the daily or weekly note automatically on first open of the day. _Affected:
  `src/templates.ts`, `web/main.ts`._

## Vault health

- `[FEATURE]` More checks: empty notes, duplicate content, YAML errors listed per file, tags that
  differ only by case, mixed line endings, very large attachments, and open tasks older than 90
  days. _Affected: `src/health.ts`._
- `[FEATURE]` An ignore list for checks, in `.plainfile/config.md`. _Affected: `src/health.ts`._
- `[FEATURE]` "Fix all" for safe fixes, with a preview. _Affected: `web/health.ts`._

## Interface and settings

- `[FEATURE]` **Settings screen** stored in `.plainfile/config.md` so it travels with the vault:
  folder names for inbox and tasks, week start, date format, whether a typed `*` becomes `-`,
  autosave delay, text size and line width. _Affected: new `src/config.ts`, `web/settings.ts`._
- `[FEATURE]` Keyboard-first Today: `j` and `k` to move, `x` to tick, `e` to open, `d` to set a date,
  and a shortcut overlay on `?`. _Affected: `web/today.ts`, `web/main.ts`._
- `[FEATURE]` First-run setup for an empty folder: offer to create `inbox/`, a README note and the
  starter templates. _Affected: `web/main.ts`._
- `[FEATURE]` An Install button in the app using the browser's install prompt. _Affected:
  `web/main.ts`._
- `[FEATURE]` PWA shortcuts (New task, Search, Today) and file handling so `.md` files can be opened
  with Plainfile. _Affected: `web/manifest.json`._
- `[FEATURE]` Toasts for results, instead of readouts only inside panels. _Affected: `web/store.ts`._
- `[FEATURE]` Translations and regional date formats. _Affected: `src/dates.ts`, `web`._
- `[FEATURE]` Encrypt chosen notes with a passphrase. _Affected: new `src/crypto.ts`._
- `[FEATURE]` Opt-in assistant that summarises a note, suggests tags and links, and drafts tasks.
  Off by default, with nothing sent anywhere until you turn it on and say so. _Affected: new
  `web/assist.ts`._

## Quality and delivery

- `[DEBT]` Today computes the day groups once for every view count in the sidebar. Compute them once
  per render. _Affected: `web/today.ts`._
- `[DEBT]` `VaultIndex.rebuild()` recomputes every link on each single-file change. Update only
  what changed. At 6,000 notes this and garbage collection dominate. _Affected: `src/index.ts`._
- `[DEBT]` Opening a 6,000-note folder reads every file (about 4.5 s on a fast machine, much slower
  on a phone). Persist the index and only read files whose modified time changed. _Affected:
  `src/index.ts`, `src/fsa-storage.ts`._
- `[DEBT]` Load CodeMirror only when Notes opens, to shrink the first download (about 650 KB now).
  _Affected: `web/main.ts`, `scripts/build.mjs`._
- `[DEBT]` Accessibility pass with automated checks (axe) in the browser tests, a contrast check in
  both themes, and focus handling after dialogs. _Affected: `tests/e2e/`._
- `[DEBT]` Performance tests with a synthetic vault of 5,000 and 20,000 notes. _Affected: `test/`._
- `[DEBT]` The app re-renders each screen with `innerHTML`. The editor and inputs are kept alive
  across redraws, but a proper view layer would be cleaner. _Affected: `web/main.ts`._
- `[DEBT]` The note list is not virtualized and the whole index is rebuilt after each save. Fine for
  thousands of notes, not tens of thousands. _Affected: `web/notes.ts`, `src/index.ts`._
- `[FEATURE]` Release automation: tag, GitHub Release notes from `CHANGELOG.md`, and a Pages preview
  for pull requests. _Affected: `.github/workflows/`._
- `[FEATURE]` Screenshot comparison tests for the main screens in both themes. _Affected:
  `tests/e2e/`._

## Mermaid (experimental)
- [FEATURE] Draw Mermaid diagrams in Word/PDF/copy export. `src/render.ts`, `src/docx.ts`, `web/export.ts`.
- [DEBT] Verify the SRI hash against the live jsDelivr file (computed from the npm package, which should be identical). `web/mermaid.ts`.
- [FEATURE] Click a diagram to enlarge it. `web/mermaid-widget.ts`.

## Filing
- [DECISION] A task belongs to projects by link (`project:` can list several), not by folder, so assigning a project never moves the file. Do not build "move into project folder". Open question: tasks created with `+Project` are written into that project's `tasks/` folder; with several projects that location is arbitrary, so consider always creating in `tasks/`. `src/capture.ts` (addTaskNote).

## From an outside review (checked against the code)
- [DEBT] ESLint is blocked: typescript-eslint 8 supports TypeScript below 6.1, and this project is on TypeScript 7. Revisit when typescript-eslint supports 7. Meanwhile `tsconfig.json` turns on noUnusedLocals, noUnusedParameters, noImplicitReturns and noFallthroughCasesInSwitch. Prettier was added in 1.0.0.
- [DEBT] Generate API docs from the JSDoc (typedoc). `src/`, `docs/`.
- [FEATURE] `plainfile check --json` (and a non-zero exit when problems are found) so Vault health can run in CI. `src/cli.ts`, `src/health.ts`.
- [FEATURE] Shell completions for the CLI; `--help` already exists. `src/cli.ts`.
- [DEBT] Make the file-read concurrency (16, in `src/index.ts`) configurable; the browser adapter may want a lower number on phones. `src/index.ts`, `src/fsa-storage.ts`.
- [DEBT] Test UTF-16 byte-order marks and mixed line endings on read; UTF-8 BOM and CRLF are covered. `src/parse.ts`, `test/parse.test.ts`.
- [DEBT] Add direct tests for `setTaskStatus` transitions, if the existing writeback and board tests leave gaps. `test/writeback.test.ts`.
- [FEATURE] Treat remote (`https:`) embeds separately from local ones in `resolveEmbed`. `src/index.ts`.
- [FEATURE] Lint (ESLint) once typescript-eslint supports TypeScript 7, and a pre-commit check that runs `npm run format:check`. Repo root.
