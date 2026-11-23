#!/usr/bin/env node
import { fmtDate, localToday } from './dates';
import { brokenCount, checkHealth } from './health';
import { VaultIndex, type TaskItem } from './index';
import { NodeStorage } from './node-storage';
import { search, todayView } from './query';
import { setTaskDone } from './writeback';

const USAGE = `plainfile <command> [--vault <folder>] [--today YYYY-MM-DD]

  today            Overdue, due today, and due this week
  tasks            Every open task
  search <query>   Words plus tag: folder: type: is: due: @name operators
  backlinks <path> Notes that link to a note
  check [--json] [--strict]
                   Vault health: broken links, duplicates, orphans, attachments.
                   --json prints the report as JSON; --strict exits 1 if any link or
                   embed is broken or ambiguous, for use in CI
  scan             What changed since the folder was last read
  done <id>        Tick a task. The id is path:line, as printed by today and tasks
  undo <id>        Untick a task`;

function row(t: TaskItem): string {
  const meta = [t.due ? `due ${fmtDate(t.due)}` : '', ...t.who, ...t.tags.map((x) => `#${x}`)].filter(Boolean).join('  ');
  return `  [${t.done ? 'x' : ' '}] ${t.title}${meta ? '   ' + meta : ''}\n      ${t.id}`;
}

function section(title: string, items: TaskItem[]): void {
  if (!items.length) return;
  console.log(`\n${title}`);
  for (const t of items) console.log(row(t));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    return args.splice(i, 2)[1];
  };
  const bool = (name: string): boolean => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  };
  const json = bool('json');
  const strict = bool('strict');
  const vault = flag('vault') ?? process.cwd();
  const today = flag('today') ?? localToday();
  const [cmd, ...rest] = args;
  if (!cmd || cmd === 'help' || cmd === '--help') return void console.log(USAGE);

  const storage = new NodeStorage(vault);
  const index = new VaultIndex(storage);
  const scan = await index.scan();

  switch (cmd) {
    case 'today': {
      const v = todayView(index.tasks(), today);
      console.log(`Today is ${fmtDate(today)}. ${v.overdue.length + v.today.length + v.thisWeek.length} tasks need attention.`);
      section('Overdue', v.overdue);
      section('Due today', v.today);
      section('This week', v.thisWeek);
      break;
    }
    case 'tasks': {
      const open = index.tasks().filter((t) => !t.done);
      console.log(`${open.length} open tasks across ${new Set(open.map((t) => t.path)).size} files`);
      section('Open', open);
      break;
    }
    case 'search': {
      const hits = search(index, rest.join(' '));
      console.log(`${hits.length} result${hits.length === 1 ? '' : 's'}`);
      for (const h of hits) {
        console.log(h.kind === 'task' ? `  [${h.done ? 'x' : ' '}] ${h.title}   ${h.id}` : `  ${h.title}   ${h.path}`);
        if (h.snippet) console.log(`      ${h.snippet}`);
      }
      break;
    }
    case 'backlinks': {
      const path = rest[0] ?? '';
      const list = index.backlinks(path);
      console.log(`${list.length} link${list.length === 1 ? '' : 's'} to ${path}`);
      for (const b of list) console.log(`  ${b.from}:${b.line}`);
      break;
    }
    case 'check': {
      const r = checkHealth(index);
      if (strict && brokenCount(r)) process.exitCode = 1;
      if (json) {
        console.log(JSON.stringify({ ...r, broken: brokenCount(r) }, null, 2));
        break;
      }
      const block = (title: string, lines: string[]): void => {
        console.log(`\n${title} (${lines.length})`);
        for (const l of lines) console.log(`  ${l}`);
      };
      block(
        'Unresolved links',
        r.unresolved.map((u) => `${u.from}:${u.line}  [[${u.target}]]${u.suggestion ? `  did you mean ${u.suggestion}?` : ''}`),
      );
      block(
        'Ambiguous links',
        r.ambiguous.map((u) => `${u.from}:${u.line}  [[${u.target}]]  matches ${u.candidates.join(', ')}`),
      );
      block(
        'Duplicate names',
        r.duplicates.map((d) => `${d.name}: ${d.paths.join(', ')}`),
      );
      block('Orphan notes', r.orphans);
      block(
        'Missing images and files',
        r.missingEmbeds.map((m) => `${m.from}:${m.line}  ${m.target}`),
      );
      block('Unused attachments', r.unusedAttachments);
      console.log(`\n${r.untyped.length} notes have no type. They work fine as they are.`);
      break;
    }
    case 'scan': {
      console.log(`${index.notes.size} notes, ${index.files.size} files, ${scan.ms} ms`);
      break;
    }
    case 'done':
    case 'undo': {
      const id = rest[0];
      if (!id) throw new Error(`${cmd} needs a task id such as notes/todo.md:12`);
      const r = await setTaskDone(storage, index, id, cmd === 'done', { completedOn: today });
      if (!r.written) console.log('Already in that state. Nothing changed.');
      else
        console.log(
          `${r.path}:${r.line}\n- ${r.before}\n+ ${r.after}${r.also ? `\n${r.path}:${r.also.line}\n${r.also.before ? `- ${r.also.before}\n` : ''}+ ${r.also.after}` : ''}`,
        );
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
