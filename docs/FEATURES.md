# Features

Everything tendfile does, by area. Back to the [README](../README.md).

- **Insight:** an activity heatmap, this month at a glance, topics, people, folders and vault health, with a
  vault-wide tidy list for non-standard fields.
- **Rename a person:** on their page, Rename person previews every `@mention` and `people:` value that would change, rewrites them with guarded writes, renames their person note and the links to it (keeping the old name as an alias if you like), and offers Undo for the text changes.
- **People:** everyone in your notes (from @mentions and people fields, joined by person notes), with their open
  tasks, what you are waiting on, meetings and notes.
- **Calendar:** month, week and agenda views of tasks and dated notes. Drag a task to another day to change its
  due date in its own file.
- **Share outside markdown:** copy a note (or a selection) as formatted text for Word, Docs or email, download it as
  a Word file, or print it to PDF, cleanly (no frontmatter or tags). A project **Report** builds a status snapshot
  you can copy, download or save as a note.
- **Tasks (all projects):** the Tasks tab, a place to start the day and add tasks from one line, opens the project hub over every task, from every project and from notes outside any; group by Project, person, status or date, filter, and use the board and timeline as usual.
- **Tasks, opened on Today:** there is no separate Today screen: the **Tasks** tab opens on its **Today** view (late, due today and due in the next seven days). The list comes first: search, a **View** menu (List, Board, Timeline, Notes, Activity; Group by; **Detailed rows**) and four date counts that work as filters (Overdue, Today, Upcoming, No date). Rows are short by default: the title and one line (date, people, tags, project, a status that says something, "1 of 3", repeat), and "3d late" on the right for a late task. Detailed rows adds every chip (status, added date, file) and is remembered on this device. Click a task's title to open its note, or its date line to select it and see its lines in the file, Reschedule and Move to Trash; j / k move down and up, x ticks, e opens, 1 2 3 0 set priority.
- **Filters panel:** every filter is in one panel. On a wide screen it is docked on the left (**« Hide** folds it away, **Filters** brings it back); on a phone it is a flyout from the left with **Show N tasks** at the bottom. It holds **Show done** (finished tasks are hidden by default), Show (All, Late, Today, Upcoming, Inbox for tasks in no project, No date, Follow-ups for the `#followup` lines, with counts), Status (every status your tasks use), Project (with sub-projects indented, and All projects), People, Tags, Priority, Phase, and the tools Select tasks, Select all shown and Export CSV or JSON. Counts say what each choice would leave.
- **The selected task:** on a wide screen the right column shows the selected task: Reschedule, the exact lines in its file, Open note and, for a task that is its own note, **Move to Trash** (with Undo). With no task selected it shows the project's progress, phases, who has what, what is next and done per week. On a phone, tapping a task opens the same detail as a sheet from the bottom, with Open note and a ✕.
- **Journal:** the **Journal** screen (under More; Calendar is the tab between Notes and Search) opens a month calendar with a dot on every day that has a journal, and the dates in a list on the left (dates only, newest first, with a search box). Click a date in the list, or a day with a dot in the calendar, and its journal opens. A day with no journal is selected and offers **+ Journal for that date**: it asks first, then makes `journal/<date>.md` from the Daily journal template. Today's can be started at once. A journal's header has **‹ Journals** to come back. Home has one button for it: **Open today's journal**, or the latest, **Start today's journal**, Yesterday and All journals. A journal is a note of `type: journal` (or `daily`), or one in a `journal/` or `daily/` folder, with its day in `date:`, its file name or its title.
- **Sub-projects:** a project folder inside another project's folder is its sub-project, one level deep (a project nested deeper belongs to the outermost one). **+ Sub-project** on a project's page files a new project folder inside it. A sub-project's page has a **Part of …** link back, and the parent's page lists its sub-projects. The parent's tasks, notes and counts include its sub-projects'. Only top-level projects are numbered. A project cannot be closed out while a sub-project is still open, and closing a sub-project never moves its folder.
- **Close out a project:** a project's page shows Active or Archived and has Close out / Reopen. Closing writes `active: false` and `completed:` in the project note and moves it under Archived. Its finished tasks leave the Tasks tab; any task still open keeps showing there and on Home, wherever it lives. It can also move the whole folder to `archive/` (and back on Reopen), rewriting every link, with a preview; nothing is deleted.
- **Subtask progress:** a task with nested checkboxes shows "1 of 3" wherever tasks are listed.
- **Export a project as one document:** Export notes in a project builds a contents list and a chapter per note, to copy, download as Word, print or save.
- **If something breaks:** an error bar offers Copy details for a bug report, and Reload. Nothing is sent or collected.
- **Install:** an Install button in the footer, where the browser offers it, makes tendfile an app with its own window and offline copy, with New task, Today and Search shortcuts on its icon.
- **Editor keys:** Tab and Shift+Tab nest list items; paste a web address over selected text to make a link.
- **Insight export:** the activity grid, month numbers, topics, people and folders download as CSV or JSON.
- **Home and the weekly review:** a landing screen (capture, today, what needs filing, what
  you are waiting on, the week ahead, project progress) and a four-step review that files, reschedules and plans
  with small guarded edits to your own notes.
