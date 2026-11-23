import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { graphAround, hubs, layoutRadial, linksOf, relatedByPlace, relatedByTags, relatedByText, relatedNotLinked, unlinkedMentions } from '../src/related';

async function setup(files: Record<string, string>) {
  const index = new VaultIndex(new MemoryStorage(files));
  await index.scan();
  return index;
}

const VAULT = {
  'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\ntags: [launch]\n---\nSee [[kickoff]] and [[pricing-research]].\n',
  'projects/site/kickoff.md':
    '---\ntitle: Kickoff call\ntags: [launch, meeting]\nproject: site\n---\nDana agreed the pricing page copy and the launch date.\nBack to [[Website relaunch]].\n',
  'projects/site/pricing-research.md':
    '---\ntitle: Pricing research\ntags: [launch, pricing]\nproject: site\n---\nCompetitor pricing tiers and per seat pricing for the pricing page.\n',
  'reference/pricing-psychology.md':
    '---\ntags: [pricing, reading]\n---\n# Pricing psychology\nAnchoring and decoy pricing make tiers look sensible on a pricing page.\n',
  'people/dana.md': '---\ntitle: Dana Ortiz\naliases: [Dana]\n---\nBrand lead at Northfield.\n',
  'journal/day.md': 'Spoke with Dana Ortiz about the Website relaunch today.\n```\nDana Ortiz in code is ignored\n```\n',
  'misc/cooking.md': '---\ntags: [food]\n---\nA recipe for tomato soup with basil.\n',
};

describe('linksOf', () => {
  it('gives links out and in with the line they are on, plus broken links', async () => {
    const index = await setup({ ...VAULT, 'projects/site/broken.md': 'See [[nope]] and [[kickoff]].' });
    const l = linksOf(index, 'projects/site/kickoff.md');
    expect(l.out).toEqual([{ path: 'projects/site/index.md', title: 'Website relaunch', line: 7, context: 'Back to [[Website relaunch]].' }]);
    expect(l.in.map((r) => r.path).sort()).toEqual(['projects/site/broken.md', 'projects/site/index.md']);
    expect(linksOf(index, 'projects/site/broken.md').broken).toEqual([{ target: 'nope', line: 1, context: 'See [[nope]] and [[kickoff]].' }]);
  });
});

describe('relatedByTags', () => {
  it('ranks notes sharing rarer tags higher and explains why', async () => {
    const index = await setup(VAULT);
    const r = relatedByTags(index, 'projects/site/pricing-research.md');
    // The rarer shared tag ranks first; notes tied on score are ordered by title.
    expect(r.map((x) => x.path)).toEqual(['reference/pricing-psychology.md', 'projects/site/kickoff.md', 'projects/site/index.md']);
    expect(r[0]!.why).toEqual(['#pricing']);
    expect(r.some((x) => x.path === 'misc/cooking.md')).toBe(false);
  });
});

describe('relatedByPlace', () => {
  it('finds siblings and notes of the same project', async () => {
    const index = await setup(VAULT);
    const r = relatedByPlace(index, 'projects/site/kickoff.md');
    expect(r.find((x) => x.path === 'projects/site/pricing-research.md')!.why).toEqual(['same folder: projects/site/', 'project: site']);
    expect(r.find((x) => x.path === 'projects/site/index.md')!.why).toEqual(['same folder: projects/site/']);
  });
});

describe('relatedByText', () => {
  it('finds notes with similar words, shows which, and leaves unrelated notes out', async () => {
    const index = await setup(VAULT);
    const r = relatedByText(index, 'projects/site/pricing-research.md');
    // The project index mentions "pricing-research" itself, so it is the closest. The screen hides notes already linked.
    expect(r.map((x) => x.path)).toEqual(['projects/site/index.md', 'reference/pricing-psychology.md', 'projects/site/kickoff.md']);
    expect(r[1]!.why).toContain('pricing');
    expect(r.some((x) => x.path === 'misc/cooking.md')).toBe(false);
  });

  it('follows edits: the cache is rebuilt when the index changes', async () => {
    const store = new MemoryStorage(VAULT);
    const index = new VaultIndex(store);
    await index.scan();
    expect(relatedByText(index, 'misc/cooking.md')).toEqual([]);
    store.external('projects/site/kickoff.md', 'Tomato soup with basil and a recipe for stock.');
    await index.scan();
    expect(relatedByText(index, 'misc/cooking.md')[0]?.path).toBe('projects/site/kickoff.md');
  });
});

