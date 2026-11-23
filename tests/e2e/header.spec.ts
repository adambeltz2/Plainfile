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
    await page.locator('h1').click(); // away from the menu
    await expect(page.locator('.nav-menu')).toHaveCount(0);
    await more.click();
    await page.locator('.nav-menu').getByRole('menuitem', { name: 'Calendar' }).click();
    await expect(page.locator('.nav-menu')).toHaveCount(0);
    await expect(more).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.cal-bar')).toBeVisible();
  });
});

test('on a phone the open task count is on Tasks in the More sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openVault(page, { 'a.md': '- [ ] One\n- [ ] Two\n- [x] Done\n' }, true, 'home');
  await page.locator('.tabbar').getByRole('button', { name: /^More/ }).click();
  await expect(
    page
      .locator('.more-sheet')
      .getByRole('button', { name: /^Tasks/ })
      .locator('.badge'),
  ).toHaveText('2');
});

test('the header has one ⋯ folder menu instead of two buttons, and More says what its number is', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await openVault(page, { 'a.md': 'See [[Nowhere]].\n' }); // a broken link, so Vault health has something to say
  await expect(page.getByRole('button', { name: 'Rescan', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open folder', exact: true })).toHaveCount(0);
  const menu = page.getByRole('button', { name: 'Folder actions' });
  await menu.click();
  await expect(page.getByRole('menuitem', { name: /Check for changes/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Open another folder/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: /Check for changes/ })).toHaveCount(0);
  await menu.click();
  await page.locator('h1').click(); // a click elsewhere closes it too
  await expect(page.getByRole('menuitem', { name: /Check for changes/ })).toHaveCount(0);
  await expect(page.locator('.nav-more .badge')).toHaveAttribute('title', /to look at in Vault health/);
});
