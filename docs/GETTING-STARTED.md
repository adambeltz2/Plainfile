# Getting started

A ten-minute tour. Back to the [README](../README.md). Nothing here is required: Plainfile reads any folder of `.md` files, and every file stays plain markdown the whole time.

## 1. Open something

Open the **[live app](https://adambeltz2.github.io/Plainfile/)** and pick one:

- **Try the sample vault** to click around with example data. Nothing is saved anywhere.
- **Open folder** (Chrome, Edge or Brave on a computer) to work in a folder on your disk. Pick the folder that directly holds your notes; an empty folder is fine.
- **Connect Dropbox** (any browser, including iPhone and Safari) to work on a Dropbox folder. See [Connecting Dropbox](DROPBOX.md).

## 2. What's what

Plainfile has a few kinds of thing. Each one is an ordinary markdown file, and each one has a place in the folder.

| It is | Use it for | Lives in | How to make one |
| --- | --- | --- | --- |
| **Task** | Something to do, usually with a date. | A line in any note (`- [ ] Call Dana`), or its own file in `tasks/`. | Type it in the quick add box on **Tasks** or **Home**, or **+ New → Task**. |
| **Note** | Anything you want to write down and find again. | Any `.md` file. | **+ New → Quick note** (named with the date and time, no questions), or **Notes**. |
| **Journal** | One page per day: tasks, notes, an end-of-day check. | `journal/2026-11-26.md` | **Journal** under **More**, or **Start today's journal** on Home. |
| **Meeting** | A dated note with people, agenda, decisions and action items. | `meetings/` | **+ New → Meeting**. |
| **Project** | A group of tasks and notes that belong together. | A folder with an `index.md` inside; a project can hold sub-projects. | **+ New → Project**. |
| **Person** | A contact note. `@dana` in any task or note links to them. | `people/dana.md` | **+ New → Person**, or just write `@dana`. |

A task can be a line inside a note or a note of its own; both show up in the same list. Most of the time you won't care which: use the quick add box and let it decide.

## 3. Your first five minutes

1. **Add a task.** On **Home** or **Tasks**, type in the quick add box and press Enter:
   `Call Dana +Website @dana #launch due:friday`
   `+Website` files it in a project, `@dana` adds a person, `#launch` a tag, `due:friday` a date. All of it is optional.
2. **See it.** **Tasks** opens on **Today**. Tap the counts (Overdue, Today, Upcoming, No date) to change the view. **Filters** narrows by project, status, person or tag. **View** switches between List, Board, Timeline and Calendar.
3. **Tick it.** The checkbox changes one character in the file. After every change Plainfile shows the exact before and after lines.
4. **Write a note.** **+ New → Quick note**, type, and it saves on its own. Type `[[` to link to another note, `#` for a tag, `@` for a person, `/table` for a table.
5. **Start today's journal.** **Home → Start today's journal**. Come back to old days from **Journal** under **More**.

## 4. Finding your way around

- **Go to…** (top bar) jumps to any note, task or screen by typing a few letters.
- **Home**: what needs you today. **Tasks**: every task in every project. **Projects**: one page per project. **Notes**: the editor, with all your notes in a list. **Calendar**: tasks and dated notes by day. **Search**: words, plus filters like `tag:launch` or `due:today`.
- **More** holds Journal, People, Insight and Vault health.
- **?** opens the cheat sheet of keys and search filters. **What is new** in the footer lists changes by version.
- On a phone the header becomes a bar at the bottom, and the filters open as a panel from the left.

## 5. Things worth knowing

- **The folder is the whole thing.** Open it in any editor, sync it with anything, delete Plainfile and every file still opens. The index Plainfile builds is only a cache and is safe to delete.
- **It never rewrites your files.** Plainfile changes the smallest piece of text it can. If a file changed outside the app since you opened it, you are told instead of it being overwritten.
- **Deleting is a move to Trash.** The note goes to `.plainfile/trash/` and Undo brings it back. Every save also keeps recent history under `.plainfile/history/`.
- **Other people's syntax works.** `due:2026-11-23`, `📅 2026-11-23` (Obsidian Tasks), `[due:: 2026-11-23]` (Dataview) and `[[wikilinks]]` are all read as they are. See [Task formats](TASK-FORMATS.md).
- **Install it** from the footer to get its own window and an offline copy.

## 6. Where next

- [Features](FEATURES.md): everything it does, by area.
- [Principles and interface design](DESIGN.md): what the app will not do and why.
- The sample vault (**Try the sample vault**) shows a finished project, a person, a journal and a few notes to copy from.
