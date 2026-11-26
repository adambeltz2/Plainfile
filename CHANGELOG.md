# Changelog

All notable changes to this project are documented here. Versions follow
`MAJOR.MINOR.PATCH`. The version in `package.json` is bumped on every
deploy-intended change, together with an entry here.

## [2.13.0] - 2026-11-26

### Changed
- **Plainfile is now tendfile** (always lowercase), with the tagline "tend your notes". The name changes everywhere you see it: the header, the browser tab ("Tasks · tendfile"), the install name, the footer, the cheat sheet, the README and the docs. The header now shows a small copy of the app icon before the name; the app icon itself is unchanged.
- **Nothing you have breaks.** The `.plainfile/` folder inside a vault (history, trash, templates), a template's `plainfile:` settings, saved settings in the browser, the live address and the GitHub repository all keep their old names for now, so existing folders, installs and sign-ins keep working.

### Added
- **Getting started** (docs/GETTING-STARTED.md): what a task, note, journal, meeting, project and person are, and your first five minutes. Linked from the README.

## [2.12.2] - 2026-11-26

### Fixed
- **The Board's Done column was empty while Show done said there were finished tasks.** A date view (Overdue, Today, Upcoming, No date) leaves out a finished task with no date, so Done showed nothing. The Done column now ignores the date view and lists the finished tasks that match your other filters (people, tags, project, search).

### Changed
- **The Board on a phone is one column of full-width cards**, not a squeezed 2 by 2 grid. An empty column shrinks to a single short line.

## [2.12.1] - 2026-11-25

### Changed
- **Calendar is in the header and Journal is under More.** The tab between Notes and Search is now Calendar; Journal moved to the More menu (the Journal button on Home is unchanged).
- **One click opens a journal.** Clicking a date in the Journal list, or a day with a dot in the calendar, opens that journal straight away. A day with no journal is still selected first, with the option to make it.

## [2.12.0] - 2026-11-25

### Added
- **Edit a table as a table.** Click a cell and type. Tab and Shift+Tab move between cells (Tab in the last cell adds a row), Enter moves down (in the last row it adds a row), Shift+Enter is a line break, and Escape leaves. A toolbar above the table you are in adds and deletes rows and columns, aligns a column left, centre or right, and has Bold, Italic, Code and Link; **Show markdown** swaps that one table to its lines. A cell can hold any inline markdown: you see and edit its plain text, and it is drawn formatted (bold, italic, code, links, `[[links]]`) when you leave it.
- **`/table` asks how big.** A hover grid or Columns and Rows boxes (a header row is always included); Insert makes the table and puts the caret in the first heading, Cancel takes the typed command away.
- Only the lines of the table you edit are rewritten, a row you did not change keeps its own text and padding, a typed `|` is written as `\|`, and a table with a row that has more cells than its header is left as text, so nothing is ever dropped.

## [2.11.0] - 2026-11-25

### Added
- **A Journal tab** between Notes and Search (under More on a phone). It opens a month calendar with a dot on every day that has a journal, and a list of the dates on the left. Pick a day and open its journal. A day with no journal asks before making one from the Daily journal template; today's can be started at once. A journal's header has **‹ Journals** to come back.
- **A Journal card on Home** with one button: **Open today's journal** (or the latest one, with **Start today's journal** beside it), plus Yesterday and All journals.

## [2.10.1] - 2026-11-25

### Added
- **A Calendar link on the Tasks screen**, at the right of the tab row (Tasks, Board, Timeline, Notes, Activity) and in the View menu, so the calendar is one click from your task list. On a phone it is in the View menu.

## [2.10.0] - 2026-11-25

### Added
- **The browser tab names where you are.** With a note open the tab reads the note's title (and follows a rename), in a project it reads the project, and elsewhere it reads the screen, for example "Tasks · Plainfile".

### Fixed
- **A journal entry is no longer listed as a meeting.** On a person's page, a journal note that names them now appears under its own **Journal** heading, newest first. **Meetings** is for meetings (dated notes that are not journals), and the meetings count at the top no longer includes journal entries.

## [2.9.0] - 2026-11-25

### Added
- **Companies you have used before are offered as you type.** In the New person form, the Company box lists the companies already written in your notes (most used first) and fills in the one you pick exactly as written, with its capitals and spaces. The same list appears after `company:` in a note's frontmatter.

## [2.8.3] - 2026-11-25

### Changed
- **People are written as lower-case, hyphenated names again.** A new person note from the Person template is filed as `people/eric-zinn.md` and keeps `title: Eric Zinn`, so the file name is the same form an `@mention` takes. The people of a new meeting (`Eric Zinn, @Ken Moore`) are written as `people: [eric-zinn, ken-moore]`. Matching never depended on this (a person is found by their name with case, spaces and hyphens ignored), so existing files with spaces keep working; this only keeps what the app writes tidy and easy to use in other tools.