- **Priority:** `(A)`, `(B)`, `(C)` straight after the checkbox (or `priority: A` in a task note, or an Obsidian Tasks emoji) shows as a badge and sorts first. Start a quick add with `(A)`, press 1, 2, 3 or 0 on a selected task on Tasks, or filter and bulk-set it in a project. Each change edits one letter in the file.
- **Status on a checkbox line:** `status:doing` or `status:waiting` on an inline task, like `due:`. It shows as a chip and in status groups, bulk Set status sets it, and ticking the box (done) removes it.
- **When a task was finished:** ticking records `done:2026-11-23` on the line (`completed:` in a task note) and reopening removes it; Insight and Done per week use it instead of an estimate.
- **Repeating tasks:** `rec:1w` (or `rec:+3d` from the day finished) on a checkbox line, or `repeat: weekly` in a task note. Finishing one makes the next, shown in the readout and undone by unticking. Quick add reads `every monday`, `every 2 weeks`, `daily`. Obsidian's 🔁 is read.
- **Pinned on Home:** pinned notes (⋯ More, Pin to top) are on a Pinned card on Home.
- **Ticking** a box changes one character (and adds the date it was done) in the file and shows the exact before and after lines.
- **New task form:** + New > Task, and + Task on a project page (project fixed, you stay on the page), take a task line with `(A)`, `@people`, `#tags` and `due:` as well as a priority list, due-date picks, people and tags fields.
- **Every task is its own note** (`tasks/<title>.md`, or inside its project), so it has room for details,
  and it shows in Tasks and your Inbox.
- **One-line quick add:** `Call Dana +Website @dana #launch due:tomorrow`. Natural dates (`today`,
  `tomorrow`, `mon`, `next-week`, `+3d`), a preview before you save, and type-ahead for people, tags
  and projects, and `due:` day words. A date in plain words at the end of the line works too: `Call Dana
  tomorrow`, `Send report next fri`, `Renew in 3 days`, `Pay rent end of month` (an explicit `due:`
  wins). Every task gets a created date.
- **Projects:** a hub per project built for hundreds of tasks: the filters panel (with a project list), tabs (Tasks, Board, Timeline,
  Notes, Activity), grouping by due date, status, person, phase or tag, a status column,
  bulk changes with a preview and Undo, and a sortable portfolio table. A project is a folder with an `index.md`; notes elsewhere
  belong to it when their `project:` names it. Notebook projects (`active`, `sortOrder`) still work.
- **Uniform fields without requiring them:** frontmatter is read tolerantly; a Tidy panel offers one-line
  fixes to the standard field names and values.
