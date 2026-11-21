import { describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { search, todayView } from '../src/query';

const vault = () =>
  new MemoryStorage({
    'projects/a/kickoff.md': '---\ntype: meeting\n---\n- [ ] Send logo @dana due:2026-11-23\nSee [[pricing-research]] and [[Dana]] and [[pricing-reserach]].',
    'projects/a/pricing-research.md': '---\ntags: [pricing]\n---\nCompetitors charge $12.',
    'people/dana.md': '---\naliases: [Dana]\n---\nBrand lead.',
    'projects/a/tasks/copy.md': '---\ntitle: Write copy\nstatus: doing\ndue: 2026-11-24\n---\n',
    'projects/b/index.md': 'dup name',
    'projects/a/index.md': 'dup name',
    '_attachments/used.png': 'x',
    '_attachments/unused.png': 'x',
  });

async function build(store = vault()) {
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}

describe('VaultIndex', () => {
  it('scans notes and keeps non-markdown files for attachment checks', async () => {
    const { index } = await build();
    expect(index.notes.size).toBe(6);
    expect(index.files.has('_attachments/used.png')).toBe(true);
  });

  it('only re-parses files that changed', async () => {
    const { store, index } = await build();
    store.external('people/dana.md', 'Brand lead, updated.');
    const r = await index.scan();
    expect(r.changed).toEqual(['people/dana.md']);
    expect(r.unchanged).toBe(5);
  });

  it('resolves links by name, alias and path, and computes back-links', async () => {
    const { index } = await build();
    expect(index.backlinks('projects/a/pricing-research.md')).toEqual([{ from: 'projects/a/kickoff.md', line: 5 }]);
    expect(index.backlinks('people/dana.md')).toHaveLength(1); // via the alias [[Dana]]
  });

  it('spots a rename made outside the app by content hash, leaving old links unresolved until fixed', async () => {
    const { store, index } = await build();
    store.remove('projects/a/pricing-research.md');
    store.external('projects/a/pricing-analysis.md', '---\ntags: [pricing]\n---\nCompetitors charge $12.');
    const r = await index.scan();
    expect(r.renamed).toEqual([{ from: 'projects/a/pricing-research.md', to: 'projects/a/pricing-analysis.md' }]);
    expect(index.backlinks('projects/a/pricing-analysis.md')).toEqual([]); // link text not yet fixed
  });

  it('merges file tasks and inline tasks in one list', async () => {
    const { index } = await build();
    const tasks = index.tasks();
    expect(tasks.map((t) => t.kind).sort()).toEqual(['file', 'inline']);
    expect(tasks.find((t) => t.kind === 'file')).toMatchObject({ title: 'Write copy', due: '2026-11-24', status: 'doing' });
  });
});

describe('todayView', () => {
  it('groups overdue, today and this week, and leaves out done and undated tasks', async () => {
    const { index } = await build();
    const v = todayView(index.tasks(), '2026-11-23');
    expect(v.today.map((t) => t.title)).toEqual(['Send logo']);
    expect(v.thisWeek.map((t) => t.title)).toEqual(['Write copy']);
    expect(todayView(index.tasks(), '2026-11-25').overdue).toHaveLength(2);
  });
});

describe('search', () => {
  it('combines words and operators across notes and tasks', async () => {
    const { index } = await build();
    expect(search(index, 'pricing').map((h) => h.path)).toContain('projects/a/pricing-research.md');
    expect(search(index, 'is:task due:<2026-11-24').map((h) => h.title)).toEqual(['Send logo']);
    expect(search(index, 'tag:pricing').map((h) => h.kind)).toEqual(['note']);
    expect(search(index, 'folder:people').map((h) => h.path)).toEqual(['people/dana.md']);
    expect(search(index, '@dana is:open').map((h) => h.title)).toEqual(['Send logo']);
  });
});

describe('checkHealth', () => {
  it('reports unresolved links with a suggestion, duplicates and unused attachments', async () => {
    const { index } = await build();
    const r = checkHealth(index);
    expect(r.unresolved).toEqual([{ from: 'projects/a/kickoff.md', line: 5, target: 'pricing-reserach', suggestion: 'pricing-research' }]);
    expect(r.duplicates).toEqual([{ name: 'index', paths: ['projects/a/index.md', 'projects/b/index.md'] }]);
    expect(r.unusedAttachments).toEqual(['_attachments/unused.png', '_attachments/used.png']);
  });
});
