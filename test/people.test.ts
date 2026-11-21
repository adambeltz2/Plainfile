import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { buildPeople, personPage, slugName } from '../src/people';

const TODAY = '2026-11-21';
const FILES: Record<string, string> = {
  'people/dana.md': '---\ntitle: Dana Ortiz\ntype: person\naliases: [Dana O, dana-ortiz]\ncompany: Northfield\n---\nBrand lead.\n',
  'a.md': '- [ ] Send logos @dana due:2026-11-19\n- [x] Old thing @Dana\n- [ ] Review copy @dana-ortiz #waiting\n- [ ] Call @sam due:2026-11-25\n',
  'tasks/T.md': '---\ntitle: Task note\nstatus: waiting\npeople: [Dana O]\ncreated: 2026-11-10\n---\n',
  'meetings/Kickoff.md': '---\ntitle: Kickoff\ndate: 2026-11-17\nattendees: [dana, pat]\n---\nSam joined? @sam\n',
  'notes/Idea.md': 'Ask @dana about the launch. Email me@example.com',
  'people/lonely.md': '---\ntitle: Lonely Person\ntype: person\n---\n',
};
async function setup() {
  const index = new VaultIndex(new MemoryStorage(FILES));
  await index.scan();
  return buildPeople(index, TODAY);
}

describe('people', () => {
  it('slugs names the way @mentions are written', () => {
    expect(slugName('@Dana Ortiz')).toBe('dana-ortiz');
    expect(slugName(' Ünï  Name ')).toBe('ünï-name');
  });

  it('joins spellings of a name through the person note, and lists everyone with counts', async () => {
    const p = await setup();
    const by = (k: string) => p.people.find((x) => x.key === k)!;
    expect(p.people.map((x) => x.key).sort()).toEqual(['dana', 'lonely', 'pat', 'sam']);
    expect(by('dana')).toMatchObject({ name: 'Dana Ortiz', open: 3, waiting: 2, overdue: 1 });
    expect(by('dana').note?.path).toBe('people/dana.md');
    expect(by('sam')).toMatchObject({ name: 'sam', open: 1, overdue: 0, waiting: 0 });
    expect(by('pat')).toMatchObject({ open: 0, notes: 1 });
    expect(by('lonely')).toMatchObject({ open: 0, notes: 0 });
    expect(by('dana').notes).toBe(3); // the meeting, the idea and the note with her tasks; not her own note, not email addresses
    expect(p.people.map((x) => x.key)).not.toContain('example-com');
  });

  it('a person page has open tasks, what you wait on, meetings, notes and how long since they appeared', async () => {
    const p = await setup();
    const page = personPage(p, 'dana', TODAY)!;
    expect(page.open.map((t) => t.item.title)).toEqual(['Send logos']);
    expect(page.waiting.map((t) => t.item.title).sort()).toEqual(['Review copy', 'Task note']);
    expect(page.done).toBe(1);
    expect(page.meetings.map((n) => n.title)).toEqual(['Kickoff']);
    expect(page.notes.map((n) => n.title)).toEqual(['Idea', 'a']);
    expect(page.quietDays).toBeGreaterThanOrEqual(0);
    expect(personPage(p, 'nobody', TODAY)).toBeUndefined();
  });
});
