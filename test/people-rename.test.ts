import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { buildPeople } from '../src/people';
import { applyPersonRename, planPersonRename, undoPersonRename } from '../src/people-rename';

const TODAY = '2026-11-23';
const FILES: Record<string, string> = {
  'people/Ken Moore.md': '---\ntitle: Ken Moore\ntype: person\naliases: [Kenny]\n---\nRuns the data team. Also @ken-moore appears here.\n',
  'journal/1x1.md':
    '---\ntitle: 1x1\r\npeople: [dana, Ken-Moore, sam] # who\r\nattendees:\r\n  - "@ken-moore"\r\n  - sam\r\n---\r\nTalked to @ken-moore, and @kenny, not @ken-moores.\r\n```\r\n@ken-moore in code stays\r\n```\r\n- [ ] Send @ken-moore the deck due:2026-11-24\r\n',
  'tasks/Call.md': '---\ntitle: Call\nstatus: todo\npeople: ken-moore\nowner: Ken-Moore, dana\n---\n',
  'other.md': 'Nothing about them. @dana only.\n',
  'ref.md': 'See [[Ken Moore]] and [[Kenny]].\n',
};

async function setup(files = FILES) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index, people: buildPeople(index, TODAY) };
}

describe('planPersonRename', () => {
  it('lists every line that names them, in text, tasks and people fields, and nothing else', async () => {
    const { store, index, people } = await setup();
    const plan = await planPersonRename(store, index, people, 'ken-moore', 'Ken Smith');
    expect(plan.error).toBeUndefined();
    expect(plan.token).toBe('Ken-Smith');
    const got = plan.changes.map((c) => `${c.path}:${c.line} ${c.before} => ${c.after}`);
    expect(got).toEqual([
      'journal/1x1.md:3 people: [dana, Ken-Moore, sam] # who => people: [dana, Ken-Smith, sam] # who',
      'journal/1x1.md:5   - "@ken-moore" =>   - "@Ken-Smith"',
      'journal/1x1.md:8 Talked to @ken-moore, and @kenny, not @ken-moores. => Talked to @Ken-Smith, and @Ken-Smith, not @ken-moores.',
      'journal/1x1.md:12 - [ ] Send @ken-moore the deck due:2026-11-24 => - [ ] Send @Ken-Smith the deck due:2026-11-24',
      'people/Ken Moore.md:6 Runs the data team. Also @ken-moore appears here. => Runs the data team. Also @Ken-Smith appears here.',
      'tasks/Call.md:4 people: ken-moore => people: Ken-Smith',
      'tasks/Call.md:5 owner: Ken-Moore, dana => owner: Ken-Smith, dana',
    ]);
    expect(plan.note?.to).toBe('people/Ken Smith.md');
  });

  it('explains a name that is unchanged, empty, or already another person', async () => {
    const { store, index, people } = await setup({ ...FILES, 'people/Dana.md': '---\ntitle: Dana\ntype: person\n---\n' });
    expect((await planPersonRename(store, index, people, 'ken-moore', '  ')).error).toMatch(/Type the new name/);
    expect((await planPersonRename(store, index, people, 'ken-moore', 'Ken Moore')).error).toMatch(/already the name/);
    const join = await planPersonRename(store, index, people, 'ken-moore', 'Dana');
    expect(join.joins).toBe('Dana');
    expect(join.note).toBeUndefined();
  });
});

describe('applyPersonRename', () => {
  it('changes only those lines, keeps CRLF and every other byte, renames the person note and its links', async () => {
    const { store, index, people } = await setup();
    const plan = await planPersonRename(store, index, people, 'ken-moore', 'Ken Smith');
    await applyPersonRename(store, index, plan, { keepAlias: true });

    const journal = await store.read('journal/1x1.md');
    expect(journal).toBe(
      FILES['journal/1x1.md']!.replace('[dana, Ken-Moore, sam]', '[dana, Ken-Smith, sam]')
        .replace('"@ken-moore"', '"@Ken-Smith"')
        .replace('Talked to @ken-moore, and @kenny,', 'Talked to @Ken-Smith, and @Ken-Smith,')
        .replace('Send @ken-moore the deck', 'Send @Ken-Smith the deck'),
    );
    expect(journal).toContain('@ken-moore in code stays'); // a code block is left alone
    expect(await store.read('tasks/Call.md')).toBe('---\ntitle: Call\nstatus: todo\npeople: Ken-Smith\nowner: Ken-Smith, dana\n---\n');
    expect(await store.read('other.md')).toBe(FILES['other.md']);

    // The person note: new file name, new title, the old name kept as an alias, links to it rewritten.
    expect((await store.list()).map((f) => f.path)).not.toContain('people/Ken Moore.md');
    expect(await store.read('people/Ken Smith.md')).toBe(
      '---\ntitle: Ken Smith\ntype: person\naliases: [Kenny, Ken Moore]\n---\nRuns the data team. Also @Ken-Smith appears here.\n',
    );
    expect(await store.read('ref.md')).toBe('See [[Ken Smith]] and [[Kenny]].\n');
  });

  it('shows one person under the new name afterwards', async () => {
    const { store, index, people } = await setup();
    await applyPersonRename(store, index, await planPersonRename(store, index, people, 'ken-moore', 'Ken Smith'), { keepAlias: false });
    const after = buildPeople(index, TODAY);
    expect(after.people.map((p) => p.name)).not.toContain('ken-moore');
    expect(after.people.find((p) => p.name === 'Ken Smith')?.note?.path).toBe('people/Ken Smith.md');
  });

  it('works for a person with no note, and Undo puts the lines back exactly', async () => {
    const files = { 'a.md': 'Ask @betsy-s today.\n', 'b.md': '---\npeople: [betsy-s]\n---\nBody\n', 'c.md': '- [ ] Hi @betsy-s\n' };
    const { store, index, people } = await setup(files);
    const plan = await planPersonRename(store, index, people, 'betsy-s', 'Betsy Stone');
    expect(plan.note).toBeUndefined();
    await applyPersonRename(store, index, plan, { keepAlias: false });
    expect(await store.read('a.md')).toBe('Ask @Betsy-Stone today.\n');
    expect(await store.read('b.md')).toBe('---\npeople: [Betsy-Stone]\n---\nBody\n');
    await undoPersonRename(store, index, plan);
    for (const [p, t] of Object.entries(files)) expect(await store.read(p)).toBe(t);
  });

  it('stops without writing further if a note changed since the preview', async () => {
    const { store, index, people } = await setup({ 'a.md': '@betsy-s\n', 'b.md': '@betsy-s\n' });
    const plan = await planPersonRename(store, index, people, 'betsy-s', 'Betsy Stone');
    await store.write('b.md', '@betsy-s edited elsewhere\n', (await store.stat('b.md')).mtime);
    await expect(applyPersonRename(store, index, plan, { keepAlias: false })).rejects.toThrow();
    expect(await store.read('b.md')).toBe('@betsy-s edited elsewhere\n');
  });
});
