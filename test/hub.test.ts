import { describe, expect, it } from 'vitest';
import { applyFix, fieldIssues, normalizeDate, normalizeStatus, applyFieldFix } from '../src/fields';
import { applyFilters, groupTasks, hubTasks, NO_FILTERS, summarize } from '../src/hub';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

const TODAY = '2026-11-21';
const FILES: Record<string, string> = {
  'projects/site/index.md':
    '---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n## Goal\nLaunch\n## Phase 1\n- [ ] Pick a host @sam due:2026-11-20\n- [x] Buy domain @dana\n## Phase 2\n- [ ] Write copy @dana #launch due:2026-11-23\n- [ ] Waiting for legal #waiting\n## Tasks\n- [ ] Loose task\n',
  'projects/site/tasks/Logo.md': '---\ntitle: Logo\nstatus: doing\ndue: 2026-11-25\nphase: Phase 1\npeople: [Dana]\ntags: [brand]\n---\n',
  'projects/site/tasks/Old.md': '---\ntitle: Old one\nstatus: Done\n---\n',
  'meetings/Kickoff.md': '---\ntitle: Kickoff\nproject: site\n---\n- [ ] Send notes @pat due:2026-12-30\n',
  'other.md': '- [ ] Not ours',
};
async function setup(files = FILES) {
  const index = new VaultIndex(new MemoryStorage(files));
  await index.scan();
  return index;
}

describe('field normalisation', () => {
  it('reads many spellings of a status and a date, and says no to the rest', () => {
    expect(normalizeStatus('In Progress')).toBe('doing');
    expect(normalizeStatus(' DONE ')).toBe('done');
    expect(normalizeStatus('blocked')).toBe('waiting');
    expect(normalizeStatus('banana')).toBeUndefined();
    expect(normalizeStatus(undefined)).toBeUndefined();
    expect(normalizeDate('2026-11-23')).toBe('2026-11-23');
    expect(normalizeDate('2026-11-23T10:00:00Z')).toBe('2026-11-23');
    expect(normalizeDate('Nov 23 2026')).toBe('2026-11-23');
    expect(normalizeDate('soon')).toBeUndefined();
    expect(normalizeDate('')).toBeUndefined();
  });
});

