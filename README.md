# Plainfile

**Working name.** Successor to Notebook.

<a href="https://www.buymeacoffee.com/adambeltz" target="_blank" rel="noopener noreferrer"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy me a coffee" height="36" /></a>

A productivity hub over a plain folder of markdown files. Tasks, notes, tags and
links live in ordinary `.md` files with frontmatter. The app reads them and
gives you one place to see everything. Nothing is stored anywhere else, so the
folder is the whole repository and works with any editor or sync tool.

The previous app, Notebook (a single-page dashboard that kept projects in browser
storage), is preserved at the commit
[`76ac8ba`](https://github.com/adambeltz2/Simple-Productivity/tree/76ac8bab2b96dbd24463fea5f825702dc1c3a441).
Notebook project files, including `#due:` and `#followup` tags, still work here.

## Status

The core library, a command-line tool and the browser app work and are tested.
The browser app opens a folder directly (Chrome, Edge, Brave or Opera on desktop) and has
seven parts: **Today** (every task due or overdue, quick add, tick with a readout of exactly
what changed in the file), **Board** (task files in status columns), **Notes** (a live editor where `- [ ] ` becomes a checkbox as you
type, with X-ray, date chips and a properties panel, and a **Rename** that rewrites every link),
**Search**, **Vault health**, and a **+ New** menu that creates notes and tasks from templates. Safari, Firefox and phones can
try the sample vault for now. Design mockups are in [`docs/mockups.html`](docs/mockups.html).

## Principles

- **Files are the source of truth.** The index is a cache and can always be rebuilt.
- **Tolerant reading.** Any markdown file works, with or without frontmatter.
  Obsidian Tasks and Dataview date styles are understood.
- **Minimal writing.** The app edits the smallest piece of text it can: one
  checkbox character, one `status:` value. It never reformats a file, and never
  touches a file you did not change. Line endings are preserved.
- **Safe writes.** A write is refused if the file changed on disk since it was read.
- **Structure is opt-in.** Plain notes work. Frontmatter, types and templates
  unlock more, but nothing is required.

## What exists so far

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
| Browser app: shell and screens (Today, Notes, Search, Health, New menu) | `web/main.ts`, `web/today.ts`, `web/notes.ts`, `web/search.ts`, `web/health.ts`, `web/newmenu.ts` |
| Live editor | `web/editor.ts` |
| Board and Rename screens | `web/board.ts`, `web/rename.ts`, `src/rename.ts` |
| Templates, quick add, link fixes, frontmatter edits | `src/templates.ts`, `src/capture.ts`, `src/fixes.ts`, `src/frontmatter.ts` |

Next: a small local server as a fallback for browsers that cannot open a folder.

**Install it:** in Chrome, Edge or Safari use the install button in the address bar (or
"Add to Home Screen" on a phone). It then opens in its own window, and the app itself
opens offline after the first visit.

## Try it

```bash
npm install
npm run build && npm run serve   # then open http://127.0.0.1:4173
npm test                         # unit tests
npm run test:e2e                 # browser tests, including a real folder
npm run plainfile -- today --vault sample-vault --today 2026-11-21
npm run plainfile -- check --vault sample-vault
npm run plainfile -- search "is:open tag:launch" --vault sample-vault
```

Commands: `today`, `tasks`, `search`, `backlinks`, `check`, `scan`, `done`, `undo`.
Task ids are `path:line`, as printed by `today` and `tasks`.

## Task formats

```markdown
- [ ] Send logo files @dana due:2026-11-23 #launch      inline, in any note
```

```markdown
---
title: Write pricing page copy
status: doing
due: 2026-11-24
---
```

A note is a task file when it has `status` and lives in a `tasks/` folder or has
`type: task`.

## Interface design

- Black and white only. A Light, Dark or Auto control on every screen; Auto follows your device.
- Typing `- [ ] ` converts to a checkbox as you type, and a typed `*` is saved as `-`.
  Inline formatting renders when you leave the line.
- X-ray shows any note as raw markdown.
- The ? button opens a cheat sheet of the syntax, with your own tags and frontmatter keys.

## Project docs

- `CLAUDE.md`: engineering conventions and product rules.
- `CHANGELOG.md`: what shipped, by version.
- `BACKLOG.md`: deferred features, bugs and debt.

## License

MIT. See `LICENSE`.