describe('unlinkedMentions', () => {
  it('finds notes that mention this one by name without linking, ignoring code and existing links', async () => {
    const index = await setup(VAULT);
    const m = unlinkedMentions(index, 'people/dana.md');
    expect(m.inbound.map((x) => [x.path, x.line, x.term])).toEqual([
      ['journal/day.md', 1, 'Dana Ortiz'],
      ['projects/site/kickoff.md', 6, 'Dana'],
    ]);
  });

  it('finds notes this one mentions without linking to them', async () => {
    const index = await setup(VAULT);
    const m = unlinkedMentions(index, 'journal/day.md');
    expect(m.outbound.map((x) => [x.path, x.term])).toEqual([
      ['people/dana.md', 'Dana Ortiz'],
      ['projects/site/index.md', 'Website relaunch'],
    ]);
    expect(m.outbound[0]!.line).toBe(1);
  });

  it('does not offer a note that is already linked, and ignores short names', async () => {
    const index = await setup({ 'a.md': 'Talk to Bob about [[carol-notes]] and carol notes.', 'bob.md': '', 'carol-notes.md': 'x', 'abc.md': '' });
    expect(unlinkedMentions(index, 'a.md').outbound.map((x) => x.path)).toEqual([]);
  });
});

describe('hubs and graph', () => {
  it('orders notes by how connected they are', async () => {
    const index = await setup(VAULT);
    expect(hubs(index)[0]).toMatchObject({ path: 'projects/site/index.md', degree: 2 });
  });

  it('builds a neighbourhood with solid link edges and dashed related ones, within limits', async () => {
    const index = await setup(VAULT);
    const g = graphAround(index, 'projects/site/kickoff.md', { depth: 2, related: 2 });
    expect(g.nodes[0]).toMatchObject({ path: 'projects/site/kickoff.md', kind: 'focus', depth: 0 });
    const linked = g.nodes
      .filter((n) => n.kind === 'link')
      .map((n) => n.path)
      .sort();
    expect(linked).toEqual(['projects/site/index.md', 'projects/site/pricing-research.md']);
    expect(g.edges.filter((e) => e.kind === 'link').length).toBeGreaterThanOrEqual(3);
    const related = g.nodes.filter((n) => n.kind === 'related');
    expect(related.length).toBeLessThanOrEqual(2);
    expect(g.edges.filter((e) => e.kind === 'related').every((e) => e.from === 'projects/site/kickoff.md')).toBe(true);
    expect(graphAround(index, 'projects/site/kickoff.md', { maxNodes: 1, related: 0 }).nodes).toHaveLength(2);
  });

  it('lays nodes out deterministically with no two on the same spot', async () => {
    const index = await setup(VAULT);
    const g = graphAround(index, 'projects/site/index.md', { depth: 2, related: 3 });
    const a = layoutRadial(g);
    const b = layoutRadial(g);
    expect(a).toEqual(b);
    expect(a.find((n) => n.kind === 'focus')).toMatchObject({ x: 0, y: 0 });
    const spots = new Set(a.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
    expect(spots.size).toBe(a.length);
  });

  it('handles a note with nothing around it', async () => {
    const index = await setup({ 'lonely.md': 'Nothing here.' });
    expect(graphAround(index, 'lonely.md').nodes).toHaveLength(1);
    expect(layoutRadial(graphAround(index, 'lonely.md'))).toHaveLength(1);
    expect(graphAround(index, 'missing.md')).toEqual({ nodes: [], edges: [] });
  });
});

describe('relatedNotLinked', () => {
  it('merges the signals, explains each, and leaves out notes already linked either way', async () => {
    const index = await setup(VAULT);
    const r = relatedNotLinked(index, 'projects/site/pricing-research.md');
    const paths = r.map((x) => x.path);
    expect(paths).toContain('reference/pricing-psychology.md');
    // index.md links to it and kickoff.md is linked from index, but only index is directly connected here.
    expect(paths).not.toContain('projects/site/index.md');
    expect(paths).not.toContain('misc/cooking.md');
    const psych = r.find((x) => x.path === 'reference/pricing-psychology.md')!;
    expect(psych.why).toContain('#pricing');
    expect(psych.why.some((w) => w === 'pricing')).toBe(true); // a shared word, too
    const kick = r.find((x) => x.path === 'projects/site/kickoff.md')!;
    expect(kick.why).toEqual(expect.arrayContaining(['#launch', 'same folder: projects/site/', 'project: site']));
  });
});
