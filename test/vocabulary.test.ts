import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { frontmatterKeys, tagCounts } from '../src/vocabulary';

async function setup(files: Record<string, string>) {
  const index = new VaultIndex(new MemoryStorage(files));
  await index.scan();
  return index;
}

describe('vocabulary', () => {
  it('counts frontmatter keys with sample values, most used first', async () => {
    const index = await setup({
      'a.md': '---\ntitle: A\nstatus: todo\ntags: [x, y]\n---\n',
      'b.md': '---\ntitle: B\nstatus: todo\n---\n',
      'c.md': '---\ntitle: C\nstatus: done\ndue: 2026-12-01\n---\n',
      'd.md': 'no frontmatter',
    });
    const keys = frontmatterKeys(index);
    expect(keys.map((k) => [k.key, k.count])).toEqual([
      ['status', 3],
      ['title', 3],
      ['due', 1],
      ['tags', 1],
    ]);
    expect(keys[0]!.samples).toEqual(['todo', 'done']);
    expect(keys.find((k) => k.key === 'tags')!.samples).toEqual(['[x, y]']);
  });

  it('counts each tag once per note, from frontmatter and from the text', async () => {
    const index = await setup({ 'a.md': '---\ntags: [launch]\n---\nSee #launch and #home', 'b.md': '#launch again' });
    expect(tagCounts(index)).toEqual([
      { tag: 'launch', count: 2 },
      { tag: 'home', count: 1 },
    ]);
  });
});

import { kindForPrompt, linkTargets, matchSuggestions, peopleNames, projectNames, suggestionsFor, tagNames, valueNames } from '../src/vocabulary';
import { bestLinkTarget } from '../src/fixes';

const VAULT = {
  'people/dana.md': '---\ntitle: Dana Ortiz\ntype: person\naliases: [Dana]\n---\n',
  'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\nactive: true\ntags: [launch]\n---\n',
  'projects/site/tasks/a.md': '---\ntitle: A\nstatus: doing\nproject: site\npeople: [Sam Lee]\n---\n',
  'projects/kitchen.md': '---\ntitle: Kitchen\nactive: true\n---\n- [ ] Call @dana @sam\n- [ ] Order #launch\n',
  'x/y.md': '---\ntype: meeting\nattendees: [dana, pat]\ntags: [launch, home]\n---\n',
  'z/y.md': 'second y',
};

describe('suggestions', () => {
  it('knows the people already in the vault, from tasks, frontmatter and person notes', async () => {
    const index = await (async () => {
      const i = new VaultIndex(new MemoryStorage(VAULT));
      await i.scan();
      return i;
    })();
    const names = peopleNames(index).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['dana', 'sam', 'sam-lee', 'pat']));
    expect(names[0]).toBe('dana'); // most mentioned first
  });

  it('knows tags, projects (folder names too), and values already used for type and status', async () => {
    const index = new VaultIndex(new MemoryStorage(VAULT));
    await index.scan();
    expect(tagNames(index)[0]).toEqual({ name: 'launch', count: 3 });
    expect(projectNames(index).map((p) => p.name)).toEqual(expect.arrayContaining(['site', 'kitchen']));
    expect(valueNames(index, 'status').map((s) => s.name)).toEqual(['doing', 'done', 'todo', 'waiting']);
    expect(valueNames(index, 'type').map((s) => s.name)).toEqual(expect.arrayContaining(['meeting', 'person', 'project']));
    expect(suggestionsFor(index, 'tags').length).toBeGreaterThan(0);
  });

  it('offers link targets with the shortest text that reaches them, and aliases too', async () => {
    const index = new VaultIndex(new MemoryStorage(VAULT));
    await index.scan();
    const t = linkTargets(index, 'projects/kitchen.md', (s, p) => bestLinkTarget(index, s, p));
    expect(t.find((x) => x.label === 'Dana Ortiz')).toMatchObject({ insert: 'dana', detail: 'people/dana.md' });
    expect(t.find((x) => x.label === 'Dana')).toMatchObject({ insert: 'Dana', detail: 'alias of Dana Ortiz' });
    // Two notes called y: the folder is needed to tell them apart.
    expect(
      t
        .filter((x) => x.label === 'y')
        .map((x) => x.insert)
        .sort(),
    ).toEqual(['x/y', 'z/y']);
    expect(t.some((x) => x.detail === 'projects/kitchen.md')).toBe(false);
  });

  it('matches what was typed: starts first, then contains, skipping what is already used', () => {
    const opts = [
      { name: 'launch', count: 3 },
      { name: 'later', count: 2 },
      { name: 'relaunch', count: 1 },
      { name: 'home', count: 1 },
    ];
    expect(matchSuggestions(opts, 'la')).toEqual(['launch', 'later', 'relaunch']);
    expect(matchSuggestions(opts, '#LA', ['launch'])).toEqual(['later', 'relaunch']);
    expect(matchSuggestions(opts, '')).toEqual(['launch', 'later', 'relaunch', 'home']);
    expect(matchSuggestions(opts, 'zz')).toEqual([]);
    expect(matchSuggestions(opts, '', [], 2)).toEqual(['launch', 'later']);
  });

  it('guesses what a template prompt wants from its name', () => {
    expect(kindForPrompt('project')).toBe('projects');
    expect(kindForPrompt('attendees')).toBe('people');
    expect(kindForPrompt('Tags')).toBe('tags');
    expect(kindForPrompt('goal')).toBeUndefined();
  });
});

describe('companies', () => {
  it('offers the companies already written in notes, as written, most used first', async () => {
    const { VaultIndex: V } = await import('../src/index');
    const { MemoryStorage } = await import('../src/memory-storage');
    const i = new V(
      new MemoryStorage({
        'people/a.md': '---\ntitle: A\ntype: person\ncompany: Acme Corp\n---\n',
        'people/b.md': '---\ntitle: B\ntype: person\ncompany: Acme Corp\n---\n',
        'people/c.md': '---\ntitle: C\ntype: person\ncompany: BMK\n---\n',
        'x.md': 'no company',
      }),
    );
    await i.scan();
    expect(suggestionsFor(i, 'companies').map((x) => x.name)).toEqual(['Acme Corp', 'BMK']);
    expect(kindForPrompt('company')).toBe('companies');
    expect(kindForPrompt('Organization')).toBe('companies');
  });
});
