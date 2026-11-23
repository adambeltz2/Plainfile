# Principles and interface design

Back to the [README](../README.md).

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

## Interface design

- Black and white only. A Light, Dark or Auto control on every screen; Auto follows your device.
- Typing `- [ ] ` converts to a checkbox as you type, and a typed `*` is saved as `-`.
  Inline formatting renders when you leave the line.
- X-ray shows any note as raw markdown.
- The ? button opens a cheat sheet of the syntax, with your own tags and frontmatter keys.
