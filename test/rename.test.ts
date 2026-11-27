import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { applyOutsideRename, applyRename, nameForTitle, planOutsideRename, planRename } from '../src/rename';
import { ConflictError } from '../src/storage';
import { StaleError } from '../src/writeback';

async function setup(files: Record<string, string>) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}
const all = (plan: { edits: { id: string }[] }) => ({ include: new Set(plan.edits.map((e) => e.id)), keepAlias: true });

const VAULT = {
  'projects/a/pricing-research.md': '---\ntitle: Pricing research\n---\nBody. See [[pricing-research]] itself.\n',
  'projects/a/kickoff.md': 'Line one\r\nSee also [[pricing-research]] and [[people/dana]].\r\nTail',
  'journal/day.md': 'Read [[pricing-research|the research]] and [text](../projects/a/pricing-research.md#top) today.\n',
  'index.md': '- [[projects/a/pricing-research]]\n- [[Pricing research]] by title stays\n',
  'people/dana.md': 'Dana',
};

describe('planRename', () => {
  it('finds every link that uses the old name or path, in wiki and markdown form', async () => {
    const { index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    expect(plan.to).toBe('projects/a/pricing-analysis.md');
    expect(plan.edits.map((e) => `${e.path}:${e.line}`).sort()).toEqual([
      'index.md:1',
      'journal/day.md:1',
      'projects/a/kickoff.md:2',
      'projects/a/pricing-research.md:4',
    ]);
    const day = plan.edits.find((e) => e.path === 'journal/day.md')!;
    expect(day.after).toBe('Read [[pricing-analysis|the research]] and [text](../projects/a/pricing-analysis.md#top) today.');
    expect(plan.edits.find((e) => e.path === 'index.md')!.after).toBe('- [[projects/a/pricing-analysis]]');
  });

  it('leaves links that reach the note by its title alone', async () => {
    const { index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    expect(plan.edits.find((e) => e.path === 'index.md')!.after).not.toContain('Pricing research');
    // the title link on line 2 of index.md still resolves, so it is not an edit of its own
    expect(plan.edits.filter((e) => e.path === 'index.md')).toHaveLength(1);
  });

  it('rejects empty, unchanged and taken names', async () => {
    const { index } = await setup(VAULT);
    expect(() => planRename(index, 'people/dana.md', '  ')).toThrow('Type a new name');
    expect(() => planRename(index, 'people/dana.md', 'dana')).toThrow('current name');
    expect(() => planRename(index, 'projects/a/pricing-research.md', 'kickoff')).toThrow('already exists');
  });

  it('uses the folder path in updated links when another note already has the new name', async () => {
    const { index } = await setup({ 'a/old.md': '', 'b/new.md': '', 'src.md': 'See [[old]]' });
    const plan = planRename(index, 'a/old.md', 'new');
    expect(plan.nameClash).toBe(true);
    expect(plan.edits[0]!.after).toBe('See [[a/new]]');
  });
});

describe('applyRename', () => {
  it('creates the new file, rewrites links, adds an alias, removes the old file, and touches nothing else', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    const r = await applyRename(store, index, plan, all(plan));
    expect(r.to).toBe('projects/a/pricing-analysis.md');

    const files = (await store.list()).map((f) => f.path);
    expect(files).not.toContain('projects/a/pricing-research.md');
    expect(await store.read('projects/a/pricing-analysis.md')).toBe(
      '---\ntitle: Pricing research\naliases: [pricing-research]\n---\nBody. See [[pricing-analysis]] itself.\n',
    );
    expect(await store.read('projects/a/kickoff.md')).toBe('Line one\r\nSee also [[pricing-analysis]] and [[people/dana]].\r\nTail');
    expect(await store.read('journal/day.md')).toBe('Read [[pricing-analysis|the research]] and [text](../projects/a/pricing-analysis.md#top) today.\n');
    expect(await store.read('index.md')).toBe('- [[projects/a/pricing-analysis]]\n- [[Pricing research]] by title stays\n');
    expect(await store.read('people/dana.md')).toBe('Dana');
    expect([...new Set(index.backlinks('projects/a/pricing-analysis.md').map((b) => b.from))].sort()).toEqual([
      'index.md',
      'journal/day.md',
      'projects/a/kickoff.md',
    ]);
  });

  it('leaves unchecked links alone, and the alias keeps them working', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    const include = new Set(plan.edits.filter((e) => e.path !== 'journal/day.md').map((e) => e.id));
    await applyRename(store, index, plan, { include, keepAlias: true });
    expect(await store.read('journal/day.md')).toContain('[[pricing-research|the research]]');
    expect(index.backlinks('projects/a/pricing-analysis.md').map((b) => b.from)).toContain('journal/day.md');
  });

  it('without the alias, unchecked links become unresolved', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    await applyRename(store, index, plan, { include: new Set(), keepAlias: false });
    // only the link by title still reaches it; the links by the old name no longer do
    expect(index.backlinks('projects/a/pricing-analysis.md').map((b) => `${b.from}:${b.line}`)).toEqual(['index.md:2']);
    expect(await store.read('projects/a/pricing-analysis.md')).not.toContain('aliases');
  });

  it('refuses if a linking file changed since the preview, and keeps both files', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planRename(index, 'projects/a/pricing-research.md', 'pricing-analysis');
    store.external('journal/day.md', 'Someone edited this line');
    await expect(applyRename(store, index, plan, all(plan))).rejects.toBeInstanceOf(StaleError);
    const files = (await store.list()).map((f) => f.path);
    expect(files).toContain('projects/a/pricing-research.md');
    expect(files).toContain('projects/a/pricing-analysis.md');
    expect(await store.read('journal/day.md')).toBe('Someone edited this line');
  });

  it('keeps the old file if it changed while renaming', async () => {
    const { store, index } = await setup({ 'old.md': 'x', 'a.md': 'See [[old]]' });
    const plan = planRename(index, 'old.md', 'new');
    const real = store.remove.bind(store);
    store.remove = async (p, m) => {
      store.external(p, 'changed meanwhile');
      return real(p, m);
    };
    await expect(applyRename(store, index, plan, all(plan))).rejects.toBeInstanceOf(ConflictError);
    expect(await store.read('old.md')).toBe('changed meanwhile');
  });
});

