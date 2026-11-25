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
  test('a markdown table is drawn as a table with its alignment, and looking at it changes nothing', async ({ page }) => {
    const text = `---\ntitle: Supplies\n---\nBefore\n\n${TABLE}\n\nAfter\n`;
    const dir = await openVault(page, { 'supplies.md': text });
    await open(page, 'Supplies');
    const grid = page.locator('.cm-table table');
    await expect(grid).toBeVisible();
    await expect(grid.locator('th')).toContainText(['Name', 'Qty']);
    await expect(grid.locator('tbody tr')).toHaveCount(2);
    await expect(grid.locator('tbody tr').first().locator('td').nth(1)).toHaveCSS('text-align', 'right');
    await page.locator('.cm-table .cv', { hasText: 'Pens' }).click();
    await expect(page.locator('.cm-table textarea')).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await readFile(page, dir, 'supplies.md')).toBe(text);
  });

  test('click a cell and type: only that line of the file changes, and a row you did not touch keeps its own text', async ({ page }) => {
    const padded = '| Name     | Qty |\n| :------- | --: |\n| Pens     |   3 |\n| Ink      |   1 |';
    const dir = await openVault(page, { 'supplies.md': `---\ntitle: Supplies\n---\n${padded}\n\nAfter\n` });
    await open(page, 'Supplies');
    await page.locator('.cm-table .cv', { hasText: 'Pens' }).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Pencils');
    await page.keyboard.press('Tab');
    await expect.poll(() => readFile(page, dir, 'supplies.md')).toContain('| Pencils | 3 |');
    expect(await readFile(page, dir, 'supplies.md')).toBe(
      `---\ntitle: Supplies\n---\n| Name     | Qty |\n| :------- | --: |\n| Pencils | 3 |\n| Ink      |   1 |\n\nAfter\n`,
    );
    await expect(page.locator('.cm-table textarea')).toHaveValue('3'); // Tab moved to the next cell
  });

  test('Tab in the last cell and Enter in the last row each add a row; Escape leaves; Undo takes it back', async ({ page }) => {
    const dir = await openVault(page, { 'supplies.md': `---\ntitle: Supplies\n---\n${TABLE}\n` });
    await open(page, 'Supplies');
    await page.locator('.cm-table .cv', { hasText: 'Ink' }).click(); // row 2, column 1
    await page.keyboard.press('Tab'); // the last cell
    await page.keyboard.press('Tab'); // past it: a new row
    await expect(page.locator('.cm-table tbody tr')).toHaveCount(3);
    await page.keyboard.type('Tape');
    await page.keyboard.press('Enter'); // the last row: another new row
    await expect(page.locator('.cm-table tbody tr')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect.poll(() => readFile(page, dir, 'supplies.md')).toBe(`---\ntitle: Supplies\n---\n${TABLE}\n| Tape |  |\n|  |  |\n`);
    await page.locator('.cm-content').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect(page.locator('.cm-table tbody tr')).toHaveCount(3);
  });

  test('the toolbar adds and deletes rows and columns and aligns a column, writing the markdown', async ({ page }) => {
    const dir = await openVault(page, { 'supplies.md': `---\ntitle: Supplies\n---\n${TABLE}\n` });
    await open(page, 'Supplies');
    await expect(page.locator('.cm-table .tb')).toBeHidden();
    await page.locator('.cm-table .cv', { hasText: 'Pens' }).click();
    await expect(page.locator('.cm-table .tb')).toBeVisible();
    await page.getByRole('button', { name: 'Add a row below' }).click();
    await page.getByRole('button', { name: 'Add a column to the right' }).click();
    await page.getByRole('button', { name: 'Align this column center' }).click();
    await expect
      .poll(() => readFile(page, dir, 'supplies.md'))
      .toBe('---\ntitle: Supplies\n---\n| Name | Column 3 | Qty |\n| :--- | :---: | ---: |\n| Pens |  | 3 |\n|  |  |  |\n| Ink |  | 1 |\n');
    await page.getByRole('button', { name: 'Delete this column' }).click();
    await page.getByRole('button', { name: 'Delete this row' }).click();
    await expect.poll(() => readFile(page, dir, 'supplies.md')).not.toContain('Column');
  });

  test('bold and other markdown in a cell: plain text while you edit, formatted when you leave, and written as typed', async ({ page }) => {
    const dir = await openVault(page, { 'supplies.md': `---\ntitle: Supplies\n---\n${TABLE}\n` });
    await open(page, 'Supplies');
    await page.locator('.cm-table .cv', { hasText: 'Pens' }).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Pens');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+b');
    await expect(page.locator('.cm-table textarea')).toHaveValue('**Pens**');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-table td .cv b', { hasText: 'Pens' })).toBeVisible();
    await expect.poll(() => readFile(page, dir, 'supplies.md')).toContain('| **Pens** | 3 |');
    await page.locator('.cm-table .cv', { hasText: 'Ink' }).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('a|b <br>c `x`');
    await page.keyboard.press('Escape');
    await expect.poll(() => readFile(page, dir, 'supplies.md')).toContain('| a\\|b <br>c `x` | 1 |');
    await expect(page.locator('.cm-table td .cv code', { hasText: 'x' })).toBeVisible();
  });

  test('Show markdown swaps the table for its lines, and a table with an extra cell stays text you edit as text', async ({ page }) => {
    await openVault(page, { 'a.md': `---\ntitle: A\n---\n${TABLE}\n\n| x | y |\n| --- | --- |\n| 1 | 2 | 3 |\n` });
    await open(page, 'A');
    await expect(page.locator('.cm-table')).toHaveCount(2);
    await page.locator('.cm-table').first().locator('.cv', { hasText: 'Pens' }).click();
    await page.getByRole('button', { name: 'Show this table as markdown' }).click();
    await expect(page.locator('.cm-table')).toHaveCount(1);
    await expect(page.locator('.cm-content')).toContainText('| Pens | 3 |');
    await page.locator('.cm-table').last().click(); // the other table cannot be edited cell by cell without losing the 3
    await expect(page.locator('.cm-table')).toHaveCount(1); // only the first, drawn again now the caret has left it
    await expect(page.locator('.cm-content')).toContainText('| 1 | 2 | 3 |');
  });

  test('/table asks how big, makes the table, and puts the caret in the first heading', async ({ page }) => {
    const dir = await openVault(page, { 'draft.md': 'Draft' });
    await open(page, 'draft');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n/ta');
    await expect(page.locator('.cm-tooltip-autocomplete li', { hasText: '/table' })).toBeVisible();
    await page.waitForTimeout(350);
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog', { name: 'Insert a table' });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('3 × 3');
    await picker.getByLabel('Columns').fill('2');
    await picker.getByLabel('Rows').fill('2');
    await expect(picker).toContainText('2 × 2');
    await picker.getByRole('button', { name: 'Insert' }).click();
    await expect(page.locator('.cm-table table')).toBeVisible();
    await expect(page.locator('.cm-table textarea')).toBeFocused();
    await expect(page.locator('.cm-table textarea')).toHaveValue('Column 1');
    await page.keyboard.type('Item'); // the heading text was selected, so typing replaces it
    await page.keyboard.press('Tab');
    await page.keyboard.type('Owner');
    await page.keyboard.press('Escape');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe('Draft\n| Item | Owner |\n| --- | --- |\n|  |  |\n|  |  |\n');
  });

  test('Cancel on the size picker takes the typed command away and makes nothing', async ({ page }) => {
    const dir = await openVault(page, { 'draft.md': 'Draft' });
    await open(page, 'draft');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n/ta');
    await page.waitForTimeout(350);
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Insert a table' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.cm-table')).toHaveCount(0);
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe('Draft\n');
  });

  test('a [[link]] in a cell opens the note', async ({ page }) => {
    await openVault(page, {
      'a.md': `---\ntitle: Alpha\n---\n| Name | Note |\n| --- | --- |\n| Pens | see [[Target]] |\n`,
      'target.md': '---\ntitle: Target\n---\nHello\n',
    });
    await open(page, 'Alpha');
    await page.locator('.cm-table a.wl', { hasText: 'Target' }).click();
    await expect(page.locator('.ed-head .title')).toHaveValue('Target');
  });

  test('on a phone a table is edited the same way, with no sideways page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'a.md': `---\ntitle: Alpha\n---\n${TABLE}\n` });
    await open(page, 'Alpha');
    await page.locator('.cm-table .cv', { hasText: 'Pens' }).click();
    await page.keyboard.type('s');
    await expect(page.locator('.cm-table .tb')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('a table in a code block or frontmatter stays as text', async ({ page }) => {
    await openVault(page, { 'c.md': `---\ntitle: Code\n---\n\`\`\`\n${TABLE}\n\`\`\`\n` });
    await open(page, 'Code');
    await expect(page.locator('.cm-table')).toHaveCount(0);
  });
});
