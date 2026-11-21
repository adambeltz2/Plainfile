# Backlog

Deferred features, bugs, and debt, per `CLAUDE.md` §4. Tags: `[BUG]`,
`[FEATURE]`, `[REFACTOR]`, `[DEBT]`.

- `[FEATURE]` Web UI screens still to build: Board, Note, Search, Templates, Vault
  health and Rename, following `docs/mockups.html` in black and white. Today is done.
- `[FEATURE]` "Forget this folder" control, using `forgetHandle` in
  `web/handle-store.ts`. _Affected: `web/main.ts`._
- `[FEATURE]` Create a task from the Today screen, writing a new line or file
  through the guarded write path. _Affected: `src/writeback.ts`, `web/main.ts`._
- `[DEBT]` The File System Access API has no compare-and-swap, so a very small window
  remains between the modified-time check and the write closing. _Affected:
  `src/fsa-storage.ts`._
- `[DEBT]` The UI re-renders the whole page with `innerHTML` on each change. Fine for
  this screen, but the editor will need a proper view layer. _Affected: `web/main.ts`._
- `[FEATURE]` Live editor (CodeMirror 6): block markers convert as you type,
  inline formatting renders on leaving the line, X-ray toggle, chips for dates,
  people and tags, properties panel.
- `[FEATURE]` Templates stored in `.plainfile/templates/` with a `plainfile:`
  settings block, prompts and variables (`{{date}}`, `{{date+7d}}`, `{{cursor}}`).
- `[FEATURE]` In-app rename that rewrites inbound links with a preview and
  optionally keeps the old name under `aliases:`. _Affected: new
  `src/rename.ts`._
- `[FEATURE]` Follow-ups as a saved view over the `#followup` tag, replacing
  Notebook's Follow-ups rail.
- `[FEATURE]` Notebook import check: confirm `active` and `sortOrder` frontmatter
  drive a numbered active-projects list.
- `[FEATURE]` Local server fallback (mode B) for Safari, Firefox and phones,
  built on `NodeStorage`.
- `[FEATURE]` Folder rules in `.plainfile/config.md` that give files a type and
  template without editing them.
- `[DEBT]` Search is a substring match over every note held in memory. Move to a
  ranked index (SQLite FTS or MiniSearch) once vaults get large.
- `[DEBT]` Rename detection matches exact content hashes only. Add fuzzy matching
  for a renamed and edited file. _Affected: `src/index.ts`._
- `[DEBT]` `VaultIndex.tasks()` rebuilds the list on each call. Cache it per scan.
  _Affected: `src/index.ts`._
