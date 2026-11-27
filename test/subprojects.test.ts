import { describe, expect, it } from 'vitest';
import { hubTasks } from '../src/hub';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { listProjects, openSubProjects, projectDashboard, setProjectActive, subProjects } from '../src/projects';
import { renderTemplate, BUILT_IN } from '../src/templates';

const proj = (title: string, extra = '', body = ''): string => `---\ntitle: ${title}\ntype: project\nactive: true\n${extra}---\n${body}`;
const FILES: Record<string, string> = {
  'projects/site/index.md': proj('Site', 'sortOrder: 1\n', '- [ ] Site task\n'),
  'projects/site/media/index.md': proj('Media', '', '- [ ] Media task\n'),
  'projects/site/media/assets/index.md': proj('Assets', '', '- [ ] Asset task\n'),
  'projects/site/launch/index.md': proj('Launch', '', '- [ ] Launch task\n'),
  'projects/other/index.md': proj('Other', 'sortOrder: 2\n', '- [ ] Other task\n'),
  'meetings/Review.md': '---\ntitle: Review\nproject: media\n---\n- [ ] Review task\n',
};

async function setup(files = FILES) {
  const storage = new MemoryStorage(files);
  const index = new VaultIndex(storage);
  await index.scan();
  return { storage, index };
}

describe('listProjects is worked out once per change, and stays right after one', () => {
  it('hands out copies, so a caller cannot change what the next call sees', async () => {
    const { index } = await setup();
    const first = listProjects(index);
    first[0]!.title = 'Changed';
    first[0]!.openTasks = 99;
    expect(listProjects(index)[0]!.title).toBe('Site');
    expect(listProjects(index)[0]!.openTasks).not.toBe(99);
  });
  it('sees a new note that names a project, a new sub-project, and a note that stops naming one', async () => {
    const { storage, index } = await setup();
    const open = (title: string): number => listProjects(index).find((p) => p.title === title)!.openTasks;
    const before = open('Other');
    storage.external('meetings/Sync.md', '---\ntitle: Sync\nproject: other\n---\n- [ ] Sync task\n');
    await index.scan();
    expect(open('Other')).toBe(before + 1);
    storage.external('meetings/Sync.md', '---\ntitle: Sync\nproject: site\n---\n- [ ] Sync task\n');
    await index.scan();
    expect(open('Other')).toBe(before);
    storage.external('projects/other/deep/index.md', proj('Deep', '', '- [ ] Deep task\n'));
    await index.scan();
    expect(listProjects(index).find((p) => p.title === 'Deep')?.parent).toBe('projects/other/index.md');
  });
});

describe('sub-projects', () => {
  it('lists a project folder inside another as its sub-project, one level deep, right after its parent', async () => {
    const { index } = await setup();
    const list = listProjects(index);
    expect(list.map((p) => p.title)).toEqual(['Site', 'Assets', 'Launch', 'Media', 'Other']);
    const parentOf = Object.fromEntries(list.map((p) => [p.title, p.parent]));
    expect(parentOf).toEqual({
      Site: undefined,
      Launch: 'projects/site/index.md',
      Media: 'projects/site/index.md',
      Assets: 'projects/site/index.md',
      Other: undefined,
    });
  });
  it('numbers only the top-level projects', async () => {
    const { index } = await setup();
    expect(Object.fromEntries(listProjects(index).map((p) => [p.title, p.number]))).toEqual({
      Site: 1,
      Launch: undefined,
      Media: undefined,
      Assets: undefined,
      Other: 2,
    });
  });
  it('counts a sub-project’s notes and tasks in its parent as well, including notes elsewhere that name it', async () => {
    const { index } = await setup();
    const site = projectDashboard(index, 'projects/site/index.md', '2026-11-24');
    expect(site?.open.map((t) => t.title).sort()).toEqual(['Asset task', 'Launch task', 'Media task', 'Review task', 'Site task']);
    const media = projectDashboard(index, 'projects/site/media/index.md', '2026-11-24');
    expect(media?.open.map((t) => t.title).sort()).toEqual(['Asset task', 'Media task', 'Review task']);
    expect(projectDashboard(index, 'projects/other/index.md', '2026-11-24')?.open.map((t) => t.title)).toEqual(['Other task']);
  });
  it('does not repeat a task under both projects when tasks are grouped by project', async () => {
    const { index } = await setup();
    const tasks = hubTasks(index, '*');
    const media = tasks.find((t) => t.item.title === 'Media task');
    expect(media?.projects).toEqual(['Media']);
    expect(tasks.find((t) => t.item.title === 'Asset task')?.projects).toEqual(['Assets']);
    expect(tasks.find((t) => t.item.title === 'Review task')?.projects).toEqual(['Media']);
  });
  it('lists the sub-projects and which are still open', async () => {
    const { index } = await setup();
    expect(subProjects(index, 'projects/site/index.md')).toHaveLength(3);
    expect(openSubProjects(index, 'projects/site/index.md').map((p) => p.title)).toEqual(['Assets', 'Launch', 'Media']);
    expect(subProjects(index, 'projects/other/index.md')).toEqual([]);
  });
});

describe('closing a project with sub-projects', () => {
  it('is refused while a sub-project is open, and changes nothing', async () => {
    const { storage, index } = await setup();
    const before = await storage.read('projects/site/index.md');
    await expect(setProjectActive(storage, index, 'projects/site/index.md', false, '2026-11-24')).rejects.toThrow(
      /Close out its sub-projects first: Assets, Launch, Media/,
    );
    expect(await storage.read('projects/site/index.md')).toBe(before);
  });
  it('is allowed once every sub-project is closed, and a sub-project can be closed on its own', async () => {
    const { storage, index } = await setup();
    for (const p of ['projects/site/launch/index.md', 'projects/site/media/index.md', 'projects/site/media/assets/index.md']) {
      expect((await setProjectActive(storage, index, p, false, '2026-11-24')).written).toBe(true);
    }
    expect(openSubProjects(index, 'projects/site/index.md')).toEqual([]);
    expect((await setProjectActive(storage, index, 'projects/site/index.md', false, '2026-11-24')).written).toBe(true);
  });
  it('lets a project without sub-projects close as before, and reopening a parent is never blocked', async () => {
    const { storage, index } = await setup();
    expect((await setProjectActive(storage, index, 'projects/other/index.md', false, '2026-11-24')).written).toBe(true);
    expect((await setProjectActive(storage, index, 'projects/other/index.md', true, '2026-11-24')).written).toBe(true);
  });
});

describe('the Sub-project template', () => {
  it('files a project folder inside the parent’s folder, with no project number', () => {
    const t = BUILT_IN.find((x) => x.name === 'Sub-project');
    expect(t).toBeDefined();
    const r = renderTemplate(t!, { projectDir: 'projects/site', title: 'Media Plan', goal: '' }, '2026-11-24');
    expect(r.path).toBe('projects/site/media-plan/index.md');
    expect(r.content).toContain('type: project');
    expect(r.content).not.toContain('sortOrder');
  });
});
