import { expect, test } from '@playwright/test';
import { openVault } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('the header on a wide screen', () => {
  test('shows the everyday tabs, with the rest under More', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' }, true, 'home');
    const nav = page.locator('.nav');
    for (const t of ['Home', 'Today', 'Tasks', 'Projects', 'Notes', 'Search']) await expect(nav.getByRole('button', { name: t, exact: true })).toBeVisible();
    for (const t of ['Calendar', 'People', 'Board', 'Recent', 'Insight']) await expect(nav.getByRole('button', { name: t, exact: true })).toHaveCount(0);
  });

  test('More opens a menu, goes to a screen, marks it current, and closes on Escape or an outside click', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' }, true, 'home');
    const more = page.locator('.nav-more');
    await more.click();
    await expect(page.locator('.nav-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nav-menu')).toHaveCount(0);
    await more.click();
    await page.locator('.title, .home').first().click();
    await expect(page.locator('.nav-menu')).toHaveCount(0);
    await more.click();
    await page.locator('.nav-menu').getByRole('menuitem', { name: 'Calendar' }).click();
    await expect(page.locator('.nav-menu')).toHaveCount(0);
    await expect(more).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.cal-bar')).toBeVisible();
  });
});
