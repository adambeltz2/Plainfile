# Features

Everything Plainfile does, by area. Back to the [README](../README.md).

- **Insight:** an activity heatmap, this month at a glance, topics, people, folders and vault health, with a
  vault-wide tidy list for non-standard fields.
- **People:** everyone in your notes (from @mentions and people fields, joined by person notes), with their open
  tasks, what you are waiting on, meetings and notes.
- **Calendar:** month, week and agenda views of tasks and dated notes. Drag a task to another day to change its
  due date in its own file.
- **Share outside markdown:** copy a note (or a selection) as formatted text for Word, Docs or email, download it as
  a Word file, or print it to PDF, cleanly (no frontmatter or tags). A project **Report** builds a status snapshot
  you can copy, download or save as a note.
- **Tasks (all projects):** the Tasks tab, a place to start the day and add tasks from one line, opens the project hub over every task, from every project and from notes outside any; group by Project, person, status or date, filter, and use the board and timeline as usual.
- **Close out a project:** a project's page shows Active or Archived and has Close out / Reopen. Closing writes `active: false` and `completed:` in the project note and moves it under Archived; its tasks leave the Tasks tab and Home. It can also move the whole folder to `archive/` (and back on Reopen), rewriting every link, with a preview; nothing is deleted.
- **Subtask progress:** a task with nested checkboxes shows "1 of 3" wherever tasks are listed.
- **If something breaks:** an error bar offers Copy details for a bug report, and Reload. Nothing is sent or collected.
- **Install:** an Install button in the footer, where the browser offers it, makes Plainfile an app with its own window and offline copy, with New task, Today and Search shortcuts on its icon.
- **Editor keys:** Tab and Shift+Tab nest list items; paste a web address over selected text to make a link.
- **Insight export:** the activity grid, month numbers, topics, people and folders download as CSV or JSON.
- **Home and the weekly review:** a landing screen (capture, today, what needs filing, what
  you are waiting on, the week ahead, project progress) and a four-step review that files, reschedules and plans
  with small guarded edits to your own notes.
- **Today:** open tasks that are late, due today or due this week, plus Upcoming, Inbox, Waiting on,
  All open, Follow-ups and Projects views. Ticking a box changes one character in the file and shows
  the exact before and after lines.
- **Every task is its own note** (`tasks/<title>.md`, or inside its project), so it has room for details,
  and it shows in Today, the Board and your Inbox.
- **One-line quick add:** `Call Dana +Website @dana #launch due:tomorrow`. Natural dates (`today`,
  `tomorrow`, `mon`, `next-week`, `+3d`), a preview before you save, and type-ahead for people, tags
  and projects, and `due:` day words. A date in plain words at the end of the line works too: `Call Dana
  tomorrow`, `Send report next fri`, `Renew in 3 days`, `Pay rent end of month` (an explicit `due:`
  wins). Every task gets a created date.
- **Projects:** a hub per project built for hundreds of tasks: a project rail, tabs (Tasks, Board, Timeline,
  Notes, Activity), grouping by due date, status, person, phase or tag, filter chips, a status column,
  bulk changes with a preview and Undo, and a sortable portfolio table. A project is a folder with an `index.md`; notes elsewhere
  belong to it when their `project:` names it. Notebook projects (`active`, `sortOrder`) still work.
- **Uniform fields without requiring them:** frontmatter is read tolerantly; a Tidy panel offers one-line
  fixes to the standard field names and values.
- **Notes:** click a link in a note to go to it (or to create it, if it does not exist yet); hide the list and details panes to use the whole window on a wide screen.
- **Notes:** reopens where you left off, or shows a home with pinned, modified-today and recent notes.
  One live editor where `- [ ] ` becomes a checkbox as you type. X-ray shows raw
  markdown, focus mode hides the noise, and a properties panel edits frontmatter. A button adds
  default frontmatter to a note that has none. Autosave, Undo and Redo, version history with restore,
  and delete to a trash you can restore from.
- **Move, duplicate, pin:** move a note to another folder with a preview of the links it fixes and an
  Undo, duplicate it, or pin it to the top. They live in a **⋯ More** menu on the note and in a
  right-click or long-press menu in the list.
- **Quick note:** one click or Alt+N makes a note titled with the date and time, ready to type; tag it later.
- **Go to… and quick keys:** Ctrl/Cmd+P finds a note by a few letters, creates one, or runs an action
  ("move kick"). F2 renames, Ctrl/Cmd+Shift+M moves, Ctrl/Cmd+Shift+X toggles X-ray.