describe('hubTasks', () => {
  it("collects the project's tasks from its folder and from notes naming it, with phases from headings or frontmatter", async () => {
    const tasks = await hubTasks(await setup(), 'projects/site/index.md');
    const t = (title: string) => tasks.find((x) => x.item.title === title)!;
    expect(tasks.map((x) => x.item.title).sort()).toEqual([
      'Buy domain',
      'Logo',
      'Loose task',
      'Old one',
      'Pick a host',
      'Send notes',
      'Waiting for legal',
      'Write copy',
    ]);
    expect(t('Pick a host')).toMatchObject({ phase: 'Phase 1', status: 'todo', people: ['sam'], due: '2026-11-20' });
    expect(t('Write copy')).toMatchObject({ phase: 'Phase 2', tags: ['launch'] });
    expect(t('Waiting for legal').status).toBe('waiting');
    expect(t('Loose task').phase).toBeUndefined(); // under a generic "Tasks" heading
    expect(t('Logo')).toMatchObject({ phase: 'Phase 1', status: 'doing', people: ['dana'] });
    expect(t('Old one').status).toBe('done'); // "Done" is read as done
    expect(t('Send notes').phase).toBeUndefined();
  });

  it('filters by person, tag, status, date and text, and hides done by default', async () => {
    const all = await hubTasks(await setup(), 'projects/site/index.md');
    const f = (p: object) =>
      applyFilters(all, { ...NO_FILTERS, ...p }, undefined, TODAY)
        .map((t) => t.item.title)
        .sort();
    expect(f({})).not.toContain('Buy domain');
    expect(f({ hideDone: false })).toContain('Buy domain');
    expect(f({ people: ['dana'] })).toEqual(['Logo', 'Write copy']);
    expect(f({ tags: ['launch'] })).toEqual(['Write copy']);
    expect(f({ statuses: ['doing', 'waiting'] })).toEqual(['Logo', 'Waiting for legal']);
    expect(f({ due: 'overdue' })).toEqual(['Pick a host']);
    expect(f({ due: 'week' })).toEqual(['Logo', 'Write copy']);
    expect(f({ due: 'none' })).toEqual(['Loose task', 'Waiting for legal']);
    expect(f({ phases: ['Phase 2'] })).toEqual(['Waiting for legal', 'Write copy']);
    expect(f({ text: 'LOGO' })).toEqual(['Logo']);
    expect(f({ text: 'sam' })).toEqual(['Pick a host']);
  });

  it('groups by due, status, person, phase and note, with counts', async () => {
    const all = await hubTasks(await setup(), 'projects/site/index.md');
    const g = (by: Parameters<typeof groupTasks>[1]) => groupTasks(all, by, TODAY).map((x) => `${x.title}:${x.items.length}`);
    expect(g('due')).toEqual(['Overdue:1', 'This week:2', 'Later:1', 'No date:2', 'Done:2']);
    expect(g('status')).toEqual(['To do:4', 'Doing:1', 'Waiting:1', 'Done:2']);
    expect(g('person')).toEqual(['@dana:3', '@pat:1', '@sam:1', 'Unassigned:3']);
    expect(g('phase')).toEqual(['Phase 1:3', 'Phase 2:2', 'No phase:3']);
    expect(groupTasks(all, 'due', TODAY).find((x) => x.key === 'overdue')?.late).toBe(true);
    expect(groupTasks(all, 'phase', TODAY)[0]).toMatchObject({ total: 3, done: 1 });
  });

  it('summarises progress, phases, who has what and what is next', async () => {
    const all = await hubTasks(await setup(), 'projects/site/index.md');
    const s = summarize(all, TODAY, Date.now());
    expect(s).toMatchObject({ total: 8, done: 2, open: 6, overdue: 1 });
    expect(s.phases.map((p) => `${p.name} ${p.done}/${p.total}`)).toEqual(['Phase 1 1/3', 'Phase 2 0/2', 'No phase 1/3']);
    expect(s.people[0]).toEqual({ name: '', open: 2 });
    expect(s.next.map((t) => t.item.title)).toEqual(['Pick a host', 'Write copy', 'Logo']);
    expect(s.weekly).toHaveLength(6);
  });

  it('copes with a project that has no tasks and notes with none of the fields', async () => {
    const index = await setup({ 'p/index.md': '---\ntype: project\n---\nJust text', 'p/plain.md': 'no frontmatter at all' });
    const all = hubTasks(index, 'p/index.md');
    expect(all).toEqual([]);
    expect(groupTasks(all, 'due', TODAY)).toEqual([]);
    expect(summarize(all, TODAY, Date.now())).toMatchObject({ total: 0, open: 0, phases: [] });
  });
});

