import { describe, expect, it } from 'vitest';
import { daysSince, fileItem, finish, reschedule, slipped, triage, undated, waitingOn, weekAhead } from '../src/home';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

const TODAY = '2026-11-21';
const FILES: Record<string, string> = {
  'inbox/2026-11-21 1420.md': '---\ntitle: "2026-11-21 14:20"\ncreated: 2026-11-21\nproject:\ntags: []\npeople: []\n---\n\nCalled Dana\n',
  'inbox/2026-11-20 0900.md': '---\ntitle: "2026-11-20 09:00"\ncreated: 2026-11-20\ntags: [meeting]\n---\nalready tagged\n',
  'inbox/Inbox.md': '# Inbox\n- [ ] A loose line\n',
  'inbox/plain.md': 'no frontmatter at all',
  'tasks/Call Dana.md': '---\ntitle: Call Dana\nstatus: todo\ndue: 2026-11-19\ncreated: 2026-11-10\n---\n',
  'tasks/Waiting thing.md': '---\ntitle: Waiting thing\nstatus: waiting\ncreated: 2026-11-10\n---\n',
  'tasks/Done thing.md': '---\ntitle: Done thing\nstatus: done\n---\n',
  'projects/site/index.md': '---\ntitle: Site\ntype: project\nactive: true\n---\n- [ ] Overdue inline due:2026-11-01\n- [ ] Tomorrow inline due:2026-11-22\n- [ ] No date inline\n',
  'projects/site/tasks/Filed.md': '---\ntitle: Filed\nstatus: todo\nproject: site\ndue: 2026-11-25\n---\n',
};
async function setup() {
  const store = new MemoryStorage(FILES);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}

describe('Home helpers', () => {
  it('triage lists unfiled quick notes and task notes, newest first, and not what is already filed', async () => {
    const { index } = await setup();
    expect(triage(index).map((t) => `${t.kind}:${t.title}`)).toEqual(['note:2026-11-21 14:20', 'task:Call Dana', 'task:Waiting thing', 'note:plain']);
  });

  it('finds what slipped, what is waited on and for how long, the week ahead and undated tasks', async () => {
    const { index } = await setup();
    expect(slipped(index, TODAY).map((t) => t.item.title)).toEqual(['Overdue inline', 'Call Dana']);
    expect(waitingOn(index, TODAY).map((w) => [w.task.item.title, w.days])).toEqual([['Waiting thing', 11]]);
    const week = weekAhead(index, TODAY);
    expect(week).toHaveLength(7);
    expect(week[1]).toMatchObject({ date: '2026-11-22', open: 1 });
    expect(week[4]).toMatchObject({ date: '2026-11-25', open: 1 });
    expect(undated(index).map((t) => t.item.title).sort()).toEqual(['A loose line', 'No date inline', 'Waiting thing']);
    expect(daysSince('2026-11-10', TODAY)).toBe(11);
    expect(daysSince(undefined, TODAY)).toBeUndefined();
  });

  it('fileItem changes only the project and tags, and nothing else in the note', async () => {
    const { store, index } = await setup();
    const r = await fileItem(store, index, 'inbox/2026-11-21 1420.md', { project: 'site', tags: ['#meeting', 'launch'] });
    expect(r.written).toBe(true);
    expect(await store.read('inbox/2026-11-21 1420.md')).toBe('---\ntitle: "2026-11-21 14:20"\ncreated: 2026-11-21\nproject: site\ntags: [meeting, launch]\npeople: []\n---\n\nCalled Dana\n');
    expect(triage(index).map((t) => t.title)).not.toContain('2026-11-21 14:20');
    const again = await fileItem(store, index, 'inbox/2026-11-21 1420.md', { project: 'SITE', tags: ['meeting'] });
    expect(again.written).toBe(false);
    await fileItem(store, index, 'inbox/plain.md', { project: 'site' });
    expect(await store.read('inbox/plain.md')).toBe('---\nproject: site\n---\nno frontmatter at all');
  });

  it('reschedule and finish edit one task, inline or in a note, and leave the rest', async () => {
    const { store, index } = await setup();
    const inline = index.tasks().find((t) => t.title === 'Overdue inline')!;
    const file = index.tasks().find((t) => t.title === 'Call Dana')!;
    await reschedule(store, index, inline, '2026-11-23');
    await reschedule(store, index, file, null);
    expect(await store.read('projects/site/index.md')).toBe(FILES['projects/site/index.md']!.replace('due:2026-11-01', 'due:2026-11-23'));
    expect(await store.read('tasks/Call Dana.md')).toBe('---\ntitle: Call Dana\nstatus: todo\ncreated: 2026-11-10\n---\n');
    const none = index.tasks().find((t) => t.title === 'No date inline')!;
    await finish(store, index, none);
    expect(await store.read('projects/site/index.md')).toContain('- [x] No date inline');
    expect(slipped(index, TODAY)).toEqual([]);
  });
});