## [2.8.2] - 2026-11-25

### Fixed
- **Search no longer lists the same result twice.** A task that is its own note showed up once as the note and once as the task. It now shows once, as the task (with its tick box and date). A note that matches only by its body text still shows as a note.

## [2.8.1] - 2026-11-25

### Fixed
- **The "What changed on disk" readout no longer follows you around.** After ticking a task or changing a date, the readout stayed on screen when you tapped a date count, picked a filter, switched view or changed Group by or Show done, and when you moved to another screen. It now clears as soon as you look at something else, and still shows right after the change itself.

## [2.8.0] - 2026-11-25

### Changed
- **A simpler Tasks screen, on a phone and on a wide screen.** The list comes first, and everything else is one tap away.
  - **One filters panel** replaces the project rail, the eight view chips, the five tiles and the "More filters" drawer. On a wide screen it is docked on the left (**« Hide** folds it away); on a phone it is a flyout from the left with **Show N tasks** at the bottom. It holds Show done, Show (All, Late, Today, Upcoming, Inbox, No date, Follow-ups), Status, Project (with sub-projects), People, Tags, Priority, Phase, and Select and Export. Every choice shows a count.
  - **Four date counts** (Overdue, Today, Upcoming, No date) sit above the list and filter it when tapped. Tap again to clear.
  - **Search and View on one line.** The **View** menu has List, Board, Timeline, Notes and Activity, Group by, and **Detailed rows**.
  - **Short rows.** A row is the title and one line (date, people, tags, project, a status that says something, "1 of 3", repeat), with "3d late" on the right when late. Detailed rows brings back the status, added date and file chips, and is remembered on this device.
  - **Done is hidden by default**, with a **Show done** switch at the top of the filters panel. The Board still has its Done column.
  - **The selected task** fills the right column on a wide screen (Reschedule, its lines in the file, Open note) and slides up as a sheet on a phone, where a tap now selects a task and Open note is in the sheet. The project's progress shows when no task is selected.
  - The "All tasks" title block and project picker are gone (the filters panel has the project list), and the tab row is hidden on a phone (the View menu has the views).

### Added
- **Move to Trash for a task that is its own note**, in the selected task's panel, with Undo. A task line inside another note has no file of its own, so it has no such button.

### Removed
- The five tiles (open, overdue, done, notes, follow-ups) on the project hub: the date counts, the tab labels and Show done cover them. The Waiting quick view is now **waiting** under Status.

## [2.7.1] - 2026-11-24

### Changed
- **The Plainfile name in the header is a button to Home**, on a wide screen and on a phone.

## [2.7.0] - 2026-11-24

### Changed
- **A simpler Tasks screen on a phone.** The list now comes first: no "All tasks" title block or project picker on All tasks (the bottom bar says where you are), no Quick note button beside the quick add (it is under **+ New**), the quick views are one row you swipe sideways instead of two, the filter box and Group by share one line, and each task shows just its title, date, people and tags, plus a status when it is not a plain "todo". The "added" date and the file path are hidden on a phone; tap the title to open the note. Wide screens are unchanged.

## [2.6.1] - 2026-11-24

### Changed
- The header button is **Go to…** again, not **Add or go to…**. It still opens the same box (Ctrl/Cmd+P): type a note name to open it, or a sentence to add a task. Adding is also under **+ New** and in the quick add on Home and Tasks.

## [2.6.0] - 2026-11-24

### Added
- **Sub-projects.** A project folder inside another project's folder is a sub-project, one level deep. **+ Sub-project** on a project's page files a new one inside it. The parent's page lists its sub-projects and counts their tasks and notes; a sub-project's page links back to its parent. They show indented under the parent in the project list, the Projects rail and the project picker, and are not numbered. A project cannot be closed out while one of its sub-projects is still open (the button is disabled and says why), and closing a sub-project does not move its folder.

### Changed
- **Home is laid out in two columns.** Today is a column on the right and the smaller cards (Pinned, Projects, Needs filing, Waiting on, Follow-ups) sit together on the left, so the cards below a long Today list are no longer pushed off the first screen. On a phone Today comes first. Home shows only top-level projects.

## [2.5.0] - 2026-11-24

### Changed
- **One drawer for the extra controls.** The separate **Filter & group** button on Tasks and on each project is gone. Its contents now live in the one folded drawer under the filter box: **More filters, select and export** on the Tasks list (Hide done, Select tasks, Export, then Priority, People, Tags, Phases and Status), and **More filters** on the Board. It still opens by itself while a filter from it is on.

### Added
- **The Board has the quick views.** All, Late, Today, Upcoming, Waiting, Inbox, No date and Follow-ups sit above the Board as they do above the list, so you can show only your Inbox tasks, or only what is late, as cards.

