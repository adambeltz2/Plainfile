import { expect, test, type Page } from '@playwright/test';
import { localDate, openVault, readFile } from './helpers';

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
    const line = `- [ ] Here is a task @Adam #launch due:${localDate(1)} created:${TODAY()}`;
    await expect(page.locator('.diff .add')).toHaveText(`+${line}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toBe(`# Inbox\n\n${line}\n`);
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
    expect(await readFile(page, dir, 'projects/site/index.md')).toBe(`---\ntitle: Website relaunch\nactive: true\n---\nGoal.\n- [ ] Send logos @Adam due:${TODAY()} created:${TODAY()}\n`);
    await page.locator('#quick-text').fill('Nope +ghost');
    await expect(page.locator('#quick-preview')).toContainText('No project called "ghost"');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.notice.err')).toContainText('No project called "ghost"');
    await page.locator('#quick-text').fill('Later due:someday');
    await expect(page.locator('#quick-preview')).toContainText('Could not read "due:someday"');
  });

  test('a task file from the Task template starts with a created date and empty tags and people', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Task\b(?! file)/ }).filter({ hasText: 'One file per task' }).click();
    await page.locator('#tpl-title').fill('Write launch email');
    await expect(page.locator('#tpl-preview')).toContainText(`created: ${TODAY()}\ntags: []\npeople: []`);
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const text = await readFile(page, dir, 'tasks/Write launch email.md');
    expect(text).toContain(`status: todo\ndue: ${localDate(7)}\ncreated: ${TODAY()}\ntags: []\npeople: []`);
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
    await expect(page.locator('.diff .add')).toContainText('due:');
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toContain(`- [ ] Pay invoice due:${localDate(3)} created:${localDate(0)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('the New task form has the same picks', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Task\b/ }).filter({ hasText: 'Add a line to your Inbox' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Today' }).click();
    await expect(page.locator('#new-task-due')).toHaveValue(localDate(0));
  });
});
