import { expect, test, type Page } from '@playwright/test';
import { listFiles, localDate, nav, openHubTools, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TODAY = () => localDate(0);

async function newProject(page: Page, name: string, goal = ''): Promise<void> {
  await page.getByRole('button', { name: '+ New' }).click();
  await page
    .locator('.modal')
    .getByRole('button', { name: /^Project/ })
    .click();
  await page.locator('#tpl-title').fill(name);
  if (goal) await page.locator('#tpl-goal').fill(goal);
  await page.getByRole('button', { name: 'Create file' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('one-line quick add', () => {
  test('one line carries people, tags and a natural due date, plus the created date', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await expect(page.locator('#quick-people')).toHaveCount(0);
    await page.locator('#quick-text').fill('Here is a task @Adam #launch due:tomorrow');
    await expect(page.locator('#quick-preview')).toContainText('Inbox');
    await expect(page.locator('#quick-preview')).toContainText('@Adam');
    await expect(page.locator('#quick-preview')).toContainText('#launch');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toHaveText('+title: Here is a task');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'tasks/Here is a task.md'))
      .toBe(`---\ntitle: Here is a task\nstatus: todo\ndue: ${localDate(1)}\ncreated: ${TODAY()}\ntags: [launch]\npeople: [Adam]\n---\n\n`);
    const row = page.locator('.task', { hasText: 'Here is a task' });
    await expect(row).toContainText(/@adam/i);
    await expect(row).toContainText('added');
    await expect(page.locator('#quick-text')).toHaveValue('');
  });

  test('+Project files the task in that project, and an unknown project or date is explained instead of guessed', async ({ page }) => {
    const dir = await openVault(page, { 'projects/site/index.md': '---\ntitle: Website relaunch\nactive: true\n---\nGoal.\n' });
    await page.locator('#quick-text').fill('Send logos +site @Adam due:today');
    await expect(page.locator('#quick-preview')).toContainText('Website relaunch');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toContainText('Send logos');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'projects/site/tasks/Send logos.md'))
      .toBe(`---\ntitle: Send logos\nstatus: todo\ndue: ${TODAY()}\ncreated: ${TODAY()}\nproject: site\ntags: []\npeople: [Adam]\n---\n\n`);
    expect(await readFile(page, dir, 'projects/site/index.md')).toBe('---\ntitle: Website relaunch\nactive: true\n---\nGoal.\n');
    await page.locator('#quick-text').fill('Nope +ghost');
    await expect(page.locator('#quick-preview')).toContainText('No project called "ghost"');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.notice.err')).toContainText('No project called "ghost"');
    await page.locator('#quick-text').fill('Later due:someday');
    await expect(page.locator('#quick-preview')).toContainText('Could not read "due:someday"');
  });

  test('the New menu has one Task, which makes its own note with a created date and empty tags and people', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await expect(page.locator('.modal').getByRole('button', { name: /^Task/ })).toHaveCount(1);
    await page.locator('.modal').getByRole('button', { name: /^Task/ }).click();
    await page.locator('#new-task-text').fill('Write launch email');
    await page.getByRole('button', { name: 'Add task' }).click();
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'tasks/Write launch email.md'))
      .toBe(`---\ntitle: Write launch email\nstatus: todo\ncreated: ${TODAY()}\ntags: []\npeople: []\n---\n\n`);
    await expect(page.locator('.task', { hasText: 'Write launch email' })).toBeVisible(); // in the Inbox view
  });
});

