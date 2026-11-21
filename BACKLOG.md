# Backlog

Deferred features, bugs, and debt, per `CLAUDE.md` §4. Tags: `[BUG]`,
`[FEATURE]`, `[REFACTOR]`, `[DEBT]`.

- `[FEATURE]` Board screen and Rename screen, following `docs/mockups.html` in black and white.
- `[FEATURE]` "Forget this folder" control, using `forgetHandle` in `web/handle-store.ts`.
  _Affected: `web/main.ts`, `web/store.ts`._
- `[DEBT]` The File System Access API has no compare-and-swap, so a very small window
  remains between the modified-time check and the write closing. _Affected:
  `src/fsa-storage.ts`._
- `[DEBT]` The app re-renders each screen with `innerHTML`. The editor and inputs are kept
  alive across redraws, but a proper view layer would be cleaner. _Affected: `web/main.ts`._
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
- `[FEATURE]` Editor: italics (`*x*`), tables rendered in place, drag a task between lines, and
  a block-level "show markdown" handle. _Affected: `web/editor.ts`._
- `[FEATURE]` Create a note or task from a link that points nowhere. _Affected: `web/health.ts`._
- `[FEATURE]` Fix markdown-style `[text](path.md)` broken links, not only `[[wiki]]` links.
  _Affected: `src/fixes.ts`._
- `[FEATURE]` Move unused attachments to an `_unused/` folder from Vault health. _Affected:
  `src/storage.ts`, `web/health.ts`._
- `[FEATURE]` Daily journal: open today's note if it already exists instead of numbering a copy.
  _Affected: `src/templates.ts`._
- `[DEBT]` The note list is not virtualized and the whole index is rebuilt after each save.
  Fine for thousands of notes, not for tens of thousands. _Affected: `web/notes.ts`, `src/index.ts`._
- `[DEBT]` The editor scans the whole document to build styling on each change. _Affected:
  `web/editor.ts`._