- **Web links:** a web address in a note is a link (bare, `<angle>` or `[text](https://…)`); clicking it opens a new tab and nothing is added to the file. Exports and printed pages open links in a new tab too.
- **Notes:** click a link in a note to go to it (or to create it, if it does not exist yet); hide the list and details panes to use the whole window on a wide screen (a Hide button in each panel, or the Notes list and Details buttons; an edge tab brings a hidden panel back).
- **Note kinds:** an icon beside each note in the list says what it is: project (folder), person (head), task (tick box), meeting (speech bubble), journal (calendar) or note (page), read from its `type`, fields or folder.
- **Notes:** reopens where you left off, or shows a home with pinned, modified-today and recent notes.
  One live editor where `- [ ] ` becomes a checkbox as you type; Ctrl/Cmd+B and Ctrl/Cmd+I bold and italic the selection. X-ray (in ⋯ More, or Ctrl/Cmd+Shift+X) shows raw
  markdown, focus mode hides the noise (Details and Notes list still open over the note), and a properties panel edits frontmatter. A button adds
  default frontmatter to a note that has none. Autosave, Undo and Redo, version history with restore,
  and delete to a trash you can restore from.
- **Move, duplicate, pin:** move a note to another folder with a preview of the links it fixes and an
  Undo, duplicate it, or pin it to the top. They live in a **⋯ More** menu on the note and in a
  right-click or long-press menu in the list.
- **Comments:** `<!-- a note to yourself -->` shows quietly in the editor and is left out of copies and exports.
- **Copy file path:** beside a note's path (and in ⋯ More), copies its full path on your computer (you tell the app where the folder is once; browsers cannot know), its Dropbox path, or the path inside the folder.
- **Quick note:** one click or Alt+N makes a note titled with the date and time, ready to type; tag it later.
- **Go to… and quick keys:** Ctrl/Cmd+P finds a note by a few letters, adds a task from a typed sentence (`Call Dana @dana due:friday`), creates a note, or runs an action
  ("move kick"). F2 renames, Ctrl/Cmd+Shift+M moves, Ctrl/Cmd+Shift+X toggles X-ray.
