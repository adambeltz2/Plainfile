# Backlog

Deferred features, bugs, and debt, per `CLAUDE.md` §4. Tags: `[BUG]`,
`[FEATURE]`, `[REFACTOR]`, `[DEBT]`.

- `[FEATURE]` Browser storage adapter using the File System Access API (mode A):
  open a folder, remember the handle, re-request permission per session, rescan
  on tab focus because there is no reliable file watcher. _Affected: new
  `src/fsa-storage.ts`._
- `[FEATURE]` Web UI: Today, Board, Note, Search, Templates, Vault health and
  Rename screens, following `docs/mockups.html` in black and white.
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
