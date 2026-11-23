# Task formats

Back to the [README](../README.md).

There are two kinds of task, and they appear in one list.

## An inline task

A checkbox line in any note:

```markdown
- [ ] Send logo files @dana due:2026-11-23 #launch
```

## A task note

A note with a `status`, in a `tasks/` folder or with `type: task`:

```markdown
---
title: Write pricing page copy
status: doing
due: 2026-11-24
created: 2026-11-20
project: website
people: [dana]
tags: [launch]
---
```

`status` is `todo`, `doing`, `waiting` or `done`. `project` can list several projects (`project: [site, kitchen]`). Tasks you add from the quick-add box are made this way.

## Dates, other syntaxes it understands

Plainfile reads these when it opens your files, and writes the standard form:

| Meaning | Written as | Also read as |
|---|---|---|
| Due | `due:2026-11-23` | `#due:2026-11-23` (Notebook), `📅 2026-11-23` (Obsidian Tasks), `[due:: 2026-11-23]` (Dataview) |
| Created | `created:2026-11-20` | `➕ 2026-11-20`, `[created:: 2026-11-20]` |
| Done | `- [x]` | |
| Person | `@dana` | `people:` / `attendees:` in frontmatter |
| Tag | `#launch` | `tags:` in frontmatter |
| Link | `[[note]]` | `[text](note.md)` |

In the quick-add box you can also type `due:today`, `due:tomorrow`, `due:fri` and `+Project`.

## What it never does

It edits the smallest piece of text: one checkbox character, or one frontmatter value. Line endings, key order and comments are kept, and nothing is reformatted.
