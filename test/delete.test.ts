import { describe, expect, it } from 'vitest';
import { TRASH_DIR, deleteNote, listTrash, parseTrashName, planDelete, purgeTrashItem, restoreNote, trashName } from '../src/delete';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';

const STAMP = '2026-11-21T04-12-00';

async function setup(files: Record<string, string>) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}
const paths = async (s: MemoryStorage) => (await s.list()).map((f) => f.path).sort();

const VAULT = {
  'projects/site/kickoff.md': '---\ntitle: Kickoff\n---\n- [ ] Send files\n- [x] Done thing\n',
  'projects/site/index.md': '---\ntitle: Site\ntype: project\nactive: true\n---\nSee [[kickoff]].\n',
  'journal/day.md': 'Notes on [[kickoff]] and [[Kickoff]].\n',
  'other.md': 'unrelated',
};

describe('planDelete', () => {
  it('says what links here, how many open tasks go with it, and where the copy would go', async () => {
    const { index } = await setup(VAULT);
    const p = planDelete(index, 'projects/site/kickoff.md', STAMP);
    expect(p.title).toBe('Kickoff');
    expect(p.linkedFrom.map((l) => `${l.path}:${l.line}`).sort()).toEqual(['journal/day.md:1', 'projects/site/index.md:6']);
    expect(p.openTasks).toBe(1);
    expect(p.isProjectIndex).toBe(false);
    expect(p.trashPath).toBe(`${TRASH_DIR}/${STAMP}__projects%2Fsite%2Fkickoff.md`);
    expect(planDelete(index, 'projects/site/index.md', STAMP).isProjectIndex).toBe(true);
    expect(() => planDelete(index, 'nope.md', STAMP)).toThrow('No such note');
  });
});

describe('deleteNote', () => {
  it('moves the note to the trash with its content intact, and the index forgets it', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planDelete(index, 'other.md', STAMP);
    const r = await deleteNote(store, index, plan, { trash: true });
    expect(r.trashedTo).toBe(plan.trashPath);
    expect(await store.read(plan.trashPath)).toBe('unrelated');
    expect(await paths(store)).not.toContain('other.md');
    expect(index.notes.has('other.md')).toBe(false);
    // The trash is a hidden folder, so it is not part of the vault.
    expect(index.files.has(plan.trashPath)).toBe(false);
  });

  it('can delete permanently, leaving no copy', async () => {
    const { store, index } = await setup(VAULT);
    const r = await deleteNote(store, index, planDelete(index, 'other.md', STAMP), { trash: false });
    expect(r.trashedTo).toBeUndefined();
    expect(await store.listDir(TRASH_DIR)).toEqual([]);
    expect(await paths(store)).not.toContain('other.md');
  });

  it('leaves links pointing nowhere but does not touch the notes that had them', async () => {
    const { store, index } = await setup(VAULT);
    await deleteNote(store, index, planDelete(index, 'projects/site/kickoff.md', STAMP), { trash: true });
    expect(await store.read('journal/day.md')).toBe(VAULT['journal/day.md']);
    expect(await store.read('projects/site/index.md')).toBe(VAULT['projects/site/index.md']);
  });

  it('refuses if the note changed after the app last read it, and touches nothing', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planDelete(index, 'other.md', STAMP);
    store.external('other.md', 'edited elsewhere before the click');
    await expect(deleteNote(store, index, plan, { trash: true })).rejects.toBeInstanceOf(ConflictError);
    expect(await store.read('other.md')).toBe('edited elsewhere before the click');
    expect(await store.listDir(TRASH_DIR)).toEqual([]);
  });

  it('keeps the note, and leaves no stale copy, if it changed while deleting', async () => {
    const { store, index } = await setup(VAULT);
    const plan = planDelete(index, 'other.md', STAMP);
    const real = store.remove.bind(store);
    let first = true;
    store.remove = async (p, m) => {
      if (first && p === 'other.md') {
        first = false;
        store.external(p, 'edited meanwhile');
      }
      return real(p, m);
    };
    await expect(deleteNote(store, index, plan, { trash: true })).rejects.toBeInstanceOf(ConflictError);
    expect(await store.read('other.md')).toBe('edited meanwhile');
    expect(await store.listDir(TRASH_DIR)).toEqual([]);
  });

  it('never overwrites an earlier trash copy of the same note', async () => {
    const { store, index } = await setup({ 'a.md': 'one' });
    await deleteNote(store, index, planDelete(index, 'a.md', STAMP), { trash: true });
    store.external('a.md', 'two');
    await index.scan();
    const r = await deleteNote(store, index, planDelete(index, 'a.md', STAMP), { trash: true });
    expect(r.trashedTo).toMatch(/\(2\)\.md$/);
    expect((await listTrash(store)).length).toBe(2);
  });
});

describe('trash', () => {
  it('reads and writes names that keep the original path', () => {
    expect(parseTrashName(trashName('a b/ç.md', STAMP))).toEqual({ stamp: STAMP, originalPath: 'a b/ç.md' });
    expect(parseTrashName('no-separator')).toBeUndefined();
  });

  it('lists newest first, restores to the original place, and clears the trash entry', async () => {
    const { store, index } = await setup({ 'x/a.md': 'A', 'b.md': 'B' });
    await deleteNote(store, index, planDelete(index, 'x/a.md', '2026-11-21T04-00-00'), { trash: true });
    await deleteNote(store, index, planDelete(index, 'b.md', '2026-11-21T05-00-00'), { trash: true });
    const items = await listTrash(store);
    expect(items.map((i) => i.originalPath)).toEqual(['b.md', 'x/a.md']);
    expect(await restoreNote(store, index, items[1]!)).toBe('x/a.md');
    expect(await store.read('x/a.md')).toBe('A');
    expect(index.notes.has('x/a.md')).toBe(true);
    expect((await listTrash(store)).map((i) => i.originalPath)).toEqual(['b.md']);
  });

  it('restores beside an existing note instead of overwriting it', async () => {
    const { store, index } = await setup({ 'a.md': 'old' });
    await deleteNote(store, index, planDelete(index, 'a.md', STAMP), { trash: true });
    store.external('a.md', 'new note with the same name');
    await index.scan();
    const [item] = await listTrash(store);
    expect(await restoreNote(store, index, item!)).toBe('a (2).md');
    expect(await store.read('a.md')).toBe('new note with the same name');
    expect(await store.read('a (2).md')).toBe('old');
  });

  it('purges one item for good', async () => {
    const { store, index } = await setup({ 'a.md': 'x' });
    await deleteNote(store, index, planDelete(index, 'a.md', STAMP), { trash: true });
    const [item] = await listTrash(store);
    await purgeTrashItem(store, item!);
    expect(await listTrash(store)).toEqual([]);
  });
});