describe('renamed outside the app', () => {
  it('finds the now-broken links and points them at the new file', async () => {
    const { store, index } = await setup({
      'notes/old-name.md': 'Same text',
      'a.md': 'See [[old-name]] and [x](notes/old-name.md).\n',
      'b.md': 'Unrelated [[other]]',
    });
    store.externalRemove('notes/old-name.md');
    store.external('notes/new-name.md', 'Same text');
    const scan = await index.scan();
    expect(scan.renamed).toEqual([{ from: 'notes/old-name.md', to: 'notes/new-name.md' }]);

    const plan = planOutsideRename(index, 'notes/old-name.md', 'notes/new-name.md');
    expect(plan.edits).toHaveLength(1);
    expect(plan.edits[0]!.after).toBe('See [[new-name]] and [x](notes/new-name.md).');
    await applyOutsideRename(store, index, plan, all(plan));
    expect(await store.read('a.md')).toBe('See [[new-name]] and [x](notes/new-name.md).\n');
    expect(await store.read('notes/new-name.md')).toBe('---\naliases: [old-name]\n---\nSame text');
    expect(await store.read('b.md')).toBe('Unrelated [[other]]');
    expect(index.backlinks('notes/new-name.md')).toHaveLength(2); // the wiki link and the markdown link on that line
  });
});

describe('nameForTitle: when the file name and the title disagree', () => {
  const note = (title: string | undefined, name: string) => ({ title: title ?? name, name, frontmatter: title === undefined ? {} : { title } });
  it('suggests a file name from the title only when they say different things', () => {
    expect(nameForTitle(note('1234567', '1'))).toBe('1234567');
    expect(nameForTitle(note('Pricing: draft / v2', 'notes'))).toBe('Pricing- draft - v2');
  });
  it('says nothing when they match in spirit (case, spaces, hyphens), when there is no written title, or for a project index', () => {
    expect(nameForTitle(note('Pricing research', 'pricing-research'))).toBeUndefined();
    expect(nameForTitle(note('2026-11-26 09:22', '2026-11-26 0922'))).toBeUndefined();
    expect(nameForTitle(note(undefined, 'whatever'))).toBeUndefined();
    expect(nameForTitle(note('Website', 'index'))).toBeUndefined();
  });
});
