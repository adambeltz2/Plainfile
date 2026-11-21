# CLAUDE.md: System Instructions & Agent Protocols

## 1. Core Objective & Mindset
Act as a senior software engineer and technical investigator. Optimize for correctness, robust solutions, and minimal assumptions. Prefer deep investigation over quick guesses.
*   **Investigate First:** If a problem involves multiple components, trace the flow across the repository before writing code.
*   **Reuse over Rebuild:** Before creating utilities, helpers, or abstractions, search the repo to ensure an equivalent doesn't already exist.
*   **Root Cause Focus:** Do not blindly patch symptoms. Trace execution paths, identify actual failure points, and implement the smallest robust fix.

## 2. Token & Output Maximization (CRITICAL)
*   **Zero Truncation:** NEVER use placeholders, ellipses, or comments like `// ... rest of code` or `/* existing implementation */`.
*   **Complete Deliverables:** Always output the absolute entirety of the requested code or file. You must prioritize using your maximum output token limit to provide complete, runnable solutions.
*   **Continuous Generation:** If you mathematically cannot fit the entire output into a single response limit, stop exactly at the cutoff point. Await the prompt "continue" to resume precisely where you left off.
*   **No Filler:** Skip all pleasantries, summaries, and intro/outro fluff. Begin immediately with the technical solution.

## 3. Formatting & File Standards
*   **Strict File Order:** Always keep file order exactly as provided in the prompt/context unless explicitly instructed to change it.
*   **External Links:** Whenever generating markdown or HTML that includes external links, always configure them to open in a new tab (e.g., `target="_blank"`).
*   **Output Discipline:** Do not narrate every trivial tool call or investigative step. Only provide explanations if explicitly asked, and place them *after* the code blocks.

## 4. Scope Management & Backlog Protocol
*   **Strict Backlog Usage:** If a new feature idea, edge case, or non-critical bug is discovered, DO NOT implement it on the fly. Immediately log it in `BACKLOG.md`.
*   **Zero Scope Creep:** Keep generated code strictly confined to the explicit objective of the current prompt. Protect the token budget by deferring all secondary improvements.
*   **Format:** Append items to `BACKLOG.md` using tags: `[BUG]`, `[FEATURE]`, `[REFACTOR]`, `[DEBT]`, followed by a concise description and affected files.

## 5. Product, Technology Stack & Environment Rules

### 5.1 What this project is
Plainfile (working name) is the successor to **Notebook**, the single-file app that previously lived in this repository. The last Notebook release is preserved at the commit `76ac8ba`. Plainfile is a local-first productivity hub over a **plain folder of markdown files**: tasks, notes, tags, links and projects all live in ordinary `.md` files with frontmatter. The folder is the whole repository and is portable to any editor or sync tool. The app is a layer on top, never a second source of truth.

### 5.2 Data principles (load-bearing, do not break)
*   **Files are the source of truth.** The index is a cache that is always rebuilt from the files. It is never backed up, and it is always safe to delete.
*   **Tolerant reading.** Any `.md` file is valid, with or without frontmatter. Title comes from frontmatter `title`, then the first `#` heading, then the file name. Understand several syntaxes when reading: `due:2026-11-23`, `#due:2026-11-23` (Notebook), `📅 2026-11-23` (Obsidian Tasks), `[due:: 2026-11-23]` (Dataview); `[[wikilinks]]` and `[text](path.md)`; `#tags` and frontmatter `tags`.
*   **Minimal, canonical writing.** Edit the smallest piece of text possible: one checkbox character, one frontmatter value. Never reformat a file, never touch a file the user did not change, preserve line endings, key order and comments. New list items are written with `-`, so a typed `*` is saved as `-`.
*   **Deleting.** A note is moved to `.plainfile/trash/` by default (the original path is kept in the file name, and Undo and a Trash list restore it); permanent deletion is a separate choice with a second confirmation. Both are guarded by the modified time the app last showed.
*   **Autosave and history.** Notes autosave shortly after typing stops. Before overwriting, the previous content is kept in `.plainfile/history/<encoded path>/<UTC stamp>.md` (the first save of a session, then at most every five minutes, newest 30 kept). History is best effort and never blocks a save. Restoring a version is an editor edit, so Undo works.
*   **Safe writes.** Every write is guarded by the file's last-modified time and refused with `ConflictError` if the file changed since it was read. A task whose line no longer matches what was indexed raises `StaleError`. Writes go through a temp file and rename.
*   **Structure is opt-in.** Levels: plain file, frontmatter, typed (template or folder rule), project or view. Nothing is required. Folder rules and templates add structure without editing foreign files.
*   **Created dates and people.** Tasks the app creates carry a created date (`created:YYYY-MM-DD` inline, `created:` in task-file frontmatter) and empty `tags` and `people` to fill in. Read `created:`, `➕ date` and `[created:: date]`. A project is a folder with an `index.md`; tasks and notes made from a project are filed in that folder with `project: <folder name>`.
*   **Two kinds of task, one list.** Inline `- [ ]` lines in any note, and one-file-per-task notes (frontmatter `status`, in a `tasks/` folder or with `type: task`). Task ids are `path:line`.
*   **Links and renames.** Back-links are never stored; they are computed from current links. Links resolve by path, file name, title or `aliases`. Renames made in the app rewrite inbound links with a preview. Renames made outside the app are detected by content hash and offered as a one-click fix. No `id:` is added to files automatically.
*   **Notebook compatibility.** Notebook project files (`title`, `active`, `sortOrder` frontmatter, `#followup` and `#due:` tags) must keep working. Follow-ups (non-checkbox lines tagged `#followup`) and numbered Projects (`active`, `sortOrder`) are views over the notes, not separate records; both are built.

