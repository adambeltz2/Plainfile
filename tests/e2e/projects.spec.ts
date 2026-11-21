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

test.describe('quick add: created date, tags and people', () => {
  test('has placeholders for tags and people, and writes the created date', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await expect(page.locator('#quick-people')).toHaveAttribute('placeholder', '@people');
    await expect(page.locator('#quick-tags')).toHaveAttribute('placeholder', '#tags');
    await page.locator('#quick-text').fill('Call Dana');
    await page.locator('#quick-people').fill('dana, @sam');
    await page.locator('#quick-tags').fill('#launch home');
    await page.locator('#quick-due').fill(TODAY());
    await page.locator('#quick-text').press('Enter');
    const line = `- [ ] Call Dana @dana @sam #launch #home due:${TODAY()} created:${TODAY()}`;
    await expect(page.locator('.diff .add')).toHaveText(`+${line}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toBe(`# Inbox\n\n${line}\n`);
    const row = page.locator('.task', { hasText: 'Call Dana' });
    await expect(row).toContainText('@dana');
    await expect(row).toContainText('#launch');
    await expect(row).toContainText('added');
  });

  test('the fields are cleared after adding, so the next task does not inherit them', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.locator('#quick-text').fill('One');
    await page.locator('#quick-people').fill('dana');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toContainText('@dana');
    await page.locator('#quick-text').fill('Two');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toHaveText(`+- [ ] Two created:${TODAY()}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toContain(`- [ ] Two created:${TODAY()}\n`);
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
  test('is labelled, wide enough to see on a phone, and has Today, Tomorrow and Next week buttons', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await expect(page.locator('.datefield')).toContainText('Due');
    const box = await page.locator('#quick-due').boundingBox();
    expect(box!.width).toBeGreaterThan(110);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Tomorrow' }).click();
    await expect(page.locator('#quick-due')).toHaveValue(localDate(1));
    await expect(page.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#quick-text').fill('Pay invoice');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toContainText(`due:${localDate(1)}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toContain(`- [ ] Pay invoice due:${localDate(1)} created:${localDate(0)}`);
    // Pressing the same pick again clears it, and the field is empty for the next task.
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.locator('#quick-due')).toHaveValue(localDate(7));
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.locator('#quick-due')).toHaveValue('');
  });

  test('the New task form has the same picks', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Task\b/ }).filter({ hasText: 'Add a line to your Inbox' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Today' }).click();
    await expect(page.locator('#new-task-due')).toHaveValue(localDate(0));
  });
});
