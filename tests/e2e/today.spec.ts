import { expect, test } from '@playwright/test';
import { localDate, openVault, readFile, writeFileExternally, nav } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('landing offers a folder and the sample vault', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Plainfile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a folder' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the sample vault' })).toBeVisible();
});

test('sample vault shows Today grouped by overdue, today and this week', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.grp', { hasText: 'Overdue' })).toContainText('2');
  await expect(page.locator('.grp', { hasText: 'Due today' })).toContainText('2');
  await expect(page.locator('.grp', { hasText: 'This week' })).toContainText('3');
  await expect(page.getByText('File estimated tax payment')).toBeVisible();
  await expect(page.locator('.task.done')).toHaveCount(0);
});

test('ticking a task shows exactly what changed on disk and keeps it on screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await page.getByRole('button', { name: 'Mark done: Send logo files' }).click();
  const diff = page.locator('.diff');
  await expect(diff.locator('.del')).toHaveText('−- [ ] Send logo files @dana due:2026-11-23');
  await expect(diff.locator('.add')).toHaveText('+- [x] Send logo files @dana due:2026-11-23');
  await expect(page.locator('.task.done')).toHaveCount(1);
  await expect(page.locator('.ln.hi')).toContainText('- [x] Send logo files');
  // Undo it again.
  await page.getByRole('button', { name: 'Mark not done: Send logo files' }).click();
  await expect(page.locator('.task.done')).toHaveCount(0);
});

test('tag filter and All open view', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await page.getByRole('button', { name: /^All open/ }).click();
  await expect(page.locator('.grp', { hasText: 'No date' })).toHaveCount(0);
  await page.getByRole('button', { name: /^#admin/ }).click();
  await expect(page.locator('.task')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.locator('.task').first()).toBeVisible();
});

test('theme: Light, Dark and Auto work on the landing screen and in the app, and are remembered', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Color theme' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = () => page.locator('html').getAttribute('data-theme');

  // On the landing screen, before any folder is open.
  await page.emulateMedia({ colorScheme: 'light' });
  await group.getByRole('button', { name: 'Dark' }).click();
  expect(await attr()).toBe('dark');
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

  // It survives a reload and carries into the app.
  await page.reload();
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await group.getByRole('button', { name: 'Light' }).click();
  expect(await attr()).toBe('light');
  expect(await bg()).toBe('rgb(255, 255, 255)');

  // Auto follows the device, which here is set to dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await group.getByRole('button', { name: 'Auto' }).click();
  expect(await attr()).toBeNull();
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bg()).toBe('rgb(255, 255, 255)');
  await page.reload();
  expect(await attr()).toBeNull();
});

test('real folder: reads files, ticks one character, leaves everything else byte for byte', async ({ page }) => {
  const today = localDate(0);
  const late = localDate(-2);
  const text = `---\ntitle: Notes\n---\n\nSome   odd   spacing\r\n- [ ] Pay invoice due:${late} #admin\n- [ ] Call Dana due:${today}\n\ntrailing line`;
  const dir = await openVault(page, { 'notes/a.md': text });

  await expect(page.locator('.grp', { hasText: 'Overdue' })).toContainText('1');
  await expect(page.getByText('Call Dana')).toBeVisible();

  await page.getByRole('button', { name: 'Mark done: Call Dana' }).click();
  await expect(page.locator('.task.done')).toHaveCount(1);

  const after = await readFile(page, dir, 'notes/a.md');
  expect(after).toBe(text.replace('- [ ] Call Dana', '- [x] Call Dana'));
});

test('real folder: a file edited elsewhere is never overwritten', async ({ page }) => {
  const today = localDate(0);
  const dir = await openVault(page, { 'a.md': `- [ ] Original task due:${today}\n` });
  await expect(page.getByText('Original task')).toBeVisible();

  const edited = `- [ ] Edited somewhere else due:${today}\n`;
  await writeFileExternally(page, dir, 'a.md', edited);

  await page.getByRole('button', { name: 'Mark done: Original task' }).click();
  await expect(page.locator('.diff')).toContainText('nothing was written');
  expect(await readFile(page, dir, 'a.md')).toBe(edited);
  // The list was refreshed to match the file.
  await expect(page.getByText('Edited somewhere else')).toBeVisible();
});

test('real folder: Rescan picks up a new file', async ({ page }) => {
  const today = localDate(0);
  const dir = await openVault(page, { 'a.md': `- [ ] First due:${today}\n` });
  await expect(page.locator('.task')).toHaveCount(1);
  await page.evaluate(
    async ({ dir, text }) => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const w = await (await d.getFileHandle('b.md', { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    { dir, text: `- [ ] Second due:${today}\n` },
  );
  await page.getByRole('button', { name: 'Rescan' }).click();
  await expect(page.locator('.task')).toHaveCount(2);
});

test('works at phone width without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await expect(page.getByText('File estimated tax payment')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
