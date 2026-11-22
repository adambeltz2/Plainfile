import { expect, test } from '@playwright/test';
import { openVault } from './helpers';

test('the footer opens What is new, by version without dates, and links to GitHub', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '# A\n' });
  const foot = page.locator('.foot');
  await expect(foot.getByRole('link', { name: 'GitHub' })).toHaveAttribute('target', '_blank');
  await foot.getByRole('button', { name: 'What is new' }).click();
  await expect(page.locator('.title')).toHaveText('What is new');
  await expect(page.locator('.changelog h2, .changelog h1').nth(1)).toContainText(/^\d+\.\d+\.\d+$/);
  expect(await page.locator('.changelog h2:not(.title), .changelog h1').allInnerTexts()).not.toContain(expect.stringMatching(/\d{4}-\d{2}-\d{2}/));
  await expect(page.locator('.changelog a[href*="silverbullet"]')).toHaveAttribute('target', '_blank');
  await expect(page.locator('.changelog a', { hasText: 'Full change log on GitHub' })).toHaveAttribute('target', '_blank');
});
