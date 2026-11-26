# Next version: a review of usage and design

Written after a long run of real use (a Dropbox vault on Android and a desktop browser) and about forty releases.
It looks at what the app does well, where it is harder to use than it should be, and what to change in a next major
version. Screenshots referred to are in `docs/screenshots/`.

## What is working and should not change

- **Files are the product.** Plain markdown, smallest possible edits, a readout of the exact lines written, a trash,
  history, and tolerance for other tools' syntax. This is the reason to trust it. Keep it load-bearing.
- **One-line capture** (`Call Dana +Website @dana due:friday`, now with plain-word dates) is the best idea in the app.
  It is fast, it teaches its own syntax through the preview, and it never asks a question.
- **Safety nets that are visible:** conflict detection, guarded writes, Fix-all with a preview, folder moves that can
  be reversed byte for byte. Users never had to wonder whether the app had damaged a file.
- **The engineering discipline:** every list clickable (tested), an accessibility scan, performance budgets, releases
  from pull requests. Most bugs found in use were dead clicks and clutter, which these now catch.

## What usage showed

Almost every complaint in this project was one of three things.

1. **Dead ends.** Seven or more places looked clickable and did nothing (tasks on Home, Calendar, People, the project
   list, Board cards). Each was fixed one at a time after the user hit it.
2. **Too many things at once.** The Tasks screen had two checkboxes per row, a saved-views menu nobody wanted, a project
   drop-down duplicating the `+` type-ahead, and numbers that were not clickable. On a phone "the sheer amount of things
   to click is overwhelming".
3. **Several screens answering the same question.** "What should I do now?" is answered by Home, Today, Tasks, the
   project hub, the Board and the Calendar, each a little differently.

## Design critique, screen by screen

- **The header** carries ten controls before any content: six tabs, More (with an unlabelled badge that is really the
  Vault health count), Go to…, + New, Rescan, Open folder, ?, and a theme switch on its own row. Rescan, Open folder and
  the theme belong in a menu; the badge on More says nothing.
- **Home, Today and Tasks overlap.** Home's "Today 4" card is a smaller Today; Tasks is Today with everything. A user
  has to learn which of three tabs is "the one".
- **Task rows are noisy.** Every row prints its file path as a chip. Useful for trust, but it is the same on every row of
  every list. It should appear on hover or selection.
- **Task notes pollute Notes.** The Notes list ("Recent", folders) mixes real notes with the one-file-per-task notes the
  quick add creates ("Write pricing page copy", "Photograph team"). A reader looking for writing finds chores.
- **The editor opens on raw YAML.** The frontmatter block takes the top third of a short note, while a Properties panel
  already shows the same fields. The principle (markdown visible, or one keypress away) is met by X-ray; the default can
  fold the YAML.
- **The note header has seven buttons** (Undo, Redo, Notes list, Details, Focus, X-ray, More) before the text starts.
- **The project hub repeats itself.** The five stat buttons, the progress bar in the right column, the Tasks tab count
  and "1 of 5 done" all say how the project is going. The header has six buttons.
- **Vocabulary is developer-speak:** "Source on disk", "X-ray", "Rescan", "Tidy", "Vault health", "scanned in 18 ms".
  Accurate, but a newcomer does not know what they are for.
- **On a phone** the "start of day" screen (Tasks) lives under More, capture is a text box at the top of a long page,
  and the bottom bar spends a slot on Projects, which is rarely the first stop.

## The next version: five ideas

### 1. One task workspace instead of five

Today, Tasks, the project hub, the Board and the Calendar are separate modules that all list the same tasks. Make them
one **Plan** screen with two choices:

- **Scope:** Everything, a project, a person, a tag, or a saved filter.
- **View:** List (grouped by due date or status), Board, Calendar, Timeline.

Home becomes the first view of Plan ("Today") plus capture. Fewer concepts to learn; one filter bar; one set of
keyboard shortcuts; one place to fix clutter. It also removes a large amount of duplicated code (`today.ts`, `hub.ts`,
`board.ts`, `calendar.ts` each have their own row, selection and grouping logic).

### 2. Capture everywhere, on one key

A single omnibar (Ctrl/Cmd+K and a floating Add button on phones) that is both **Go to** and **Add**: type a note name
to open it, or type a sentence and the first result is "Add task: …" with the live preview. Capture should never need a
screen change. Quick note, quick task and "add to this project" become one gesture.

### 3. Separate writing from doing in the Notes list

Hide task notes from Notes by default (a toggle shows them). Group by project instead of by folder. Fold the raw
frontmatter in the editor behind the Properties panel; keep X-ray for the full text. Reduce the note header to Title,
a single "…" menu, and Focus.

### 4. A calmer shell

Header: logo, five destinations (Plan, Projects, Notes, Insight, Search/Go to), and one overflow menu holding Rescan,
Open folder, theme, Vault health, Cheat sheet. Put a visible label on any badge. On a phone: a bottom bar of Plan,
Notes, Capture (centre, large), Projects, More.

### 5. Say what the app is doing, in plain words

