import { expect, test } from '@playwright/test';
import { nav, noteItem, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TABLE = '| Name | Qty |\n| :-- | --: |\n| Pens | 3 |\n| Ink | 1 |';

async function open(page: import('@playwright/test').Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await (await noteItem(page, title)).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('tables', () => {
  test('a markdown table is drawn as a table, and clicking it shows the markdown without changing the file', async ({ page }) => {
    const text = `---\ntitle: Supplies\n---\nBefore\n\n${TABLE}\n\nAfter\n`;
    const dir = await openVault(page, { 'supplies.md': text });
    await open(page, 'Supplies');
    const grid = page.locator('.cm-table table');
    await expect(grid).toBeVisible();
    await expect(grid.locator('th')).toHaveText(['Name', 'Qty']);
    await expect(grid.locator('tbody tr')).toHaveCount(2);
    await expect(grid.locator('tbody tr').first().locator('td').nth(1)).toHaveCSS('text-align', 'right');
    await page.locator('.cm-table').click();
    await expect(page.locator('.cm-table')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('| Pens | 3 |');
    expect(await readFile(page, dir, 'supplies.md')).toBe(text);
  });

  test('the Enter key opens a focused table for editing', async ({ page }) => {
    await openVault(page, { 'supplies.md': `---\ntitle: Supplies\n---\n${TABLE}\n` });
    await open(page, 'Supplies');
    await page.locator('.cm-table').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-table')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('| Name | Qty |');
  });

  test('/table at the start of a line inserts a starter table with its first heading selected', async ({ page }) => {
    const dir = await openVault(page, { 'draft.md': 'Draft' });
    await open(page, 'draft');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n/ta');
    await expect(page.locator('.cm-tooltip-autocomplete li', { hasText: '/table' })).toBeVisible();
    await page.waitForTimeout(350);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Item');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 })
      .toBe('Draft\n| Item | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
  });

  test('a table in a code block or frontmatter stays as text', async ({ page }) => {
    await openVault(page, { 'c.md': `---\ntitle: Code\n---\n\`\`\`\n${TABLE}\n\`\`\`\n` });
    await open(page, 'Code');
    await expect(page.locator('.cm-table')).toHaveCount(0);
  });
});