- **Paste images:** paste a screenshot or drop an image into a note; it is saved in `_attachments/`, linked
- **draw.io diagrams:** a diagram saved as `name.drawio.svg` (or `.drawio.png`) from draw.io is a picture like any other: drop or paste it into a note (it keeps its own name in `_attachments/`), or link it with `![](path/to/flow.drawio.svg)`. It shows in the note with an **Edit diagram** button, which copies where the file is so you can open it in draw.io (desktop, the web app or the VS Code extension). Save it there and the picture here updates when you come back to this window. tendfile never edits the file itself. In draw.io, keep "Include a copy of my diagram" ticked when you export, so the file stays editable. Moving the note rewrites the link and leaves the diagram where it is.
- **Contents:** a note with two or more headings gets a Contents list in the side panel, under Properties. Click a heading to jump to it; **Hide** folds it away. It updates as you type and never writes to the file.
- **Tables:** type `/table` at the start of a line and it asks how many columns and rows (a hover grid or two boxes; a header row is always included). A markdown table is drawn as a real table and edited as one: click a cell and type. Tab and Shift+Tab move between cells (Tab in the last cell adds a row), Enter moves down (in the last row it adds one), Shift+Enter is a line break in the cell, and Escape leaves. A toolbar appears above the table you are in with + Row, + Column, Delete row, Delete column, Left, Center and Right alignment, B, I, code, Link and **Show markdown**. A cell holds any inline markdown (bold, italic, code, links, `[[links]]`): you edit its plain text and it is drawn formatted when you leave it. Only the lines of that table are rewritten, a row you did not change keeps its own text, a typed `|` is written `\|`, and a table with a row that has more cells than its header is left as text so nothing is lost. X-ray shows the raw text.
- **Priority on any note:** the Properties panel has a Priority list (None, A, B, C; any other letter already in the note is kept) and a **+ Priority** button. Only the `priority:` line changes. In the editor, `priority:` offers A, B and C.
- **Diagrams (experimental):** a fenced `mermaid` code block is drawn under its code. Mermaid is loaded from a pinned CDN copy only when a note has a diagram; offline you just see the code. It lives in `web/mermaid.ts` and can be removed on its own.
- **Take your notes out:** ⋯ More has Copy as formatted text, Download as Word (with the note's pictures), markdown or a web page, and Print or save as PDF. On the Tasks tab and in a project, Export CSV or JSON downloads the tasks shown. Moving or renaming a note keeps its version history.
- **Insert image…** (⋯ More) picks an image file, for phones where pasting one is awkward.
  relative to the note and shown inline.
- **Type-ahead:** `[[` links, `#` tags, `@` people, `due:` days and frontmatter values while you type. A company you have used before is offered in the New person form and after `company:` in a note, written as it was before (capitals and spaces kept).
- **People on any note:** the Properties panel has a People row beside Projects: type a name (spaces are fine), pick from the people you already have, add or remove with one click. Only the `people:` line changes.
- **Projects on any note:** add a note to one or more projects from its properties, and it shows on
  each project's dashboard with its tasks.
- **Search:** words plus `tag:`, `folder:`, `type:`, `is:open`, `due:`, `@person`, `modified:` and
  `created:`, with "Modified today" chips and a recent-notes list.
- **Explore** (under the Search tab, switch at the top): related notes (shared tags, links, project, similar text) and a graph.
- **Templates:** markdown files in `.plainfile/templates/`, with questions, date variables and a
  cursor position. Built in: Quick note, Task, Project, Meeting (people and project), Journal, Person. A note with a title of your choosing is made from Go to…: type its name and choose New note.
- **Rename and links:** renaming a note rewrites every link to it, with a preview. Renames made
  outside the app are detected and offered as a one-click fix.
- **Vault health:** broken links, duplicates, orphans and unused attachments, with one-click fixes.
  It never blocks your work.
- **Fast reopening:** a saved copy of the parsed notes (only a cache) means a big folder, local or Dropbox, reads
  only what changed. Dropbox rescans ask just for the changes.
- **Big folders:** a progress bar with counts and a Cancel button while a large folder is read.
  Files that cannot be read are skipped and listed, so one bad file never blocks the folder.
- **OneDrive:** open a vault stored in OneDrive (personal, or work or school) from any browser. Files go only between your browser and Microsoft, sign-in uses PKCE with no server, writes are sent with OneDrive's own revision (`If-Match`) so another device's edit is never overwritten, and large images are uploaded in pieces. A browser sign-in lasts a day, then it asks you to sign in again. The card shows once the site has a registered app (see [ONEDRIVE.md](ONEDRIVE.md)). Google Drive is not built (see [GOOGLE-DRIVE.md](GOOGLE-DRIVE.md)).
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
| Browser app: shell and screens (Tasks, Projects, Notes, Search, Health, New menu) | `web/main.ts`, `web/today.ts` (quick add and the selected-task panel), `web/project.ts`, `web/notes.ts`, `web/search.ts`, `web/health.ts`, `web/newmenu.ts` |
| Live editor | `web/editor.ts` |
| Rename screen | `web/rename.ts`, `src/rename.ts` |
| Dropbox storage and sign-in | `src/dropbox-storage.ts`, `src/dropbox-auth.ts`, `web/cloud.ts` |
| OneDrive storage and sign-in | `src/onedrive-storage.ts`, `src/onedrive-auth.ts`, `web/cloud-onedrive.ts` |
| Move and duplicate notes | `src/move.ts`, `web/move.ts`, `web/menu.ts`, `web/palette.ts` |
| Templates, quick add and its one-line parser, link fixes, frontmatter edits | `src/templates.ts`, `src/capture.ts`, `src/quickline.ts`, `src/fixes.ts`, `src/frontmatter.ts` |
| Projects and the project dashboard | `src/projects.ts` |

Next: a small local server as a fallback for browsers that cannot open a folder.

**Install it:** in Chrome, Edge or Safari use the install button in the address bar (or
"Add to Home Screen" on a phone). It then opens in its own window, and the app itself
opens offline after the first visit.
