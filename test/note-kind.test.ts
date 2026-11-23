import { describe, expect, it } from 'vitest';
import { noteKind } from '../src/note-kind';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

describe('noteKind', () => {
  it('tells projects, people, tasks, meetings, journals and plain notes apart, by type, fields or folder', async () => {
    const index = new VaultIndex(
      new MemoryStorage({
        'projects/site/index.md': '---\ntitle: Site\ntype: project\nactive: true\n---\n',
        'old/Notebook project.md': '---\ntitle: Old\nactive: true\nsortOrder: 1\n---\n',
        'people/Ken Moore.md': '---\ntitle: Ken Moore\n---\n',
        'crm/Dana.md': '---\ntitle: Dana\ntype: person\n---\n',
        'tasks/Call.md': '---\ntitle: Call\nstatus: todo\n---\n',
        'x/Typed task.md': '---\ntitle: Typed task\ntype: task\nstatus: todo\n---\n',
        'meetings/Kickoff.md': '---\ntitle: Kickoff\ntype: meeting\n---\n',
        'journal/2026-11-23.md': '---\ntitle: 2026-11-23\n---\n',
        'daily.md': '---\ntitle: Daily\ntype: journal\n---\n',
        'ideas/Brand.md': '---\ntitle: Brand\n---\nText\n',
        'bare.md': 'no frontmatter\n',
      }),
    );
    await index.scan();
    const k = (p: string) => noteKind(index.notes.get(p)!);
    expect(k('projects/site/index.md')).toBe('project');
    expect(k('old/Notebook project.md')).toBe('project');
    expect(k('people/Ken Moore.md')).toBe('person');
    expect(k('crm/Dana.md')).toBe('person');
    expect(k('tasks/Call.md')).toBe('task');
    expect(k('x/Typed task.md')).toBe('task');
    expect(k('meetings/Kickoff.md')).toBe('meeting');
    expect(k('journal/2026-11-23.md')).toBe('journal');
    expect(k('daily.md')).toBe('journal');
    expect(k('ideas/Brand.md')).toBe('note');
    expect(k('bare.md')).toBe('note');
  });
});