## [2.4.1] - 2026-11-24

### Fixed
- **The header no longer jumps between screens.** Home, Search, Calendar, Insight and the other screens were centred in a narrower column than Tasks, Projects and Notes, so the title and tabs moved sideways every time you switched on a wide window. Every screen now uses the same width.

## [2.4.0] - 2026-11-24

### Added
- **Contents.** A note with two or more headings shows a Contents list in the side panel under Properties. Click a heading to jump to it; Hide folds the list away. It follows the note as you type, and nothing is written to the file. Headings inside code blocks, comments and frontmatter are not listed.

## [2.3.0] - 2026-11-24

### Added
- **Tables.** Type `/table` at the start of a line to insert a starter table. A markdown table is now drawn as a table while the cursor is elsewhere; click it (or focus it and press Enter) to edit the markdown. The file is not changed by looking at it, and X-ray shows the raw text. Tables inside code blocks, comments and frontmatter stay as text.
- **Priority in Properties.** A Priority list (None, A, B, C) and a **+ Priority** button on every note. Only the `priority:` line is written. The editor also suggests A, B and C after `priority:`.

## [2.2.0] - 2026-11-24

### Removed
- **Board screen** (under More). The Board tab on Tasks and on every project does the same job and also covers tasks written as checkbox lines.
- **Recent screen** (under More) and the Recent button on Home. The Notes screen already lists recent notes first, and Home shows where you left off.
- The **Overdue / Due this week / No date** buttons in the Tasks "Filter & group" drawer: the quick views above the list (Late, Today, Upcoming, No date) do this. A date filter that is on still shows as a chip you can remove.
- The per-project **Tidy** panel. Vault health and Insight still list and fix non-standard fields across the whole folder.

## [2.1.0] - 2026-11-24

### Changed
- **Quick note is the way to start a note.** The New menu no longer has a separate **Note** entry, and the Notes screen's **+ New note** button is gone: Quick note (one tap, or Alt+N) makes a note named with the date and time, ready to type, and you rename it afterwards. If you want a note with a name from the start, type the name in **Add or go to…** and choose **New note**; that still asks for the title.

## [2.0.1] - 2026-11-23

### Fixed
- The New menu still said a task "shows in Today"; it now says Tasks. The Note and Quick note descriptions now say how they differ: Note asks for a title first, Quick note asks nothing and names itself with the date and time.

## [2.0.0] - 2026-11-23

