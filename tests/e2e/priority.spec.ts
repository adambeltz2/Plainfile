import { expect, test } from '@playwright/test';
import { nav, noteItem, openVault, readFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function open(page: import('@playwright/test').Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await (await noteItem(page, title)).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('priority in Properties', () => {
  test('+ Priority adds it, the list changes it, and None removes only that line', async ({ page }) => {
    const dir = await openVault(page, { 't.md': '---\ntitle: Call Dana\nstatus: todo\n---\nBody\n' });
    await open(page, 'Call Dana');
    await page.getByRole('button', { name: '+ Priority' }).click();
    const sel = page.locator('#prop-priority');
    await expect(sel).toHaveValue('A');
    await expect(sel.locator('option')).toHaveText(['None', 'A', 'B', 'C']);
    await sel.selectOption('B');
    await expect.poll(() => readFile(page, dir, 't.md')).toBe('---\ntitle: Call Dana\nstatus: todo\npriority: B\n---\nBody\n');
    await sel.selectOption('');
    await expect.poll(() => readFile(page, dir, 't.md')).toBe('---\ntitle: Call Dana\nstatus: todo\n---\nBody\n');
    await expect(page.getByRole('button', { name: '+ Priority' })).toBeVisible();
  });

  test('a letter already in the note beyond C is kept in the list', async ({ page }) => {
    await openVault(page, { 't.md': '---\ntitle: Odd\npriority: E\n---\nBody\n' });
    await open(page, 'Odd');
    await expect(page.locator('#prop-priority')).toHaveValue('E');
    await expect(page.locator('#prop-priority option')).toHaveText(['None', 'A', 'B', 'C', 'E']);
  });
});