test.describe('new project', () => {
  test('+ New > Project makes a folder with a numbered index note, and shows in Projects', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    // The project-only templates are not offered in the menu.
    await expect(page.locator('.modal').getByRole('button', { name: /^Project task/ })).toHaveCount(0);
    await expect(page.locator('.modal').getByRole('button', { name: /^Project note/ })).toHaveCount(0);
    await page
      .locator('.modal')
      .getByRole('button', { name: /^Project/ })
      .click();
    await page.locator('#tpl-title').fill('Kitchen Remodel');
    await page.locator('#tpl-goal').fill('New cabinets');
    await expect(page.locator('#tpl-path')).toHaveText('projects/kitchen-remodel/index.md');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, 'projects/kitchen-remodel/index.md')).toBe(
      `---\ntitle: Kitchen Remodel\ntype: project\nactive: true\nsortOrder: 1\ncreated: ${TODAY()}\ntags: []\n---\n\n## Goal\nNew cabinets\n\n## Notes\n- \n\n## Tasks\n- [ ] \n`,
    );
    await nav(page, 'Today').click();
    await page
      .locator('.side')
      .getByRole('button', { name: /^Projects/ })
      .click();
    await expect(page.locator('.pcard .pnum')).toHaveText('1');
    await expect(page.locator('.pcard .ptitle')).toHaveText('Kitchen Remodel');
    // The second project is number 2.
    await newProject(page, 'Taxes');
    await nav(page, 'Today').click();
    await page
      .locator('.side')
      .getByRole('button', { name: /^Projects/ })
      .click();
    await expect(page.locator('.pcard .pnum')).toHaveText(['1', '2']);
  });

  test('a project card files a task and a note into the project, and the project page lists them', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await newProject(page, 'Kitchen Remodel');
    await nav(page, 'Today').click();
    await page
      .locator('.side')
      .getByRole('button', { name: /^Projects/ })
      .click();

    await page.locator('.pcard').getByRole('button', { name: '+ Task' }).click();
    await page.locator('#tpl-title').fill('Order cabinets');
    await expect(page.locator('#tpl-path')).toHaveText('projects/kitchen-remodel/tasks/Order cabinets.md');
    await expect(page.locator('#tpl-preview')).toContainText('project: kitchen-remodel');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const task = await readFile(page, dir, 'projects/kitchen-remodel/tasks/Order cabinets.md');
    expect(task).toContain(`created: ${TODAY()}\nproject: kitchen-remodel\ntags: []\npeople: []`);

    await nav(page, 'Today').click();
    await page
      .locator('.side')
      .getByRole('button', { name: /^Projects/ })
      .click();
    await expect(page.locator('.pcard')).toContainText('2 tasks'); // the starter checkbox plus the new task file
    await page.locator('.pcard').getByRole('button', { name: '+ Note' }).click();
    await page.locator('#tpl-title').fill('Quote from Dana');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, 'projects/kitchen-remodel/Quote from Dana.md')).toContain('project: kitchen-remodel');

    // The project's own page lists what belongs to it, and has the same buttons.
    await page.locator('.note-item', { hasText: 'Kitchen Remodel' }).click();
    const panel = page.locator('#note-side');
    await expect(panel).toContainText('In this project');
    await expect(panel).toContainText('Order cabinets');
    await expect(panel).toContainText('Quote from Dana');
    await expect(panel.getByRole('button', { name: '+ Task' })).toBeVisible();

    // And the Board groups the task under the project.
    await nav(page, 'Board').click();
    await page.getByRole('button', { name: /^kitchen-remodel/ }).click();
    await expect(page.locator('[data-col="todo"] .card')).toContainText('Order cabinets');
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'a.md': '# A\n' });
    await newProject(page, 'Kitchen Remodel');
    await nav(page, 'Today').click();
    await page.locator('.side-toggle').click();
    await page
      .locator('.side')
      .getByRole('button', { name: /^Projects/ })
      .click();
    await page.locator('.pcard').getByRole('button', { name: '+ Task' }).click();
    await expect(page.locator('.modal')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('quick add due date', () => {
  test('the quick add box fits a phone and reads due words', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const dir = await openVault(page, { 'a.md': '# A\n' });
    const box = await page.locator('#quick-text').boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.locator('#quick-text').fill('Pay invoice due:+3d');
    await page.locator('#quick-text').press('Enter');
    const d = new Date();
    d.setDate(d.getDate() + 3);
    await expect(page.locator('.diff .add')).toContainText('title: Pay invoice');
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Pay invoice.md')).toContain(`due: ${localDate(3)}\ncreated: ${localDate(0)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('the New task form has the same picks', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page
      .locator('.modal')
      .getByRole('button', { name: /^Task\b/ })
      .filter({ hasText: 'A task with its own note' })
      .click();
    await page.locator('.modal').getByRole('button', { name: 'Today' }).click();
    await expect(page.locator('#new-task-due')).toHaveValue(localDate(0));
  });
});

test.describe('default frontmatter', () => {
  test('a note without frontmatter gets a button that adds a starter block and keeps the text', async ({ page }) => {
    const dir = await openVault(page, { 'plain.md': '# Plain thing\n\nSome text.\n', 'has.md': '---\ntitle: Has\n---\nBody\n' });
    await nav(page, 'Notes').click();
    await page
      .locator('.note-item', { hasText: /^has$|^Has$/ })
      .first()
      .click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add default frontmatter' })).toHaveCount(0);
    await page.locator('.note-item', { hasText: 'Plain thing' }).click();
    await page.getByRole('button', { name: 'Add default frontmatter' }).click();
    await expect(page.getByRole('button', { name: 'Add default frontmatter' })).toHaveCount(0);
    await expect(page.locator('.props')).toContainText('Plain thing');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'plain.md'), { timeout: 4000 })
      .toBe(`---\ntitle: Plain thing\ncreated: ${TODAY()}\ntags: []\n---\n# Plain thing\n\nSome text.\n`);
    expect(await readFile(page, dir, 'has.md')).toBe('---\ntitle: Has\n---\nBody\n');
  });
});

