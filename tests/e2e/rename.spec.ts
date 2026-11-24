import { expect, test, type Page } from '@playwright/test';
import { addFileExternally, listFiles, openVault, readFile, removeFileExternally, noteMenu, nav, noteItem, rescanApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('rename', () => {
  const VAULT = {
    'notes/pricing-research.md': '---\ntitle: Pricing research\n---\nBody.\n',
    'a.md': 'See [[pricing-research]] and [[people/dana]].\r\nTail',
    'b.md': 'Read [[pricing-research|the research]] today.\n',
    'people/dana.md': 'Dana',
  };

  async function startRename(page: Page): Promise<string> {
    const dir = await openVault(page, VAULT);
    await nav(page, 'Notes').click();
    await (await noteItem(page, 'Pricing research')).click();
    await noteMenu(page, /^Rename/);
    return dir;
  }

  test('previews every link, then renames the file and rewrites only those links', async ({ page }) => {
    const dir = await startRename(page);
    await page.locator('#rn-name').fill('pricing-analysis');
    await expect(page.locator('#rn-preview')).toContainText('2 links in 2 files will update');
    await expect(page.locator('#rn-preview')).toContainText('aliases: [pricing-research]');
    await page.getByRole('button', { name: 'Rename and update 2 links' }).click();
    await expect(page.locator('.notice.ok')).toContainText('Renamed to notes/pricing-analysis.md');

    expect(await listFiles(page, dir)).toEqual(['a.md', 'b.md', 'notes/pricing-analysis.md', 'people/dana.md']);
    expect(await readFile(page, dir, 'notes/pricing-analysis.md')).toBe('---\ntitle: Pricing research\naliases: [pricing-research]\n---\nBody.\n');
    expect(await readFile(page, dir, 'a.md')).toBe('See [[pricing-analysis]] and [[people/dana]].\r\nTail');
    expect(await readFile(page, dir, 'b.md')).toBe('Read [[pricing-analysis|the research]] today.\n');
    expect(await readFile(page, dir, 'people/dana.md')).toBe('Dana');

    await page.getByRole('button', { name: 'Open the renamed note' }).click();
    await expect(page.locator('.ed-head .title')).toHaveValue('Pricing research');
    await expect(page.locator('.ed-head .path')).toHaveText('notes/pricing-analysis.md');
  });

  test('an unchecked link is left alone, and the alias keeps it working', async ({ page }) => {
    const dir = await startRename(page);
    await page.locator('#rn-name').fill('pricing-analysis');
    await page.locator('[data-include="b.md:1"]').uncheck();
    await expect(page.locator('#rn-preview')).toContainText('1 link in 1 file will update');
    await expect(page.locator('#rn-preview')).toContainText('will keep working through the alias');
    await page.getByRole('button', { name: 'Rename and update 1 link' }).click();
    await expect(page.locator('.notice.ok')).toBeVisible();
    expect(await readFile(page, dir, 'b.md')).toBe(VAULT['b.md']);
  });

  test('refuses a name that is taken and says so', async ({ page }) => {
    await startRename(page);
    await page.locator('#rn-name').fill('pricing-research');
    await expect(page.locator('#rn-preview')).toContainText('current name');
    await page.locator('#rn-name').fill('');
    await expect(page.locator('#rn-preview')).toContainText('Type a new name');
  });

  test('a file renamed outside the app is detected and its links are fixed with one click', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    const content = VAULT['notes/pricing-research.md'];
    await removeFileExternally(page, dir, 'notes/pricing-research.md');
    await addFileExternally(page, dir, 'notes/pricing-analysis.md', content);
    await rescanApp(page);
    await expect(page.locator('.notice', { hasText: 'was renamed to' })).toBeVisible();
    await page.getByRole('button', { name: /^Review/ }).click();
    await expect(page.getByRole('button', { name: /^Renamed outside/ })).toContainText('1');
    await expect(page.locator('#rn-out')).toContainText('The text is identical');
    await page.getByRole('button', { name: /^Yes, it was renamed/ }).click();
    await expect(page.locator('.notice.ok')).toBeVisible();
    expect(await readFile(page, dir, 'a.md')).toBe('See [[pricing-analysis]] and [[people/dana.md]].\r\nTail'.replace('dana.md', 'dana'));
    expect(await readFile(page, dir, 'b.md')).toBe('Read [[pricing-analysis|the research]] today.\n');
    expect(await readFile(page, dir, 'notes/pricing-analysis.md')).toContain('aliases: [pricing-research]');
  });

  test('the Renamed outside tab is not offered when nothing was renamed outside', async ({ page }) => {
    await startRename(page);
    await expect(page.locator('#rn-name')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Renamed outside/ })).toHaveCount(0);
  });

  test('"No, different note" dismisses the banner and changes nothing', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await removeFileExternally(page, dir, 'notes/pricing-research.md');
    await addFileExternally(page, dir, 'notes/pricing-analysis.md', VAULT['notes/pricing-research.md']);
    await rescanApp(page);
    await page.getByRole('button', { name: /^Review/ }).click();
    await page.getByRole('button', { name: 'No, different note' }).click();
    await expect(page.locator('.notice', { hasText: 'was renamed to' })).toHaveCount(0);
    expect(await readFile(page, dir, 'a.md')).toBe(VAULT['a.md']);
  });
});

test('Rename fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Pricing research')).click();
  await noteMenu(page, /^Rename/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