### Changed
- **Today is now part of Tasks.** There are three places that answered "what now?" (Home, Today, Tasks); now there are two. The **Today tab is gone**: the **Tasks** tab opens on its **Today** view, which shows what the Today screen did (late, due today and due in the next seven days), and old Today links, shortcuts and `?go=today` open it too. The quick views above the list are **All, Late, Today, Upcoming, Waiting, Inbox, No date and Follow-ups**, each with its count. Inbox is tasks that are in no project, and Follow-ups lists the `#followup` lines (also a new card on Home). The projects list stays on the left of Tasks; the folders and tags lists that Today had are in Notes and under "More filters".
- On the Tasks list, **click a task's title to open its note**, or click its date (or anywhere else on the row) to select it: the right-hand column then shows its lines in the file with Open note and **Reschedule** (Tomorrow, Next Monday, In a week, No date, or a date). The j / k / x / e keys and 1 2 3 0 for priority work there too.
- After a quick add on Tasks, the list switches to a view that shows the new task (Today for something due this week, Upcoming for later, All for no date).
- The Projects tab always shows the list of projects, and each project card has **Dashboard**, **+ Task** and **+ Note**. On a phone, Tasks is in the bottom bar with its open-task count.
- The footer shows how many notes were read and how long it took (it was in Today's side panel).

## [1.25.0] - 2026-11-23

### Added
- Quick views on the Tasks screen: **All, Late, Today, This week, Waiting, No date**, each with its count, right above the list. They were the Today screen's tabs and a drawer of filters; now one click shows them, in any project or across all of them. Switching view keeps the people, tags and words you had picked. Today means due today or late.

## [1.24.0] - 2026-11-23

### Added
- The header button **Go to…** is now **Add or go to…** (Ctrl/Cmd+P as before). Type a note name to open it, or type a task and the first choice is **Add task: …** with a one-line summary of what it will make (project, priority, due date, repeat, people, tags). A sentence, or anything using `@`, `#`, `+`, `due:`, `(A)` or `every`, puts Add task first; a short word puts the matching note first and Add task last. Enter adds it as a task note, the same as the quick add on Home.

## [1.23.0] - 2026-11-23

### Changed
- A calmer header: **Rescan** and **Open folder** are now one **⋯** menu with **Check for changes** and **Open another folder…**, so there are two fewer buttons before your work starts. The same words are in the More sheet on a phone.
- The number on **More** now says what it counts when you hover it or use a screen reader ("3 things to look at in Vault health").
- Plainer words: the panel beside Today is **In your file** (it was "Source on disk"), and the note menu item is **Show raw markdown (X-ray)**.

## [1.22.3] - 2026-11-23

### Changed
- The footer no longer has a Cheat sheet link, because the **?** button in the header opens the same page on every screen (and it is under More on a phone). The footer is now the version, What is new, Install and GitHub.

## [1.22.2] - 2026-11-23

### Changed
- Every link in the footer now opens in a new tab, so you do not lose your place: What is new, Cheat sheet and GitHub. What is new and the Cheat sheet are the app's own pages, so they open as their own small page (with an Open Plainfile button) even before a folder is open, and show your tags and keys if your folder opens there. The ? button in the header still opens the cheat sheet in the same tab.

## [1.22.1] - 2026-11-23

### Fixed
- Choosing People in the header now shows the list of everyone, not the last person you looked at. After opening one person (or renaming one), the People tab kept showing that person's page, so it looked as if nobody else was there. "All people" and the tab both go to the list.
- A note in a `people/` folder with no `type:` line now counts as a person note too. A note elsewhere that is only tagged #people does not.

## [1.22.0] - 2026-11-23

### Added
- **Repeating tasks.** Write `rec:1w` on a checkbox line (`d` days, `w` weeks, `m` months, `y` years; `rec:+3d` counts from the day you finish it), or `repeat: weekly` (or `1w`, `every 2 weeks`) in a task note. Finishing the task makes the next one, and the readout shows exactly what was written. On a checkbox line the next copy is added just below it (and its sub-items), unticked, with the new due date and today as its created date; unticking the finished one takes that copy away again if it is still unchanged. A task note stays a to-do and its due date moves on in the same file. A task that is several periods late makes one next task, due today or later, not one per missed week. Obsidian Tasks' `🔁 every week` is read but never rewritten. A bulk Mark done leaves repeating tasks alone, so you finish them one at a time. Lists show a ↻ chip.
- Quick add understands it: `Team sync every week`, `Check in every 2 weeks`, `Water plants daily`, and `Standup every monday` (weekly, first due next Monday). The preview says "repeats every week".
- **Pinned on Home.** Home has a Pinned card with your pinned notes (⋯ More, Pin to top), one click to open, and a hint on how to pin when there are none.

## [1.21.0] - 2026-11-23

### Added
- **Copy path** beside a note's path, and **Copy file path** in the ⋯ More menu, copy where the file is so you can paste it somewhere else. In Dropbox you get its Dropbox path. For a folder on your computer you get the full path, such as `C:\Users\you\Notes\inbox\Kickoff.md`: a browser cannot tell Plainfile where a folder is, so it asks once ("Folder location"), remembers the answer in this browser, and writes the slashes the way you typed it. The prompt also offers to copy just the path inside the folder, and ⋯ More → Folder location… changes the saved location.

## [1.20.1] - 2026-11-23

### Added
- A web address in a note is now a link in the editor, whether it is bare (`https://example.com/page`), in `<angle brackets>`, or written as `[text](https://example.com)`. Clicking it opens a new tab (with `noopener`). Nothing is written into your file, which stays plain markdown: no HTML tag is added. The full stop or bracket at the end of a sentence is not part of the link, and a click at the end of the line still just places the cursor.
- Links in copied formatted text, Word-friendly HTML and printed pages open in a new tab too, and bare web addresses become links there as well.

## [1.20.0] - 2026-11-23

### Added
- Finishing a task now records the day it was finished. Ticking a checkbox line adds `done:2026-11-23` to the end of the line; finishing a task note (or moving its card to Done) adds `completed: 2026-11-23` to its frontmatter. Reopening removes it. The "What changed on disk" readout shows both changed lines. Obsidian's ✅ date and Dataview's `[completion:: date]` are read too, and a task that already says when it was finished keeps that date.
- "Done per week" and the finished-tasks counts and lists in Insight use the real finish date where a task has one, and fall back to the old estimate (when its note last changed) where it does not. A task ticked in another editor has no date, which is fine.

### Changed
- Ticking a task now changes two things on its line: the box and the date, so the file is no longer "one character" different. Everything else in the file is still left byte for byte.

## [1.19.1] - 2026-11-23

### Fixed
- On Today, clicking a task that is already selected (or double-clicking one) now opens its note at that line. Before, a click only selected it, so it looked as if the note could not be opened. The panel on the right says so, and E still opens it.

### Changed
- The project page now uses the width of the window, and on the Board a column with no cards stays slim while the columns that hold cards share the room, so a few cards are not squeezed into narrow strips.
- An HTML comment in a note (`<!-- a note to yourself -->`, like the how-to in a new project) now shows greyed and italic in the editor, and is left out when you copy, print or export the note to Word or HTML. Comments inside code blocks are left alone.

## [1.19.0] - 2026-11-23

### Added
- Ctrl/Cmd+B makes the selection bold and Ctrl/Cmd+I italic in the editor: they wrap it in `**` or `*`, and pressing again takes the marks off (bold and italic together work too). With nothing selected they type a pair of marks and leave the cursor between them.
- A checkbox line can carry a status, the way it carries a due date: `- [ ] Draft the memo status:doing` or `status:waiting`. It shows as a status chip and in the project page's status grouping, bulk Set status works on it, and the project board moves it between columns. The word stays out of the title, ticking the box means done and removes it, and `#waiting` still works as before.

## [1.18.1] - 2026-11-23

### Fixed
- **+ Task** on a project page now opens the same New task form as + New, instead of a bare title and due date. It has a priority, people, tags and a due date (with Today, Tomorrow and Next week), the project is fixed to the one you are on, and you stay on the project page afterwards.
- The task line in that form (and in + New > Task) understands the one-line quick add: `(A) Call Dana @dana #launch due:friday` sets the priority, person, tag and date, and keeps them out of the title. Before, `@ada` was saved as part of the title.

## [1.18.0] - 2026-11-23

### Added
- Rename person. On a person's page in People, **Rename person** asks for the new name and previews every line that would change: each `@mention` in text and tasks, and each name in `people:`, `attendees:`, `owner:` and `assignee:`. Rename then rewrites just those names (one guarded write per note, line endings and everything else untouched). If the person has a note, it is renamed too with the links to it, its title follows, and the old name can be kept as an alias so old links still work. If the new name is someone who already exists, the preview says the two will become one. Undo puts the text changes back.

### Changed
- An `@handle` inside a fenced code block is no longer counted as a person.

## [1.17.5] - 2026-11-23

### Fixed
- Line breaks inside a paragraph are kept when you copy a note as formatted text, download it as Word or HTML, print it, or copy plain text. Lines such as a list of codes, one per line, used to run together into one long line.
- In focus mode, Details and Notes list now work: each opens its panel over the note, and a second press closes it. Before, they did nothing because the panels are hidden in focus mode.

### Changed
- The X-ray button is no longer in the note header. It is still in the ⋯ More menu as "X-ray (show raw markdown)", and on Ctrl/Cmd+Shift+X.

## [1.17.4] - 2026-11-23

### Added
- Every note in the Notes list (and in Pinned and Recent) has a small icon for what it is: a folder for a project, a head for a person, a tick box for a task, a speech bubble for a meeting, a calendar for a journal, and a page for any other note. The kind is read from the note itself (its `type`, its fields or its folder), so it follows whatever you change, and it is named for screen readers.

## [1.17.3] - 2026-11-23

### Added
- Each side panel on the Notes screen has its own « Hide / Hide » button, and when a panel is hidden a small tab on the window edge brings it back. The choice is remembered. (The Notes list and Details buttons in the note header still work too.)

## [1.17.2] - 2026-11-23

### Added
- A note's Properties panel has a People row, like Projects: type a name (several words are fine, "Ken Moore") and press Add, with type-ahead from the people you already have. Each person shows as a chip with an × to remove. It edits only the `people:` line of the frontmatter.

## [1.17.1] - 2026-11-23

### Changed
- A new project note now has a Milestones section under Goal, with the cursor placed there.
- A new project no longer starts with a blank placeholder task. The Tasks section holds a comment explaining how to add one (a checkbox line, or + Task for a task as its own note).

## [1.17.0] - 2026-11-23

### Added
- Priority, the todo.txt way: a capital letter in parentheses straight after the checkbox, `- [ ] (A) Call Dana`, or `priority: A` in a task note. A shows as an inverted badge, B bold outlined, C thin outlined, D to Z grey. Plainfile also reads the Obsidian Tasks emoji (🔺 ⏫ 🔼 🔽 ⏬) and never rewrites them unless you change that task's priority.
- Tasks sort by priority first (A, then B, then none), then by date, in every list.
- Start a quick add with `(A)` to set a priority. On Today, select a task and press 1, 2 or 3 to set A, B or C, and 0 to clear it. In a project, the Priority filter and the bulk bar set it for many tasks, with a preview and Undo.
- Each change edits one letter, shows the exact lines written, and leaves the rest of the file byte for byte.

## [1.16.2] - 2026-11-23

### Fixed
- A task that is still open now shows in the Tasks tab even when its project is archived. Only finished tasks of a closed-out project are left out of the list. Before, adding a task to an archived project made it vanish.

## [1.16.1] - 2026-11-23

### Fixed
- Close out and Reopen now show a working message at once ("Closing out the project…", then "Moving the folder to …") and ignore a second tap while files are written. Before, the confirmation just sat there until the folder move finished, which can take a while on Dropbox or a phone.
- The "Also move the project folder" line no longer breaks into pieces on a narrow screen.

## [1.16.0] - 2026-11-23

### Added
- **Pictures in the Word file.** A note's images (pasted screenshots and attachments: PNG, JPEG and GIF) are now embedded in the downloaded .docx at their real proportions, scaled to the page width, with the alt text kept as the picture's description. Images Word cannot show (SVG, WebP) still appear as `[image: description]`.

## [1.15.0] - 2026-11-23

### Added
- **Export a project's notes as one document.** **Export notes** in a project (beside Report) builds a single document: the project's title, a contents list, then each note as a chapter (its headings moved down a level, its frontmatter left out; task notes are in the status report). Copy it as formatted text, download it as Word, print or save as PDF, or save it as a note.

## [1.14.0] - 2026-11-23

### Changed
- **A faster first load.** The note editor (CodeMirror, most of the code) is now loaded the first time you open a note, so the main file is about 360 KB instead of 1 MB, and Home, Tasks and the other screens appear sooner. The installed app's offline copy includes the editor.

## [1.13.1] - 2026-11-23

### Added
- **Performance budgets in the unit tests** (`test/perf.test.ts`): on a synthetic 5,000-note vault, opening, task listing, search, Today, All tasks and the health badge must each stay within a generous time limit, so a change that makes any of them several times slower fails CI. Measured here: scan about 0.5 s, search about 25 ms.

## [1.13.0] - 2026-11-23

### Added
- **Fix all, with a preview, in Vault health.** When two or more broken links (wiki or markdown) have a close match, **Fix all N with a close match…** lists the exact line before and after for each, and writes only when you press Apply. Only link addresses change, each write is guarded, and a line that changed since is skipped, not forced.

## [1.12.0] - 2026-11-23

### Added
- **A search result opens with the match selected.** Clicking a result opens the note scrolled to the first place your first search word appears (on the task's line for a task), with that word selected.

## [1.11.1] - 2026-11-23

### Changed
- **The daily journal opens today's note if it exists** instead of offering a numbered copy. A template file can ask for the same with `reuse: true` in its `plainfile:` settings.

## [1.11.0] - 2026-11-23

### Added
- **Subtask progress.** A task with checkboxes nested under it (at any depth) shows "1 of 3" on its row in Today, Tasks and the project hub. The saved index is rebuilt once after updating.

## [1.10.0] - 2026-11-23

### Added
- **Reschedule from Today.** Choosing a task shows a Reschedule box beside it: Tomorrow, Next Monday, In a week, No date, or a date picker. Only the task's due date changes, and the exact line is shown.

## [1.9.0] - 2026-11-23

### Added
- **Insight time range.** Choose 13, 26 or 52 weeks for the activity grid, and step back through earlier months in the month card (‹ ›), where each count shows the change since the month before (+3, −1). The drill-down lists follow the month you are looking at.

## [1.8.1] - 2026-11-23

### Added
- **Keys for the Today list:** `j` and `k` move down and up the tasks, `x` ticks the chosen one, `e` opens its note. They do nothing while you are typing in a box. Listed in the cheat sheet.

## [1.8.0] - 2026-11-23

### Added
- **Fix broken markdown links, not only `[[wiki]]` ones.** In Vault health a broken `[text](path.md)` link with a close match gets a **Link to …** button that changes only its address (the text and any `#anchor` stay), written as the path from the linking note.

## [1.7.3] - 2026-11-23

### Added
- **App shortcuts.** When Plainfile is installed, pressing and holding its icon (or right-clicking it) offers **New task**, **Today** and **Search**, each opening the app on that screen (New task and Search focus their box).

## [1.7.2] - 2026-11-23

### Added
- **Create the note a broken link names.** In Vault health, a link that points nowhere has a **Create note** button: it makes the note (titled, dated, ready to fill in) beside the note that links to it. The linking note is not touched, and the list updates.

## [1.7.1] - 2026-11-23

### Added
- **Recent searches.** The Search screen lists the last eight searches that led you to a result, as chips that re-run with a click, with a Clear link. They are kept in this browser only.

## [1.7.0] - 2026-11-23

### Added
- **Tab and Shift+Tab nest list items.** On a bullet, numbered or task line, Tab indents the item and Shift+Tab takes it back out. On any other line they move focus as before. (Alt+Up and Alt+Down already move a line.)
- **Paste a web address over selected text to make a link:** select a word, paste `https://…`, and it becomes `[word](https://…)`.

## [1.6.5] - 2026-11-23

### Changed
- **Linked from shows the line itself.** In a note's Details panel each back-link now shows the linking note's title and the line the link is on, not just `path:line`, so you can tell what each mention says. Clicking still opens the note at that line.

## [1.6.4] - 2026-11-23

### Added
- **An Install button in the footer** for browsers that offer to install Plainfile as an app. It appears only while the browser is willing and the app is not already installed, and asks once.

## [1.6.3] - 2026-11-23

### Added
- **More template variables:** `{{weekday}}` (Monday), `{{day}}`, `{{week}}` (ISO week number), `{{month}}`, `{{year}}` and `{{datelong}}` (Monday 23 November 2026), beside `{{date}}`, `{{date+7d}}` and `{{time}}`. These names are now built in, so a template prompt with one of these names would be filled from the date instead of asked.

## [1.6.2] - 2026-11-23

### Added
- **Dates in plain words in the quick add.** End a line with `tomorrow`, `friday`, `next fri` (the Friday of next week), `on thu`, `in 3 days`, `in 2 weeks`, `next week`, `next month`, `end of month` or `eom` and it becomes the due date, shown in the preview and written as `due:YYYY-MM-DD`. Only the last words are read, so `Plan tomorrow's talk` is left alone, `@people`, `#tags` and `+Project` may follow the date, and an explicit `due:` always wins.

## [1.6.1] - 2026-11-23

### Fixed
- **The quick add box empties the moment you press Enter**, not after the save finishes. Typing the next task straight away could lose it; now it can't. If a line cannot be added (for example, an unknown `+Project`), it is put back in the box.

## [1.6.0] - 2026-11-23

### Added
- **Move a project's folder to the archive when closing it out, and back when reopening.** The confirmation has an "Also move the project folder to…" option (on by default, `archive/<name>`, the destination editable) with a live preview: how many files move and how many link lines in how many notes will be updated. Reopening a project that is under `archive/` offers to move it back (default `projects/<name>`).
  - Every file in the folder moves, notes and attachments, and every link that would break is rewritten, in the moved notes and in all the others: path wiki links (`[[projects/site/Plan]]`), markdown links and images. Links by plain name keep working untouched. A name clash with a note elsewhere is warned about.
  - It is applied in a safe order: copies first, then links elsewhere (each guarded by modified time), then the old files are removed last. If anything fails, the copies are removed and the old files are untouched. Version history moves with each note, and the emptied folders are removed.
  - Moving there and back leaves every file byte-for-byte as it began (tested).
- The engine is `src/folder-move.ts`; storage adapters can offer an optional `removeEmptyFolders`.

### Changed
- The Archived banner no longer says the files are untouched, since closing out can now move them.

## [1.5.2] - 2026-11-23

### Added
- **The open task count on a phone.** Tasks in the More sheet now shows the same small number as the desktop header.

## [1.5.1] - 2026-11-23

### Added
- **Word count and reading time** under a note's title ("320 words · 1 min read"), updating as you type. Frontmatter, code blocks and link addresses are not counted.

## [1.5.0] - 2026-11-23

### Added
- **A friendly error bar.** If something unexpected throws, a bar appears with what happened, **Copy details** (version, browser, screen size and the error, to paste into a bug report), **Reload** and **Dismiss**. Nothing is sent anywhere or collected.

## [1.4.2] - 2026-11-23

### Added
- **An accessibility check in the browser tests** (`tests/e2e/a11y.spec.ts`, `@axe-core/playwright`, dev only): axe scans 13 screens in light and dark against WCAG 2 A and AA, so a regression fails CI.

### Fixed
- Found by that check: file-name chips were too faint in dark mode and the greyed-out days of the Calendar month in light mode; the Calendar grid and the Insight activity grid used ARIA roles that did not fit their content; the sort state on the People and Projects tables was on the wrong element; and Home's week bars wrapped buttons inside an image role.

## [1.4.1] - 2026-11-23

### Added
- **`npm run coverage`** reports how much of `src/` the unit tests reach (`@vitest/coverage-v8`, dev only). Today: about 89% of lines, 78% of branches. The two files at 0% are `src/cli.ts` (tested by running the real command) and `src/fsa-storage.ts` (browser-only, exercised by the Playwright tests).

## [1.4.0] - 2026-11-23

### Added
- **Close out a project to the Archive.** A project's page shows its status (Active, or Archived with the date it was closed) and a **Close out** button; when every task is done it also offers to close the project. Closing out writes two lines in the project note (`active: false` and `completed: <date>`) after a confirmation, and nothing else changes, no file moves. **Reopen** undoes it.
- Archived projects are listed under **Archived** on the Projects screen and in the project rail, and their tasks are left out of the Tasks tab and Home. A task that is also in a live project stays.

## [1.3.1] - 2026-11-23

### Removed
- **The project drop-down beside the quick add.** Typing `+` already offers your projects as you type (`+Home` finishes to `+home-lab`), so the box was a second way to do the same thing, and a remembered choice could file the next task in the wrong place.

## [1.3.0] - 2026-11-23

### Changed
- **A calmer Tasks screen and project hub.**
  - The five numbers (open, overdue, done, notes, follow-ups) are buttons: each shows what it counts.
  - Filter, view and export controls are folded under **Filter & group**; the search box and Group by stay on top.
  - The long summary and the duplicate progress bar are gone, and the quick-add hint only appears while you type.
  - Each task row has one tick box; the select box only appears after **Select tasks**.
- **A small number on the Tasks tab** shows how many tasks are open.

### Removed
- **Saved views** (the View menu and Name this view / Save view). They were not wanted. Files already in `.plainfile/views/` are left alone and ignored.

## [1.2.1] - 2026-11-23

### Changed
- **The repository is now `adambeltz2/Plainfile`**, and the live app is at <https://adambeltz2.github.io/Plainfile/>. The README, the footer's GitHub and change log links, release notes and `package.json` point there. The Dropbox page explains that the redirect address must match the site's address.

## [1.2.0] - 2026-11-23

### Added
- **Export Insight as CSV or JSON.** Links at the top of the Insight screen download the activity per day, this month's numbers, topics, people and folders. The CSV is one flat table with a `section` column; the JSON keeps the structure.

## [1.1.3] - 2026-11-23

### Changed
- **A shorter header.** The everyday tabs (Home, Today, Tasks, Projects, Notes, Search) stay in the header. Calendar, People, Board, Recent, Insight and Vault health are under a **More** menu (with the Vault health count on it). It closes on Escape or a click elsewhere. Phones are unchanged (bottom bar).

## [1.1.2] - 2026-11-23

### Changed
- **The README is short.** It now has a three-step Get started, the SilverBullet and Obsidian comparison, screenshots, highlights and links. The feature list, principles, task formats and Dropbox setup moved to `docs/` (`FEATURES.md`, `DESIGN.md`, `TASK-FORMATS.md`, `DROPBOX.md`). The task formats page now lists every syntax Plainfile reads.

## [1.1.1] - 2026-11-23

### Added
- **GitHub releases.** When a new version reaches `main`, CI tags it (`v1.1.1`) and publishes a GitHub release with that version's notes from this file. Changes now go in through pull requests.

## [1.1.0] - 2026-11-23

### Added
- **Export tasks as CSV or JSON.** On the Tasks tab and in a project, Export CSV and Export JSON download the tasks currently shown (filters applied). CSV opens in a spreadsheet, with cells that could run as formulas defused.
- **Download a note as markdown or as a web page** (⋯ More), beside Word and PDF. The web page is one self-contained file with its images embedded.
- **Insert image…** in ⋯ More opens a file picker and puts the image in at the cursor, saved like a pasted one. Useful on phones.

### Changed
- **A note's version history now follows it** when it is moved or renamed (it used to stay under the old path).
- Reading tasks is faster: the task list is worked out once per change instead of on every call.
- Source maps are no longer published with the site (set `SOURCEMAP=1` when profiling).
- Issue and pull request templates, and a tidier `BACKLOG.md` (shipped items removed).
- The ⋯ More menu is measured after it is drawn and moved up if its last item (Delete) would fall below the screen.
- The demo vault has real modified times (no more "Thu 1 Jan"), and the sample project has a goal.

## [1.0.0] - 2026-11-23

First major version, for a project that is ready for outside contributions.

### Added
- **Prettier.** All TypeScript and script files are formatted with Prettier (`npm run format`), and CI fails if a file is not (`npm run format:check`). Settings are in `.prettierrc.json`; styles, docs and generated files are left alone.
- **`CONTRIBUTING.md`**: how to set up, what to run before a pull request, and what a good change looks like.
- **`.git-blame-ignore-revs`**, so `git blame` skips the one commit that reformatted the code.

### Changed
- Every `.ts` and `.mjs` file was reformatted once (whitespace and line wrapping only; no behavior change). The unit tests, browser tests and build are unchanged.

## [0.48.0] - 2026-11-23

### Added
- **`plainfile check --json` and `--strict`.** `--json` prints the Vault health report as JSON (with a `broken` count); `--strict` exits with status 1 if any link or embed is broken or ambiguous, so a CI job can fail on it. Without `--strict` it only reports.

### Changed
- The type check is stricter: unused variables and parameters, missing returns and switch fall-through are now errors. One unused parameter was removed. ESLint could not be added because typescript-eslint does not support TypeScript 7 yet (logged in the backlog).

## [0.47.3] - 2026-11-23

### Fixed
- The folder adapter used by the command line (`NodeStorage`) now refuses any path that would leave the vault folder, such as `../file.md`, for every read, write and delete. The browser adapters were already confined by the browser. An outside review pointed at path safety; the rest of its list is in `BACKLOG.md`.

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