test.describe('search by date', () => {
  test('Modified today chips list what changed today, and an empty search shows recent notes', async ({ page }) => {
    await openVault(page, { 'a.md': '# Alpha\nbody', 'b.md': '# Beta\nbody' });
    await nav(page, 'Search').click();
    await expect(page.locator('#search-results')).toContainText('Recently modified');
    await expect(page.locator('#search-results .res')).toHaveCount(2);
    await page.getByRole('button', { name: 'Modified today' }).click();
    await expect(page.locator('#search-q')).toHaveValue('modified:today');
    await expect(page.locator('#search-count')).toHaveText('2 results in 2 notes');
    await expect(page.locator('#search-results .res').first()).toContainText('edited');
    await expect(page.getByRole('button', { name: 'Modified today' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Yesterday' }).click();
    await expect(page.locator('#search-count')).toHaveText('0 results in 2 notes');
    await page.locator('#search-q').fill('modified:today beta');
    await expect(page.locator('#search-results .res')).toHaveCount(1);
  });
});

test.describe('project dashboard', () => {
  const FILES = {
    'projects/site/index.md':
      '---\ntitle: Website relaunch\ntype: project\nactive: true\ncreated: 2026-11-01\n---\n## Goal\nLaunch by Dec 8\n\n- [ ] Pick a host @sam due:2026-01-05\n- [x] Buy domain @dana\n- Ask legal about terms #followup\n',
    'projects/site/tasks/Write copy.md': '---\ntitle: Write copy\nstatus: todo\ndue: 2999-01-01\ntags: [launch]\n---\n',
    'meetings/Kickoff.md': '---\ntitle: Kickoff\nproject: Website relaunch\npeople: [dana]\n---\nNotes\n',
    'other.md': '- [ ] Unrelated task',
  };

  test('shows open tasks, notes, people and follow-ups in one place, and ticking writes one character', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Projects').click();
    await expect(page.locator('.pcard .ptitle')).toHaveText('Website relaunch');
    await page.locator('.pcard .pbtn').click();
    await expect(page.locator('.title')).toHaveText('Website relaunch');
    await expect(page.locator('.psummary')).toHaveText('Launch by Dec 8');
    await expect(page.locator('.pstat').nth(0)).toContainText('2'); // open
    await expect(page.locator('.pstat').nth(1)).toContainText('1'); // overdue
    await expect(page.locator('.hub-status')).toContainText('1 of 3 done');
    await expect(page.locator('.grp.late')).toContainText('Overdue');
    await expect(page.locator('.hub-content')).toContainText('Pick a host');
    await expect(page.locator('.hub-content')).toContainText('Write copy');
    await expect(page.locator('.hub-content')).not.toContainText('Unrelated');
    await expect(page.locator('.hub-status')).toContainText('@sam');
    await page.getByRole('tab', { name: /^Notes/ }).click();
    await expect(page.locator('.hub-content')).toContainText('Kickoff');
    await expect(page.locator('.hub-content')).toContainText('Ask legal about terms');
    await page.getByRole('tab', { name: /^Tasks/ }).click();
    await page.getByRole('button', { name: /Mark done: Pick a host/ }).click();
    await expect(page.locator('.plog .diff .add')).toContainText('- [x] Pick a host');
    expect(await readFile(page, dir, 'projects/site/index.md')).toContain('- [x] Pick a host @sam due:2026-01-05');
    await expect(page.locator('.task.done', { hasText: 'Pick a host' })).toBeVisible();
    await page.getByRole('button', { name: 'All projects' }).first().click();
    await expect(page.locator('.pcard')).toBeVisible();
  });

  test('+ Task and + Meeting start from this project, and the Today cards link to the dashboard', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Today').click();
    await page.locator('.side [data-view="projects"]').click();
    await page.locator('.pcard').getByRole('button', { name: 'Dashboard' }).click();
    await expect(page.locator('.title')).toHaveText('Website relaunch');
    await page.getByRole('button', { name: '+ Meeting' }).click();
    await expect(page.locator('#tpl-project')).toHaveValue('site');
    await expect(page.locator('#tpl-preview')).toContainText('project: site');
    await page.locator('.modal').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: '+ Task' }).click();
    await expect(page.locator('#tpl-path')).toContainText('projects/site/tasks/');
  });

  test('fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, FILES);
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await expect(page.locator('.title')).toHaveText('Website relaunch');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('tagging a note with projects', () => {
  const FILES = {
    'projects/site/index.md': '---\ntitle: Website relaunch\nactive: true\n---\nGoal.\n',
    'projects/kitchen/index.md': '---\ntitle: Kitchen\nactive: true\n---\nQuote.\n',
    'ideas/Brand.md': '---\ntitle: Brand ideas\n---\nLogo thoughts\n- [ ] Pick fonts due:2999-01-01\n',
  };

  test('add a note to one or more projects from its properties, see it on each dashboard, and remove it', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Brand ideas$/ }).click();
    await expect(page.locator('.cm-content')).toBeVisible();

    await page.locator('#prop-project').fill('site');
    await page.locator('#prop-project').press('Enter');
    await expect(page.locator('.projchip', { hasText: 'site' })).toBeVisible();
    await expect.poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 }).toContain('project: site\n');
    await page.locator('#prop-project').fill('kitchen');
    await page.locator('#prop-project').press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 }).toContain('project: [site, kitchen]\n');
    await page.locator('#prop-project').fill('ghost');
    await page.locator('#prop-project').press('Enter');
    await expect(page.locator('#note-status')).toContainText('No project called');

    await nav(page, 'Projects').click();
    await page.locator('.pcard', { hasText: 'Kitchen' }).locator('.pbtn').click();
    await expect(page.locator('.hub-content')).toContainText('Pick fonts');
    await page.getByRole('tab', { name: /^Notes/ }).click();
    await expect(page.locator('.hub-content')).toContainText('Brand ideas');

    await nav(page, 'Notes').click();
    await page
      .locator('.projchip', { hasText: 'kitchen' })
      .getByRole('button', { name: /Remove from kitchen/ })
      .click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 }).toContain('project: site\n');
    await page
      .locator('.projchip', { hasText: 'site' })
      .getByRole('button', { name: /Remove from site/ })
      .click();
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 })
      .toBe('---\ntitle: Brand ideas\n---\nLogo thoughts\n- [ ] Pick fonts due:2999-01-01\n');
  });

  test('the project chip opens that project’s dashboard', async ({ page }) => {
    await openVault(page, { ...FILES, 'ideas/Brand.md': '---\ntitle: Brand ideas\nproject: site\n---\nx\n' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Brand ideas$/ }).click();
    await page.locator('.projchip').getByRole('button', { name: 'site' }).first().click();
    await expect(page.locator('.title')).toHaveText('Website relaunch');
  });
});

