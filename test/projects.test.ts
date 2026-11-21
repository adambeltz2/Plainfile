import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { parseNote } from '../src/parse';
import { listFollowUps, listProjects, projectContents } from '../src/projects';

const parse = (text: string) => parseNote('a.md', text, { mtime: 1, size: 0 });

describe('follow-ups and preview (first Notebook app format)', () => {
  it('finds #followup lines that are not checkboxes, with the tag and bullet removed', () => {
    const n = parse('- Confirm oak vs walnut finish with Dana #followup\n#followup Chase legal\n- [ ] A task #followup\n```\n- code #followup\n```\n');
    expect(n.followups).toEqual([
      { line: 1, title: 'Confirm oak vs walnut finish with Dana' },
      { line: 2, title: 'Chase legal' },
    ]);
    expect(n.tasks).toHaveLength(1);
  });
  it('writes the preview as plain words, without images, links or emphasis', () => {
    const n = parse('![logo](a/b.png)\n\n- See [[kickoff-call]] and [[pricing|Pricing notes]] and [site](https://x.com), **bold** `code`');
    expect(n.preview).toBe('See kickoff-call and Pricing notes and site, bold code');
  });
  it('previews the first two non-heading lines', () => {
    const n = parse('---\ntitle: x\n---\n# Heading\n\nCabinet quote came in.\n- Second line\n\n- [ ] a task\nThird');
    expect(n.preview).toBe('Cabinet quote came in. Second line');
  });
});

async function setup(files: Record<string, string>) {
  const index = new VaultIndex(new MemoryStorage(files));
  await index.scan();
  return index;
}

describe('listProjects', () => {
  it('numbers active projects by sortOrder and keeps inactive ones last and unnumbered', async () => {
    const index = await setup({
      'kitchen.md': '---\ntitle: Kitchen Remodel\nactive: true\nsortOrder: 2\n---\nQuote came in.\n- [ ] Order sample\n- Confirm finish #followup\n',
      'taxes.md': '---\ntitle: Taxes\nactive: true\nsortOrder: 1\n---\nMissing 1099.\n',
      'old.md': '---\ntitle: Old thing\nactive: false\nsortOrder: 0\n---\n',
      'plain.md': 'not a project',
    });
    const ps = listProjects(index);
    expect(ps.map((p) => [p.title, p.number, p.active])).toEqual([
      ['Taxes', 1, true],
      ['Kitchen Remodel', 2, true],
      ['Old thing', undefined, false],
    ]);
    const kitchen = ps.find((p) => p.title === 'Kitchen Remodel')!;
    expect(kitchen).toMatchObject({ openTasks: 1, followups: 1, preview: 'Quote came in.' });
  });

  it('a folder index.md covers every note in the folder, and type: project counts', async () => {
    const index = await setup({
      'site/index.md': '---\ntype: project\n---\nHome\n',
      'site/a.md': '- [ ] One\n- Follow #followup',
      'site/tasks/b.md': '---\nstatus: todo\n---\n',
      'other/c.md': '- [ ] Elsewhere',
    });
    const [p] = listProjects(index);
    expect(p).toMatchObject({ path: 'site/index.md', number: 1, openTasks: 2, followups: 1 });
  });

  it('lists follow-ups with the note they are in', async () => {
    const index = await setup({ 'a.md': '# Alpha\n- Call back #followup', 'b.md': '- Other #followup' });
    expect(listFollowUps(index)).toEqual([
      { path: 'a.md', line: 2, title: 'Call back', from: 'Alpha' },
      { path: 'b.md', line: 1, title: 'Other', from: 'b' },
    ]);
  });
});

describe('projectContents', () => {
  it('lists the notes and open tasks that belong to a folder project', async () => {
    const index = await setup({
      'site/index.md': '---\ntype: project\n---\n- [ ] Home task',
      'site/notes.md': 'A note\n- [ ] Note task\n- [x] Done task',
      'site/tasks/a.md': '---\ntitle: A\nstatus: todo\n---\n',
      'site/tasks/b.md': '---\ntitle: B\nstatus: done\n---\n',
      'other/x.md': '- [ ] Elsewhere',
    });
    const c = projectContents(index, 'site/index.md');
    expect(c.notes.map((n) => n.path)).toEqual(['site/notes.md', 'site/tasks/a.md', 'site/tasks/b.md']);
    expect(c.tasks.map((t) => t.title).sort()).toEqual(['A', 'Home task', 'Note task']);
  });
});