describe('tidying frontmatter', () => {
  const MESSY: Record<string, string> = {
    'projects/site/index.md': FILES['projects/site/index.md']!,
    'projects/site/tasks/a.md': '---\ntitle: A\nstatus: In Progress\n---\n',
    'projects/site/tasks/b.md': '---\ntitle: B\nstatus: banana\n---\n',
    'projects/site/tasks/c.md': '---\ntitle: C\nstatus: todo\ndeadline: Nov 23 2026\nmilestone: Beta\nowner: Dana\n---\n',
    'projects/site/tasks/d.md': '---\ntitle: D\n---\nno status yet\n',
    'projects/site/tasks/e.md': '---\ntitle: E\nstatus: todo\ndue: whenever\nproject: sitee\n---\n',
  };

  it('finds what differs from the standard and offers a fix only where it is safe', async () => {
    const index = await setup(MESSY);
    const issues = fieldIssues(index, [...index.notes.values()]);
    const by = (path: string) =>
      issues
        .filter((i) => i.path === `projects/site/tasks/${path}.md`)
        .map((i) => `${i.kind}${i.fix ? '+fix' : ''}`)
        .sort();
    expect(by('a')).toEqual(['status-value+fix']);
    expect(by('b')).toEqual(['unknown-status+fix']);
    expect(by('c')).toEqual(['alias-key+fix', 'alias-key+fix', 'alias-key+fix']);
    expect(by('d')).toEqual(['missing-status+fix']);
    expect(by('e')).toEqual(['project-name', 'unreadable-due']);
  });

  it('fixes change only the one key, byte for byte, and remove the alias', async () => {
    const store = new MemoryStorage(MESSY);
    const index = new VaultIndex(store);
    await index.scan();
    const issues = fieldIssues(index, [...index.notes.values()]);
    for (const i of issues.filter((x) => x.fix && x.path.endsWith('/a.md'))) await applyFieldFix(store, index, i);
    expect(await store.read('projects/site/tasks/a.md')).toBe('---\ntitle: A\nstatus: doing\n---\n');
    for (const i of issues.filter((x) => x.fix && x.path.endsWith('/c.md'))) await applyFieldFix(store, index, i);
    const c = await store.read('projects/site/tasks/c.md');
    expect(c).toContain('due: 2026-11-23');
    expect(c).toContain('phase: Beta');
    expect(c).toContain('people: Dana');
    expect(c).not.toContain('deadline');
    expect(c).not.toContain('milestone');
    expect(c).not.toContain('owner');
    expect(applyFix('---\ntitle: X\n---\nB', { key: 'status', value: 'todo', before: '', after: '' })).toBe('---\ntitle: X\nstatus: todo\n---\nB');
  });

  it('a clean vault has nothing to tidy', async () => {
    const index = await setup();
    expect(fieldIssues(index, [...index.notes.values()]).filter((i) => i.path.includes('/tasks/Logo'))).toEqual([]);
  });
});

describe('portfolio', () => {
  it('has one row per project with progress, open, overdue, next due and last change', async () => {
    const { portfolio } = await import('../src/hub');
    const index = await setup({
      ...FILES,
      'projects/kitchen/index.md': '---\ntitle: Kitchen\ntype: project\nactive: true\nsortOrder: 2\n---\n- [x] Order sink\n- [ ] Pick tiles due:2026-12-01\n',
    });
    const rows = portfolio(index, TODAY);
    const site = rows.find((r) => r.project.title === 'Website')!;
    const kitchen = rows.find((r) => r.project.title === 'Kitchen')!;
    expect(site).toMatchObject({ total: 8, done: 2, open: 6, overdue: 1, nextDue: '2026-11-20' });
    expect(kitchen).toMatchObject({ total: 2, done: 1, open: 1, overdue: 0, nextDue: '2026-12-01' });
    expect(site.lastChange).toBeGreaterThan(0);
  });
});

describe('all tasks across projects', () => {
  it('covers every note and can group by project, with several projects and none', async () => {
    const { VaultIndex } = await import('../src/index');
    const { MemoryStorage } = await import('../src/memory-storage');
    const { ALL_PROJECTS } = await import('../src/projects');
    const store = new MemoryStorage({
      'projects/a/index.md': '---\ntitle: A\ntype: project\n---\n- [ ] In A\n',
      'projects/b/index.md': '---\ntitle: B\ntype: project\n---\n',
      'tasks/Shared.md': '---\ntitle: Shared\nstatus: todo\nproject: [a, b]\n---\n',
      'loose.md': '- [ ] Nowhere\n',
    });
    const index = new VaultIndex(store);
    await index.scan();
    const all = hubTasks(index, ALL_PROJECTS);
    expect(all.map((t) => t.item.title).sort()).toEqual(['In A', 'Nowhere', 'Shared']);
    const groups = groupTasks(all, 'project', '2026-11-23');
    const by = Object.fromEntries(groups.map((g) => [g.title, g.items.map((t) => t.item.title).sort()]));
    expect(by['B']).toEqual(['Shared']);
    expect(by['A']).toEqual(['In A', 'Shared']); // by folder or by project:
    expect(by['No project']).toEqual(['Nowhere']);
  });
});