test.describe('project hub', () => {
  const many = (n: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < n; i++)
      out[`projects/big/tasks/Task ${String(i).padStart(3, '0')}.md`] =
        `---\ntitle: Task ${String(i).padStart(3, '0')}\nstatus: ${i % 4 === 0 ? 'doing' : 'todo'}\ndue: ${i % 3 === 0 ? '2999-01-01' : ''}\nphase: ${i % 2 ? 'Phase 1' : 'Phase 2'}\npeople: [${i % 5 === 0 ? 'dana' : 'sam'}]\ntags: [${i % 7 === 0 ? 'launch' : 'misc'}]\n---\n`;
    return out;
  };
  const BASE = {
    'projects/big/index.md': '---\ntitle: Big project\ntype: project\nactive: true\n---\n# Big\n## Phase 1\n- [ ] Inline in phase one @dana due:2026-01-02\n',
    ...many(60),
  };

  async function openBig(page: Page): Promise<string> {
    const dir = await openVault(page, BASE);
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await expect(page.locator('.hubwrap')).toBeVisible();
    return dir;
  }

  test('groups hundreds of tasks, shows 25 at a time, and groups by person, phase and status', async ({ page }) => {
    await openBig(page);
    await expect(page.getByRole('tab', { name: /^Tasks 61/ })).toBeVisible();
    await expect(page.locator('.hub-group .grp.late')).toContainText('Overdue');
    const noDate = page.locator('.hub-group', { hasText: 'No date' });
    await expect(noDate.locator('.task')).toHaveCount(25);
    await noDate.getByRole('button', { name: /Show \d+ more/ }).click();
    await expect(noDate.locator('.task')).toHaveCount(40);
    await page.locator('#hub-group').selectOption('person');
    await expect(page.locator('.hub-group .grp', { hasText: '@dana' })).toBeVisible();
    await expect(page.locator('.hub-group .grp', { hasText: '@sam' })).toBeVisible();
    await page.locator('#hub-group').selectOption('phase');
    await expect(page.locator('.hub-group .grp', { hasText: 'Phase 1' })).toBeVisible();
    await expect(page.locator('.hub-group .grp', { hasText: 'No phase' })).toHaveCount(0);
    await page.locator('#hub-group').selectOption('status');
    await expect(page.locator('.hub-group .grp', { hasText: 'Doing' })).toBeVisible();
  });

  test('filters by text and by chips, shows them as removable chips, and clears them', async ({ page }) => {
    await openBig(page);
    await page.locator('#hub-q').fill('Task 007');
    await expect(page.locator('.hub-content .task')).toHaveCount(1);
    await page.locator('#hub-q').fill('');
    await openHubTools(page);
    await page.locator('.hub-facets summary').click();
    await page
      .locator('.hub-facets')
      .getByRole('button', { name: /^@dana/ })
      .click();
    await page
      .locator('.hub-facets')
      .getByRole('button', { name: /^#launch/ })
      .click();
    await expect(page.locator('.hub-active')).toContainText('@dana');
    await expect(page.locator('.hub-active')).toContainText('#launch');
    const n = await page.locator('.hub-content .task').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
    await page
      .locator('.hub-active')
      .getByRole('button', { name: /Remove filter #launch/ })
      .click();
    expect(await page.locator('.hub-content .task').count()).toBeGreaterThan(n);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.locator('.hub-active')).toHaveCount(0);
    await page.getByRole('button', { name: 'Overdue', exact: true }).click();
    await expect(page.locator('.hub-content .task')).toHaveCount(1);
    await expect(page.locator('.hub-content')).toContainText('Inline in phase one');
  });

  test('the status column shows progress, phases, who has what and what is next, and a phase click filters', async ({ page }) => {
    await openBig(page);
    const s = page.locator('.hub-status');
    await expect(s).toContainText('0 of 61 done');
    await expect(s).toContainText('Phase 1');
    await expect(s).toContainText('Phase 2');
    await expect(s).toContainText('@dana');
    await expect(s.locator('.hub-next li')).toHaveCount(3);
    await s.locator('.hub-phase', { hasText: 'Phase 2' }).click();
    await expect(page.locator('.hub-active')).toContainText('Phase 2');
    await expect(page.locator('.hub-content')).not.toContainText('Inline in phase one');
  });

  test('the project rail switches projects, and the Board moves a task note between statuses on disk', async ({ page }) => {
    const dir = await openVault(page, { ...BASE, 'projects/other/index.md': '---\ntitle: Other thing\nactive: true\n---\nx\n' });
    await nav(page, 'Projects').click();
    await page.locator('.pcard', { hasText: 'Big project' }).locator('.pbtn').click();
    await page
      .locator('.hub-rail')
      .getByRole('button', { name: /Other thing/ })
      .click();
    await expect(page.locator('.title')).toHaveText('Other thing');
    await page
      .locator('.hub-rail')
      .getByRole('button', { name: /Big project/ })
      .click();
    await page.getByRole('tab', { name: 'Board' }).click();
    await expect(page.locator('.hub-col[data-col="doing"] .hub-card').first()).toBeVisible();
    const card = page.locator('.hub-col[data-col="todo"] .hub-card', { hasText: 'Task 001' });
    await card.getByRole('button', { name: 'Move to doing' }).click();
    await expect(page.locator('.plog .diff .add')).toContainText('status: doing');
    expect(await readFile(page, dir, 'projects/big/tasks/Task 001.md')).toContain('status: doing');
    await expect(page.locator('.hub-col[data-col="doing"] .hub-card', { hasText: 'Task 001' })).toBeVisible();
  });

  test('the timeline lays tasks out by week and phase', async ({ page }) => {
    await openBig(page);
    await page.getByRole('tab', { name: 'Timeline' }).click();
    await expect(page.locator('.hub-tl .h', { hasText: 'Overdue' })).toBeVisible();
    await expect(page.locator('.hub-tl .rowh', { hasText: 'Phase 1' })).toBeVisible();
    await expect(page.locator('.hub-tl .cell.late .tlitem', { hasText: 'Inline in phase one' })).toBeVisible();
    await expect(page.locator('.hub-tl .h', { hasText: 'No date' })).toBeVisible();
  });

  test('Tidy lists notes that differ from the standard fields and fixes one line at a time', async ({ page }) => {
    const dir = await openVault(page, {
      'projects/p/index.md': '---\ntitle: P\ntype: project\nactive: true\n---\nx\n',
      'projects/p/tasks/a.md': '---\ntitle: A\nstatus: In Progress\ndeadline: Nov 23 2026\n---\n',
      'projects/p/tasks/b.md': '---\ntitle: B\nstatus: todo\n---\n',
    });
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await expect(page.locator('.hub-status h3', { hasText: 'Tidy' })).toContainText('2');
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.locator('.hub-tidy')).toContainText('status: In Progress → status: doing');
    await page.locator('.hub-tidy li', { hasText: 'In Progress' }).getByRole('button', { name: 'Fix' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/p/tasks/a.md')).toContain('status: doing');
    await page.getByRole('button', { name: /Fix all/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/p/tasks/a.md')).toBe('---\ntitle: A\nstatus: doing\ndue: 2026-11-23\n---\n');
    expect(await readFile(page, dir, 'projects/p/tasks/b.md')).toBe('---\ntitle: B\nstatus: todo\n---\n');
    await expect(page.locator('.hub-tidy')).toContainText('follows the standard fields');
    await expect(page.locator('.hub-status h3', { hasText: 'Tidy' })).toContainText('0');
  });

  test('fits a phone: no sideways scroll, the project picker replaces the rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openBig(page);
    await expect(page.locator('.hub-rail')).toBeHidden();
    await expect(page.locator('#hub-pick')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('tick several tasks, preview the exact lines, apply one change to all, and undo it', async ({ page }) => {
    const dir = await openVault(page, {
      'projects/p/index.md': '---\ntitle: P\ntype: project\nactive: true\n---\n- [ ] Inline one\n- [ ] Inline two @sam\n',
      'projects/p/tasks/a.md': '---\ntitle: A task\nstatus: todo\n---\n',
    });
    const FILES = {
      index: '---\ntitle: P\ntype: project\nactive: true\n---\n- [ ] Inline one\n- [ ] Inline two @sam\n',
      a: '---\ntitle: A task\nstatus: todo\n---\n',
    };
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await expect(page.getByRole('checkbox', { name: 'Select: Inline one' })).toBeHidden(); // one box per task until Select tasks is on
    await openHubTools(page);
    await page.getByRole('button', { name: 'Select tasks' }).click();
    await page.getByRole('checkbox', { name: 'Select: Inline one' }).check();
    await page.getByRole('checkbox', { name: 'Select: Inline two' }).check();
    await page.getByRole('checkbox', { name: 'Select: A task' }).check();
    await expect(page.locator('.hub-bulk')).toContainText('3 selected');
    await page.locator('#bulk-due').fill('2026-12-24');
    await page.getByRole('button', { name: 'Set due' }).click();
    await expect(page.locator('.hub-preview')).toContainText('2 notes will change');
    await expect(page.locator('.hub-preview')).toContainText('+- [ ] Inline one due:2026-12-24');
    expect(await readFile(page, dir, 'projects/p/index.md')).toBe(FILES.index); // nothing written yet
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.hub-preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Set due' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.hub-content .notice.ok')).toContainText('changed 2 notes');
    expect(await readFile(page, dir, 'projects/p/index.md')).toBe(
      FILES.index.replace('Inline one', 'Inline one due:2026-12-24').replace('Inline two @sam', 'Inline two @sam due:2026-12-24'),
    );
    expect(await readFile(page, dir, 'projects/p/tasks/a.md')).toBe('---\ntitle: A task\nstatus: todo\ndue: 2026-12-24\n---\n');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/p/index.md')).toBe(FILES.index);
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/p/tasks/a.md')).toBe(FILES.a);
  });

  test('bulk Done, assign and tag work too, and Select all shown selects what the filters show', async ({ page }) => {
    const dir = await openBig(page);
    await page.locator('#hub-q').fill('Task 00');
    await openHubTools(page);
    await page.getByRole('button', { name: 'Select all shown' }).click();
    await expect(page.locator('.hub-bulk')).toContainText('10 selected');
    await page.locator('#bulk-tag').fill('batch');
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await expect(page.locator('.hub-preview')).toContainText('10 notes will change');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('.hub-content .notice.ok')).toContainText('changed 10 notes'); // wait for every write to finish
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/big/tasks/Task 003.md')).toContain('tags: [misc, batch]');
    await page.locator('#hub-q').fill('Task 001');
    await openHubTools(page);
    await page.getByRole('button', { name: 'Select all shown' }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/big/tasks/Task 001.md')).toContain('status: done');
  });

  test('Projects can be shown as a sortable table with progress, open, overdue and next due', async ({ page }) => {
    await openVault(page, {
      'projects/a/index.md': '---\ntitle: Alpha\nactive: true\nsortOrder: 1\n---\n- [x] Done one\n- [ ] Late one due:2026-01-01\n',
      'projects/b/index.md': '---\ntitle: Beta\nactive: true\nsortOrder: 2\n---\n- [ ] A\n- [ ] B\n- [ ] C\n',
    });
    await nav(page, 'Projects').click();
    await page.getByRole('button', { name: 'Table' }).click();
    const rows = page.locator('.portfolio tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Alpha');
    await expect(rows.first().locator('.chip.late')).toHaveText('1');
    await page.locator('.portfolio').getByRole('button', { name: /^Open/ }).click();
    await expect(rows.first()).toContainText('Alpha'); // 1 open, ascending
    await page.locator('.portfolio').getByRole('button', { name: /^Open/ }).click();
    await expect(rows.first()).toContainText('Beta'); // 3 open, descending
    await rows.first().getByRole('button', { name: 'Beta' }).click();
    await expect(page.locator('.title')).toHaveText('Beta');
  });

  test('on a phone the controls are folded away: the work is on the first screen, and each drawer opens on demand', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const files: Record<string, string> = { 'projects/big/index.md': '---\ntitle: Big project\ntype: project\nactive: true\n---\nGoal text\n' };
    for (let i = 0; i < 30; i++) files[`projects/big/tasks/Task ${i}.md`] = `---\ntitle: Task ${i}\nstatus: todo\nphase: Phase ${i % 2}\n---\n`;
    await openVault(page, files);
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await expect(page.locator('.hubwrap')).toBeVisible();
    await expect(page.locator('.hub-content .task').first()).toBeVisible();
    const first = await page.locator('.hub-content .task').first().boundingBox();
    expect(first!.y).toBeLessThan(700); // tasks are visible without scrolling past a wall of controls
    await expect(page.locator('.pstats')).toBeHidden();
    await expect(page.locator('.hub-tools')).not.toHaveAttribute('open', '');
    await expect(page.locator('.hub-status-d')).not.toHaveAttribute('open', '');
    await expect(page.locator('.selbox').first()).toBeHidden();
    await expect(page.getByRole('button', { name: 'Rescan' })).toBeHidden(); // behind the More tab
    await page.locator('.hub-tools > summary').click();
    await page.locator('#hub-group').selectOption('person');
    await expect(page.locator('.hub-tools')).toHaveAttribute('open', ''); // stays open while you work in it
    await openHubTools(page);
    await page.getByRole('button', { name: 'Select tasks' }).click();
    await expect(page.locator('.selbox').first()).toBeVisible();
    await page.getByRole('button', { name: 'Stop selecting' }).click();
    await expect(page.locator('.selbox').first()).toBeHidden();
    await page.locator('.tabbar').getByRole('button', { name: /^More/ }).click();
    await expect(page.locator('.more-sheet').getByRole('button', { name: 'Rescan' })).toBeVisible();
    await expect(page.locator('.more-sheet').getByRole('button', { name: 'Dark' })).toBeVisible();
    await page.locator('.more-sheet').getByRole('button', { name: 'Close' }).click();
    await page.locator('.hub-status-d > summary').click();
    await expect(page.locator('.hub-status')).toContainText('Progress');
  });
});

test('All tasks shows every task from every project and the notes outside any, grouped by project on request', async ({ page }) => {
  await page.goto('/');
  await openVault(page, {
    'projects/a/index.md': '---\ntitle: Alpha\ntype: project\nactive: true\n---\n- [ ] Alpha job due:2999-01-01\n',
    'projects/b/index.md': '---\ntitle: Beta\ntype: project\nactive: true\n---\n- [ ] Beta job due:2999-01-01\n',
    'tasks/Shared.md': '---\ntitle: Shared job\nstatus: todo\nproject: [alpha, beta]\n---\n',
    'loose.md': '- [ ] Loose job\n',
  });
  await nav(page, 'Tasks').click();
  await expect(page.locator('.title')).toHaveText('All tasks');
  await expect(page.locator('.nav [aria-current="true"]')).toContainText('Tasks');
  for (const t of ['Alpha job', 'Beta job', 'Shared job', 'Loose job']) await expect(page.locator('.hub-content')).toContainText(t);
  await page.locator('#hub-group').selectOption('project');
  await expect(page.locator('.hub-group .grp', { hasText: 'Alpha' })).toBeVisible();
  await expect(page.locator('.hub-group .grp', { hasText: 'No project' })).toBeVisible();
  await page.locator('.hub-content li.task .t', { hasText: 'Loose job' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
});

test('the Tasks tab adds a task from one line, like Home, and it shows up in the list', async ({ page }) => {
  await page.goto('/');
  const dir = await openVault(page, { 'projects/a/index.md': '---\ntitle: Alpha\ntype: project\nactive: true\n---\n' });
  await nav(page, 'Tasks').click();
  await page.locator('#quick-text').fill('Call Dana +Alpha @dana due:2999-01-01');
  await expect(page.locator('#quick-preview')).toContainText('Call Dana');
  await page.locator('#quick-text').press('Enter');
  await expect.poll(async () => (await listFiles(page, dir)).filter((f) => f.startsWith('projects/a/tasks/')).length).toBe(1);
  await expect(page.locator('.hub-content')).toContainText('Call Dana');
  await expect(page.locator('#quick-text')).toHaveValue('');
});

test('Export CSV and JSON on the Tasks tab download what the filters show', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '- [ ] First job due:2999-01-01 #x\n- [ ] Second job\n' });
  await nav(page, 'Tasks').click();
  await openHubTools(page);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^tasks-all-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = (await readStream(csv)).replace(/^﻿/, '');
  expect(text.split('\r\n')[0]).toBe('title,status,due,created,project,people,tags,phase,file,line');
  expect(text).toContain('First job');
  expect(text).toContain('Second job');
  await page.locator('#hub-q').fill('First');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const rows = JSON.parse(await readStream(json)) as { title: string }[];
  expect(rows.map((r) => r.title)).toEqual(['First job']);
});

async function readStream(d: import('@playwright/test').Download): Promise<string> {
  const stream = await d.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test('the Tasks tab shows the open count, and each number on a hub opens what it counts', async ({ page }) => {
  await page.goto('/');
  await openVault(page, {
    'projects/a/index.md': '---\ntitle: Alpha\ntype: project\nactive: true\n---\n- [ ] Late one due:2020-01-01\n- [ ] Fine one\n- [x] Finished one\n',
  });
  await expect(page.locator('.nav [data-nav="tasks"] .badge')).toHaveText('2');
  await nav(page, 'Tasks').click();
  await page.getByRole('button', { name: /Show the 1 overdue/ }).click();
  await expect(page.locator('.hub-content li.task')).toHaveCount(1);
  await expect(page.locator('.hub-content')).toContainText('Late one');
  await page.getByRole('button', { name: /Show the 1 done/ }).click();
  await expect(page.locator('.hub-content li.task')).toHaveCount(1);
  await expect(page.locator('.hub-content')).toContainText('Finished one');
  await page.getByRole('button', { name: /Show the 2 open/ }).click();
  await expect(page.locator('.hub-content li.task')).toHaveCount(2);
  // One box per task, until Select tasks is on.
  await expect(page.locator('.hub-content li.task .selbox').first()).toBeHidden();
  await page.getByRole('button', { name: /Show the \d+ notes/ }).click();
  await expect(page.locator('.tab.on')).toContainText('Notes');
});

test('closing out with the folder move off changes only the project note', async ({ page }) => {
  await page.goto('/');
  const PROJ = '---\ntitle: Weekend\ntype: project\nactive: true\n---\n- [x] Everything done\n';
  const dir = await openVault(page, {
    'projects/weekend/index.md': PROJ,
    'projects/other/index.md': '---\ntitle: Other\ntype: project\nactive: true\n---\n- [ ] Other job\n',
    'projects/weekend/tasks/Leftover.md': '---\ntitle: Leftover\nstatus: todo\nproject: weekend\n---\n',
  });
  await nav(page, 'Projects').click();
  await page.locator('.pcard .pbtn', { hasText: 'Weekend' }).click();
  await expect(page.locator('.hub-main .meta')).toContainText('Active');
  await page.getByRole('button', { name: 'Close out', exact: true }).first().click();
  await expect(page.getByRole('group', { name: 'Close out this project' })).toContainText('1 open task');
  await page.getByLabel(/Also move the project folder/).uncheck();
  await page.getByRole('button', { name: 'Close out', exact: true }).last().click();
  await expect.poll(() => readFileOrEmpty(page, dir, 'projects/weekend/index.md')).toContain('active: false');
  const closed = await readFile(page, dir, 'projects/weekend/index.md');
  expect(closed).toBe(PROJ.replace('active: true\n', 'active: false\ncompleted: ' + new Date().toLocaleDateString('en-CA') + '\n'));
  expect(await readFile(page, dir, 'projects/weekend/tasks/Leftover.md')).toBe('---\ntitle: Leftover\nstatus: todo\nproject: weekend\n---\n');
  await expect(page.locator('.hub-main .meta')).toContainText('Archived');
  await expect(page.locator('.hub-main .notice', { hasText: 'Archived.' })).toBeVisible();
  // The Archive: out of the Tasks tab, and under Archived on the Projects screen.
  await nav(page, 'Tasks').click();
  await expect(page.locator('.hub-content')).toContainText('Other job');
  await expect(page.locator('.hub-content')).not.toContainText('Leftover');
  await nav(page, 'Projects').click();
  await page.getByRole('button', { name: 'All projects' }).first().click();
  await expect(page.getByRole('heading', { name: /^Archived/ })).toBeVisible();
  await page.locator('.pcard.off .pbtn', { hasText: 'Weekend' }).click();
  await page.getByRole('button', { name: 'Reopen' }).first().click();
  await expect.poll(() => readFileOrEmpty(page, dir, 'projects/weekend/index.md')).toBe(PROJ);
});

test('closing out can move the project folder to archive/ with every link updated, and reopening moves it back', async ({ page }) => {
  await page.goto('/');
  const FILES: Record<string, string> = {
    'projects/weekend/index.md': '---\ntitle: Weekend\ntype: project\nactive: true\n---\n![logo](../../_attachments/logo.png)\n- [x] Done thing\n',
    'projects/weekend/Plan.md': 'See [index](index.md).\n',
    'people/ada.md': 'Works on [[projects/weekend/Plan]] and [the project](../projects/weekend/index.md).\n',
  };
  const dir = await openVault(page, FILES);
  await nav(page, 'Projects').click();
  await page.locator('.pcard .pbtn', { hasText: 'Weekend' }).click();
  await page.getByRole('button', { name: 'Close out', exact: true }).first().click();
  const box = page.getByRole('group', { name: 'Close out this project' });
  await expect(box.locator('#close-to')).toHaveValue('archive/weekend');
  await expect(box.locator('#close-preview')).toContainText('2 files will move to archive/weekend');
  await expect(box.locator('#close-preview')).toContainText('1 link line in 1 note');
  await box.locator('#close-to').fill('archive/weekend-2026');
  await expect(box.locator('#close-preview')).toContainText('archive/weekend-2026');
  await box.getByRole('button', { name: 'Close out', exact: true }).click();
  await expect.poll(() => listFiles(page, dir)).toContain('archive/weekend-2026/Plan.md');
  const files = await listFiles(page, dir);
  expect(files.filter((f) => f.startsWith('projects/weekend'))).toEqual([]);
  expect(await readFile(page, dir, 'archive/weekend-2026/index.md')).toContain('active: false');
  expect(await readFile(page, dir, 'archive/weekend-2026/Plan.md')).toBe(FILES['projects/weekend/Plan.md']);
  expect(await readFile(page, dir, 'people/ada.md')).toBe('Works on [[archive/weekend-2026/Plan]] and [the project](../archive/weekend-2026/index.md).\n');
  // The page keeps showing the project at its new place.
  await expect(page.locator('.hub-main .meta')).toContainText('Archived');
  // Reopen offers to move it back.
  await page.getByRole('button', { name: 'Reopen', exact: true }).first().click();
  const back = page.getByRole('group', { name: 'Reopen this project' });
  await expect(back.locator('#reopen-to')).toHaveValue('projects/weekend-2026');
  await back.locator('#reopen-to').fill('projects/weekend');
  await back.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect.poll(() => listFiles(page, dir)).toContain('projects/weekend/Plan.md');
  for (const [p, text] of Object.entries(FILES)) {
    if (p === 'projects/weekend/index.md') continue; // active: true again, completed removed: compared below
    expect(await readFile(page, dir, p), p).toBe(text);
  }
  expect(await readFile(page, dir, 'projects/weekend/index.md')).toBe(FILES['projects/weekend/index.md']);
  expect((await listFiles(page, dir)).filter((f) => f.startsWith('archive/'))).toEqual([]);
});