Rename for newcomers while keeping the technical term in a tooltip: "Source on disk" to "What changed in your file";
"Rescan" to "Check for changes"; "X-ray" to "Show markdown"; "Tidy" to "Standardise fields". Keep the exact-lines
readout; it is the trust feature.

## Beyond the interface

- **Make the first run great.** An empty folder should offer to create `inbox/` and a short README note, and an
  existing vault should get a read-only tour of what tendfile found (tasks, projects, people) before anything is
  written. Today the first run is a landing page with three buttons.
- **A weekly rhythm, not just a review screen.** The review exists but is hidden. Surface "review due" on the plan
  view, and save a dated review note when it ends (opt-in).
- **Recurring tasks and priorities** are the two features people expect and the app lacks. Both need a decision on
  syntax first (`🔁 every monday` is what Obsidian Tasks uses; `!high` or `priority: 2`), then the same minimal-edit
  treatment as due dates.
- **Offline read mode for cloud folders** and a second cloud provider (OneDrive) are the largest reach gains.
- **Real-device testing** is the biggest unknown: Android file-access quirks, iPhone with Dropbox, long-press menus,
  the keyboard over the bottom bar. A small panel of testers beats more features.

## Technical changes that would help

- **Replace string-template rendering** with a small view layer (or a tiny virtual DOM). Every screen redraws with
  `innerHTML`, which is why focus, scroll and open controls need hand-written restoring code and why several bugs came
  from a re-render in the middle of typing.
- **Give each screen its own click handling** instead of one long chain in `web/main.ts`, so ordering stops mattering.
- **Split `web/notes.ts`** (about nine hundred lines): history panel, trash and delete, properties, link handling.
- **Keep the safety nets as CI gates:** clickability audit, accessibility scan, format check, performance budgets.
  Add a screenshot comparison for the main screens in both themes, and a phone-width pass.

## A suggested order

1. Calmer shell, plain-words labels, hide task notes from Notes (days of work, immediate relief).
2. The omnibar with Add (small, high value for a phone user).
3. The single Plan workspace (the big refactor; do it behind the existing tests).
4. First-run experience and recurring tasks.
5. A second cloud provider and offline reading.

## What not to do

- Do not add accounts, a server or a plugin system. The strength is that there is nothing to run and nothing to lose.
- Do not add colour. Weight, borders and inversion carry state well; the black and white rule is a feature.
- Do not turn the app into a notes database. If a view cannot be rebuilt from the files, it does not belong.

## Build plan (agreed choices)

Decisions: priorities are `(A)` to `(Z)` after the checkbox; repeats use `rec:` for inline tasks and `repeat:` in task notes
(Obsidian `🔁` is read, never rewritten); first-run setup is kept but optional and tucked under the menu.
Each step ships as its own release with tests, the way the project already works.

| Step | Version | What ships | Main tests |
|---|---|---|---|
| 0 | 1.16.1 | Close out working state (done) | e2e with slowed writes |
| 1 | 1.17.0 | **Priority.** Parse `(A)`, `priority:` and `⏫ 🔼`. Chip (inverted A, bold B, thin C), sort within groups, `(A)` in quick add, keys `1 2 3 0`, Priority filter. | Parser forms; one-letter write-back is byte identical; CRLF; `(a)` prose not a priority |
| 2 | 1.18.0 | **Repeats.** Parse `rec:1w`, `rec:+3d`, `repeat:`, `🔁`. Ticking writes the done line and the next line with a readout; Undo removes both. "every monday" in quick add. | No duplicate next line; one next task after missed repeats; month ends; task-note form |
| 3 | 1.19.0 | **Calmer shell.** One overflow menu (Rescan, Open folder, Theme, Health, Cheat sheet), labelled badge, plain-word labels, path chip only on hover or select, task notes hidden from Notes by default, frontmatter folded in the editor. | Header and clicks specs, axe scan, phone layout |
| 4 | 1.20.0 | **Omnibar.** Go to… becomes Add or go to… with a live "Add task" first result, and a + button on phones. | Palette and quick add specs |
| 5 | 2.0.0 | **Plan.** Build in three releases behind the existing screens: (a) `src/scope.ts`, one tested filter model for everything, (b) the Plan screen with scope bar and List view, (c) Board, Calendar and Timeline as views, then Home and Today become saved scopes and the old tabs redirect. | Scope unit tests; every old route still opens; clicks and a11y specs; perf budget on 5,000 notes |
| 6 | 2.1.0 | **Set up this folder.** Optional, under the menu and one quiet line on an empty folder; lists exact files, writes nothing until confirmed. | Memory and disk adapters; no write on cancel |

Risks and how they are handled:
- **`(A)` at the start of a task might be prose.** Only an upper case single letter plus a space directly after the checkbox counts.
- **Repeats are the first feature that writes a new line on its own.** Always shown in the readout, undoable, never repeated twice.
- **Plan replaces five screens.** Built last, on top of a tested scope model, with old addresses kept working so nothing in a bookmark or the installed app shortcuts breaks.
