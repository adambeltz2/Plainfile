import { expect, test } from '@playwright/test';
import { nav, openVault } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Recent lists notes newest first and filters them', async ({ page }) => {
  await openVault(page, { 'alpha.md': '# Alpha\n', 'notes/beta.md': '# Beta\n' }, true, 'today');
  await nav(page, 'Recent').click();
  await expect(page.locator('.title')).toHaveText('Recent');
  await expect(page.locator('.recent-group h3').first()).toHaveText('Today');
  await expect(page.locator('.recent-group .item')).toHaveCount(2);
  await page.locator('#recent-q').fill('beta');
  await expect(page.locator('.recent-group .item')).toHaveCount(1);
  await expect(page.locator('.recent-group .item')).toContainText('notes/beta.md');
  await page.locator('.recent-group .item').click();
  await expect(page.locator('.title')).toContainText('Beta');
});
