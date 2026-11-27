import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { parseNote } from '../src/parse';
import { listFollowUps, listProjects, projectContents, projectDashboard } from '../src/projects';

const parse = (text: string, path = 'a.md') => parseNote(path, text, { mtime: 1, size: 0 });

describe('follow-ups and preview (first Notebook app format)', () => {
  it('finds #followup lines, with the tag and bullet removed, and open tasks tagged #followup too; not code, not finished tasks', () => {
    const n = parse(
      '- Confirm oak vs walnut finish with Dana #followup\n#followup Chase legal\n- [ ] A task #followup\n- [x] Done one #followup\n```\n- code #followup\n```\n',
    );
    expect(n.followups).toEqual([
      { line: 1, title: 'Confirm oak vs walnut finish with Dana' },
      { line: 2, title: 'Chase legal' },
      { line: 3, title: 'A task' },
    ]);
    expect(n.tasks).toHaveLength(2); // the follow-up tag does not take a task out of the task list
  });
  it('a task note tagged followup is a follow-up until it is finished (what the one-line quick add makes)', () => {
    const open = parse('---\ntitle: doing things\nstatus: todo\ntags: [followup]\n---\n\n', 'tasks/doing things.md');
    expect(open.fileTask).toBeDefined();
    expect(open.followups).toEqual([{ line: 1, title: 'doing things' }]);
    const done = parse('---\ntitle: doing things\nstatus: done\ntags: [followup]\n---\n\n', 'tasks/doing things.md');
    expect(done.followups).toEqual([]);
    const plain = parse('---\ntitle: x\nstatus: todo\ntags: [other]\n---\n\n', 'tasks/x.md');
    expect(plain.followups).toEqual([]);
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

describe('projectDashboard', () => {
  const FILES = {
    'projects/site/index.md':
      '---\ntitle: Website relaunch\ntype: project\nactive: true\ncreated: 2026-11-01\n---\n## Goal\nLaunch the new site by Dec 8\n\n- [ ] Pick a host @sam due:2026-11-20\n- [x] Buy domain @dana\n- Ask legal about terms #followup\n',
    'projects/site/tasks/Write copy.md': '---\ntitle: Write copy\nstatus: todo\ndue: 2026-11-25\ntags: [launch]\n---\n',
    'projects/site/notes.md': '# Notes\n#launch',
    'meetings/2026-11-17 Kickoff.md': '---\ntitle: Kickoff\nproject: Website relaunch\npeople: [dana, sam]\n---\n- [ ] Send logos @dana\n',
    'elsewhere.md': '---\nproject: other\n---\nNo.',
  };
  it('gathers open tasks, notes, people, tags and follow-ups from the folder and from notes that name the project', async () => {
    const index = await setup(FILES);
    const d = projectDashboard(index, 'projects/site/index.md', '2026-11-21')!;
    expect(d.title).toBe('Website relaunch');
    expect(d.summary).toBe('Launch the new site by Dec 8');
    expect(d.created).toBe('2026-11-01');
    expect(d.open.map((t) => t.title)).toEqual(['Pick a host', 'Write copy', 'Send logos']);
    expect(d.overdue).toBe(1);
    expect(d.done).toBe(1);
    expect(d.total).toBe(4);
    expect(d.notes.map((n) => n.path).sort()).toEqual(['meetings/2026-11-17 Kickoff.md', 'projects/site/notes.md']);
    expect(d.followups.map((f) => f.title)).toEqual(['Ask legal about terms']);
    expect(d.people.map((p) => p.name)).toContain('dana');
    expect(d.people.find((p) => p.name === 'dana')!.count).toBe(3);
    expect(d.tags.map((t) => t.tag)).toContain('launch');
  });
  it('lists no tasks or notes from other projects, and returns nothing for a missing note', async () => {
    const index = await setup(FILES);
    expect(projectDashboard(index, 'elsewhere.md', '2026-11-21')!.total).toBe(0);
    expect(projectDashboard(index, 'nope.md', '2026-11-21')).toBeUndefined();
  });
});

describe('closing out a project', () => {
  async function setup(files: Record<string, string>) {
    const storage = new MemoryStorage(files);
    const index = new VaultIndex(storage);
    await index.scan();
    return { storage, index };
  }

  it('changes only the active and completed lines, and reopening undoes them', async () => {
    const original = '---\ntitle: Site\ntype: project\nactive: true\n# a comment\ntags: [x]\n---\n\nBody stays.\n- [ ] a task\n';
    const { storage, index } = await setup({ 'projects/site/index.md': original });
    const { setProjectActive } = await import('../src/projects');
    const r = await setProjectActive(storage, index, 'projects/site/index.md', false, '2026-11-23');
    expect(r).toMatchObject({ written: true, before: 'active: true', after: 'active: false' });
    expect(await storage.read('projects/site/index.md')).toBe(
      original.replace('active: true\n', 'active: false\n').replace('tags: [x]\n', 'tags: [x]\ncompleted: 2026-11-23\n'),
    );
    expect(index.notes.get('projects/site/index.md')!.frontmatter.active).toBe(false);
    const again = await setProjectActive(storage, index, 'projects/site/index.md', false, '2026-11-23');
    expect(again.written).toBe(false);
    await setProjectActive(storage, index, 'projects/site/index.md', true, '2026-11-24');
    expect(await storage.read('projects/site/index.md')).toBe(original);
  });

  it('keeps CRLF line endings', async () => {
    const original = '---\r\ntitle: Site\r\ntype: project\r\nactive: true\r\n---\r\nBody\r\n';
    const { storage, index } = await setup({ 'p.md': original });
    const { setProjectActive } = await import('../src/projects');
    await setProjectActive(storage, index, 'p.md', false, '2026-11-23');
    expect(await storage.read('p.md')).toBe('---\r\ntitle: Site\r\ntype: project\r\nactive: false\r\ncompleted: 2026-11-23\r\n---\r\nBody\r\n');
    await setProjectActive(storage, index, 'p.md', true, '2026-11-24');
    expect(await storage.read('p.md')).toBe(original);
  });

  it('works on a project note with no active line, and refuses a changed file', async () => {
    const { storage, index } = await setup({ 'p.md': '---\ntitle: P\ntype: project\n---\nBody\n' });
    const { setProjectActive } = await import('../src/projects');
    (storage as unknown as { external(p: string, t: string): void }).external('p.md', '---\ntitle: P\ntype: project\n---\nChanged elsewhere\n');
    await expect(setProjectActive(storage, index, 'p.md', false, '2026-11-23')).resolves.toMatchObject({ written: true });
    expect(await storage.read('p.md')).toBe('---\ntitle: P\ntype: project\nactive: false\ncompleted: 2026-11-23\n---\nChanged elsewhere\n');
  });

  it('keeps open tasks of an archived project in All tasks, and leaves out only its finished ones', async () => {
    const { index } = await setup({
      'projects/old/index.md': '---\ntitle: Old\ntype: project\nactive: false\n---\n- [ ] Old job\n- [x] Old finished\n',
      'projects/new/index.md': '---\ntitle: New\ntype: project\nactive: true\n---\n- [ ] New job\n',
      'tasks/Shared.md': '---\ntitle: Shared\nstatus: todo\nproject: [old, new]\n---\n',
      'tasks/OnlyOld.md': '---\ntitle: Only old\nstatus: todo\nproject: old\n---\n',
      'loose.md': '- [ ] Loose job\n',
    });
    const { hubTasks } = await import('../src/hub');
    const { ALL_PROJECTS } = await import('../src/projects');
    expect(
      hubTasks(index, ALL_PROJECTS)
        .map((t) => t.item.title)
        .sort(),
    ).toEqual(['Loose job', 'New job', 'Old job', 'Only old', 'Shared']);
  });
});

describe('follow-ups across the vault', () => {
  it('lists a quick-added task note tagged followup, so Home and the Tasks Follow-ups view show it', async () => {
    const index = new VaultIndex(
      new MemoryStorage({
        'tasks/doing things.md': '---\ntitle: doing things\nstatus: todo\ntags: [followup]\n---\n\n',
        'tasks/finished.md': '---\ntitle: finished\nstatus: done\ntags: [followup]\n---\n\n',
        'n.md': '- Call back #followup\n',
      }),
    );
    await index.scan();
    expect(listFollowUps(index).map((f) => [f.path, f.line, f.title])).toEqual([
      ['n.md', 1, 'Call back'],
      ['tasks/doing things.md', 1, 'doing things'],
    ]);
  });
});