### 5.3 Technology
*   **Language:** TypeScript. The core (`src/`) has no browser or Node dependencies except through the `VaultStorage` interface (`src/storage.ts`). Folder access is an adapter: `MemoryStorage` (tests), `NodeStorage` (CLI and local server), and a browser adapter using the File System Access API.
*   **Shipping:** A static web app. The TypeScript is compiled and bundled (esbuild, `npm run build`) into plain static files in `dist/`, served from GitHub Pages. The browser app lives in `web/`; the core in `src/` must not import anything from `web/`. There is no backend server, no database, no accounts. Node/npm are build and test tooling only, never part of what runs for the user.
*   **Platform modes:** (A) open a folder directly in Chromium-based desktop browsers via the File System Access API, preferred; (B) a tiny local server over the folder for Safari, Firefox and phones, only where A is impossible; (C) import and export fallback. Mode A must be the default experience. Treat B as a fallback and keep the storage interface the single seam.
*   **Sync:** The app does not implement sync. The folder works with any sync tool (iCloud, Dropbox, Syncthing, git). The app detects external edits, checks timestamps before every write, and surfaces conflicts instead of overwriting.
*   **Dependencies:** Do not add a new dependency unless the platform cannot do the job. Check first. Pin exact versions. Any library loaded from a CDN must be version-pinned with an SRI hash.
*   **Testing:** Vitest for the core (`npm test`), with `npm run typecheck`. Tests are a hard rule: any change that adds, removes or alters behavior ships with a new or updated test in the same change. Write-back code must have tests that assert the file is byte-identical apart from the intended edit. Browser tests use Playwright (`npm run test:e2e`, specs in `tests/e2e/`). They open a real `FileSystemDirectoryHandle` from the browser's origin-private storage through the `window.__plainfile.openHandle` test hook, so the File System Access adapter is exercised for real. Any user-visible UI change ships with an updated spec.
*   **Installable app:** `web/manifest.json`, `web/icons/` and `web/sw.js` (cache name filled in with the package version by `scripts/build.mjs`) make the app installable and available offline. The worker is network first and deletes older caches on activate; keep it at the same address so it keeps replacing the earlier Notebook worker. Regenerate the PNG icons with `node scripts/make-icons.mjs` after changing the SVGs.
*   **Versioning:** Bump the version in `package.json` on every deploy-intended change and add an entry to `CHANGELOG.md`. Commit both together.

### 5.4 Interface rules
*   **Colors:** Basic black and white only, following the system light or dark setting, plus a Light | Dark | Auto control that is available on every screen, including the landing screen, and shows the current choice. No accent hues. Distinguish state with weight, borders, inversion and icons, not color.
*   **Editing:** One live editor. Block markers convert as you type (`- [ ] ` becomes a checkbox, `# ` a heading). Inline formatting such as `**bold**`, `[[links]]` and `@name` renders when the cursor leaves the line. The markdown on disk is always visible or one keypress away. **X-ray** shows any note as raw markdown.
*   **Transparency:** After any write, show what changed on disk (the exact before and after lines).
*   **Non-blocking health:** Vault health lists broken links, duplicates, orphans and unused attachments with one-click fixes. It never blocks work.
*   **Reference design:** `docs/mockups.html` holds the planning mockups: Today, Board, Note, Editor, Live typing, Search, Templates, Vault health and Rename. All of them are built. The mockups predate the black and white rule and the decision to use X-ray instead of per-block source handles; follow this section where they differ.
*   **Screens:** Today, Board, Notes (live editor), Explore (related content and a neighbourhood graph), Search and Vault health are in the header navigation, with a ? button for the cheat sheet (`web/guide.ts`). Every screen shows a footer with the app version. Rename opens from a note's header or from the banner shown when an outside rename is detected. + New and quick add create files. Each screen is one module in `web/`.

## 6. Security & State Changes
*   **Database/API Changes:** Never make destructive schema changes or breaking API changes without explicit confirmation. Check migrations, callers, and compatibility first.
*   **Version Control:** Do not overwrite unrelated user changes. Keep changes focused and atomic. When asked, output exact commit commands (e.g., `git commit -m "..."`) without explanations.
*   **Secrets:** Never expose secrets, API keys, or hardcoded credentials in source code, logs, or commits. Treat security as a first-class concern.
*   **User data:** Never modify files in a user's vault except through the guarded write path. Sample data lives in `sample-vault/`; tests must not write outside memory or a temp copy.
