import { expect, test, type Page } from '@playwright/test';
import { localDate, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TODAY = () => localDate(0);
const nav = (page: Page, name: RegExp | string) => page.locator('.nav').getByRole('button', { name });

async function newProject(page: Page, name: string, goal = ''): Promise<void> {
  await page.getByRole('button', { name: '+ New' }).click();
  await page.locator('.modal').getByRole('button', { name: /^Project/ }).click();
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
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Here is a task.md')).toBe(`---\ntitle: Here is a task\nstatus: todo\ndue: ${localDate(1)}\ncreated: ${TODAY()}\ntags: [launch]\npeople: [Adam]\n---\n\n`);
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
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/site/tasks/Send logos.md')).toBe(`---\ntitle: Send logos\nstatus: todo\ndue: ${TODAY()}\ncreated: ${TODAY()}\nproject: site\ntags: []\npeople: [Adam]\n---\n\n`);
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
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Write launch email.md')).toBe(`---\ntitle: Write launch email\nstatus: todo\ncreated: ${TODAY()}\ntags: []\npeople: []\n---\n\n`);
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
    await page.locator('.modal').getByRole('button', { name: /^Project/ }).click();
    await page.locator('#tpl-title').fill('Kitchen Remodel');
    await page.locator('#tpl-goal').fill('New cabinets');
    await expect(page.locator('#tpl-path')).toHaveText('projects/kitchen-remodel/index.md');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, 'projects/kitchen-remodel/index.md')).toBe(
      `---\ntitle: Kitchen Remodel\ntype: project\nactive: true\nsortOrder: 1\ncreated: ${TODAY()}\ntags: []\n---\n\n## Goal\nNew cabinets\n\n## Notes\n- \n\n## Tasks\n- [ ] \n`,
    );
    await nav(page, 'Today').click();
    await page.locator('.side').getByRole('button', { name: /^Projects/ }).click();
    await expect(page.locator('.pcard .pnum')).toHaveText('1');
    await expect(page.locator('.pcard .ptitle')).toHaveText('Kitchen Remodel');
    // The second project is number 2.
    await newProject(page, 'Taxes');
    await nav(page, 'Today').click();
    await page.locator('.side').getByRole('button', { name: /^Projects/ }).click();
    await expect(page.locator('.pcard .pnum')).toHaveText(['1', '2']);
  });

  test('a project card files a task and a note into the project, and the project page lists them', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await newProject(page, 'Kitchen Remodel');
    await nav(page, 'Today').click();
    await page.locator('.side').getByRole('button', { name: /^Projects/ }).click();

    await page.locator('.pcard').getByRole('button', { name: '+ Task' }).click();
    await page.locator('#tpl-title').fill('Order cabinets');
    await expect(page.locator('#tpl-path')).toHaveText('projects/kitchen-remodel/tasks/Order cabinets.md');
    await expect(page.locator('#tpl-preview')).toContainText('project: kitchen-remodel');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const task = await readFile(page, dir, 'projects/kitchen-remodel/tasks/Order cabinets.md');
    expect(task).toContain(`created: ${TODAY()}\nproject: kitchen-remodel\ntags: []\npeople: []`);

    await nav(page, 'Today').click();
    await page.locator('.side').getByRole('button', { name: /^Projects/ }).click();
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
    await page.locator('.side').getByRole('button', { name: /^Projects/ }).click();
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
    const d = new Date(); d.setDate(d.getDate() + 3);
    await expect(page.locator('.diff .add')).toContainText('title: Pay invoice');
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Pay invoice.md')).toContain(`due: ${localDate(3)}\ncreated: ${localDate(0)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('the New task form has the same picks', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Task\b/ }).filter({ hasText: 'A task with its own note' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Today' }).click();
    await expect(page.locator('#new-task-due')).toHaveValue(localDate(0));
  });
});

test.describe('default frontmatter', () => {
  test('a note without frontmatter gets a button that adds a starter block and keeps the text', async ({ page }) => {
    const dir = await openVault(page, { 'plain.md': '# Plain thing\n\nSome text.\n', 'has.md': '---\ntitle: Has\n---\nBody\n' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^has$|^Has$/ }).first().click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add default frontmatter' })).toHaveCount(0);
    await page.locator('.note-item', { hasText: 'Plain thing' }).click();
    await page.getByRole('button', { name: 'Add default frontmatter' }).click();
    await expect(page.getByRole('button', { name: 'Add default frontmatter' })).toHaveCount(0);
    await expect(page.locator('.props')).toContainText('Plain thing');
    await expect.poll(() => readFileOrEmpty(page, dir, 'plain.md'), { timeout: 4000 }).toBe(`---\ntitle: Plain thing\ncreated: ${TODAY()}\ntags: []\n---\n# Plain thing\n\nSome text.\n`);
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
    'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\nactive: true\ncreated: 2026-11-01\n---\n## Goal\nLaunch by Dec 8\n\n- [ ] Pick a host @sam due:2026-01-05\n- [x] Buy domain @dana\n- Ask legal about terms #followup\n',
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
    await expect(page.locator('.pprog')).toContainText('1 of 3 tasks done');
    await expect(page.locator('.grp.late')).toContainText('Overdue');
    await expect(page.locator('.psec', { hasText: 'Open tasks' })).toContainText('Pick a host');
    await expect(page.locator('.psec', { hasText: 'Open tasks' })).toContainText('Write copy');
    await expect(page.locator('.psec', { hasText: 'Open tasks' })).not.toContainText('Unrelated');
    await expect(page.locator('.psec', { hasText: 'Notes' }).first()).toContainText('Kickoff');
    await expect(page.locator('.psec', { hasText: 'Follow-ups' })).toContainText('Ask legal about terms');
    await expect(page.locator('.psec', { hasText: 'People' })).toContainText('@dana');
    await page.getByRole('button', { name: /Mark done: Pick a host/ }).click();
    await expect(page.locator('.plog .diff .add')).toContainText('- [x] Pick a host');
    expect(await readFile(page, dir, 'projects/site/index.md')).toContain('- [x] Pick a host @sam due:2026-01-05');
    await expect(page.locator('.task.done', { hasText: 'Pick a host' })).toBeVisible();
    await page.getByRole('button', { name: '← All projects' }).click();
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
    await expect(page.locator('.psec', { hasText: 'Notes' }).first()).toContainText('Brand ideas');
    await expect(page.locator('.psec', { hasText: 'Open tasks' })).toContainText('Pick fonts');

    await nav(page, 'Notes').click();
    await page.locator('.projchip', { hasText: 'kitchen' }).getByRole('button', { name: /Remove from kitchen/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 }).toContain('project: site\n');
    await page.locator('.projchip', { hasText: 'site' }).getByRole('button', { name: /Remove from site/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'ideas/Brand.md'), { timeout: 5000 }).toBe('---\ntitle: Brand ideas\n---\nLogo thoughts\n- [ ] Pick fonts due:2999-01-01\n');
  });

  test('the project chip opens that project’s dashboard', async ({ page }) => {
    await openVault(page, { ...FILES, 'ideas/Brand.md': '---\ntitle: Brand ideas\nproject: site\n---\nx\n' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Brand ideas$/ }).click();
    await page.locator('.projchip').getByRole('button', { name: 'site' }).first().click();
    await expect(page.locator('.title')).toHaveText('Website relaunch');
  });
});