- **Paste images:** paste a screenshot or drop an image into a note; it is saved in `_attachments/`, linked
- **Diagrams (experimental):** a fenced `mermaid` code block is drawn under its code. Mermaid is loaded from a pinned CDN copy only when a note has a diagram; offline you just see the code. It lives in `web/mermaid.ts` and can be removed on its own.
- **Take your notes out:** ⋯ More has Copy as formatted text, Download as Word, markdown or a web page, and Print or save as PDF. On the Tasks tab and in a project, Export CSV or JSON downloads the tasks shown. Moving or renaming a note keeps its version history.
- **Insert image…** (⋯ More) picks an image file, for phones where pasting one is awkward.
  relative to the note and shown inline.
- **Type-ahead:** `[[` links, `#` tags, `@` people, `due:` days and frontmatter values while you type.
- **Projects on any note:** add a note to one or more projects from its properties, and it shows on
  each project's dashboard with its tasks.
- **Search:** words plus `tag:`, `folder:`, `type:`, `is:open`, `due:`, `@person`, `modified:` and
  `created:`, with "Modified today" chips and a recent-notes list.
- **Explore** (under the Search tab, switch at the top): related notes (shared tags, links, project, similar text) and a graph.
- **Templates:** markdown files in `.plainfile/templates/`, with questions, date variables and a
  cursor position. Built in: Note, Task, Project, Meeting (people and project), Journal, Person.
- **Rename and links:** renaming a note rewrites every link to it, with a preview. Renames made
  outside the app are detected and offered as a one-click fix.
- **Vault health:** broken links, duplicates, orphans and unused attachments, with one-click fixes.
  It never blocks your work.
- **Fast reopening:** a saved copy of the parsed notes (only a cache) means a big folder, local or Dropbox, reads
  only what changed. Dropbox rescans ask just for the changes.
- **Big folders:** a progress bar with counts and a Cancel button while a large folder is read.
  Files that cannot be read are skipped and listed, so one bad file never blocks the folder.
- **Dropbox:** open a vault stored in Dropbox from any browser. Files go only between your browser and
  Dropbox, sign-in uses PKCE with no server, and writes are checked against Dropbox revisions.
- **Install it:** works as an app on desktop and phone, and opens offline after the first visit.

Opening a local folder needs Chrome, Edge, Brave or Opera (desktop or Android). In any other browser,
including Safari and iPhone, **connect Dropbox** instead (see below), or try the sample vault. The app has no server and no accounts, and nothing leaves your
device.

The previous app, Notebook, is preserved at commit
[`76ac8ba`](https://github.com/adambeltz2/Plainfile/tree/76ac8bab2b96dbd24463fea5f825702dc1c3a441).
Design mockups are in [`mockups.html`](mockups.html).

## What exists so far (checklist)

| Piece | File |
|---|---|
| Storage interface (browser, server and in-memory all implement it) | `src/storage.ts` |
| Parser: frontmatter, inline tasks, tags, links, embeds | `src/parse.ts` |
| Index: incremental scan, link resolution, back-links, rename detection | `src/index.ts` |
| Today view and search operators | `src/query.ts` |
| Safe checkbox and status write-back | `src/writeback.ts` |
| Vault health checks | `src/health.ts` |
| Folder storage and CLI | `src/node-storage.ts`, `src/cli.ts` |
| Browser folder access (File System Access API) | `src/fsa-storage.ts`, `web/handle-store.ts` |
| Browser app: shell and screens (Today, Projects, Notes, Search, Health, New menu) | `web/main.ts`, `web/today.ts`, `web/project.ts`, `web/notes.ts`, `web/search.ts`, `web/health.ts`, `web/newmenu.ts` |
| Live editor | `web/editor.ts` |
| Board and Rename screens | `web/board.ts`, `web/rename.ts`, `src/rename.ts` |
| Dropbox storage and sign-in | `src/dropbox-storage.ts`, `src/dropbox-auth.ts`, `web/cloud.ts` |
| Move and duplicate notes | `src/move.ts`, `web/move.ts`, `web/menu.ts`, `web/palette.ts` |
| Templates, quick add and its one-line parser, link fixes, frontmatter edits | `src/templates.ts`, `src/capture.ts`, `src/quickline.ts`, `src/fixes.ts`, `src/frontmatter.ts` |
| Projects and the project dashboard | `src/projects.ts` |

Next: a small local server as a fallback for browsers that cannot open a folder.

**Install it:** in Chrome, Edge or Safari use the install button in the address bar (or
"Add to Home Screen" on a phone). It then opens in its own window, and the app itself
opens offline after the first visit.
