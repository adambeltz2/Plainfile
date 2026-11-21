import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openVault, nav } from './helpers';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('footer', () => {
  test('shows the app version on the first screen and in the app, with links that open in a new tab', async ({ page }) => {
    await expect(page.locator('.foot')).toContainText(`Plainfile v${version}`);
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await expect(page.locator('.foot')).toContainText(`Plainfile v${version}`);
    for (const a of await page.locator('.foot a').all()) {
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /noopener/);
    }
    await expect(page.locator('.foot').getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', /Simple-Productivity/);
  });
});

test.describe('cheat sheet', () => {
  test('opens from the ? button and the footer, with copyable examples', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await page.getByRole('button', { name: 'Syntax cheat sheet' }).click();
    await expect(page.getByRole('heading', { name: 'Cheat sheet' })).toBeVisible();
    await expect(page.locator('#ex-tags')).toContainText('tags: [launch, meeting]');
    await expect(page.locator('#ex-task')).toContainText('- [ ] Send logo files @dana #launch due:2026-11-23 created:2026-11-21');
    await page.locator('[data-copy="task"]').click();
    await expect(page.locator('[data-copy="task"]')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('- [ ] Send logo files @dana #launch due:2026-11-23 created:2026-11-21\n- [x] Share staging link');
    await page.locator('.nav').getByRole('button', { name: 'Today' }).click();
    await page.locator('.foot').getByRole('button', { name: 'Cheat sheet' }).click();
    await expect(page.getByRole('heading', { name: 'Cheat sheet' })).toBeVisible();
  });

  test('the section buttons jump to that section', async ({ page }) => {
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await page.getByRole('button', { name: 'Syntax cheat sheet' }).click();
    await page.locator('.toc').getByRole('button', { name: 'Quick keys' }).click();
    await expect(page.locator('#sec-shortcuts')).toContainText('Ctrl/Cmd + Shift + M');
    await page.locator('.toc').getByRole('button', { name: 'Templates' }).click();
    await expect(page.locator('#sec-templates')).toBeInViewport();
  });

  test('shows your own tags as a cloud and the frontmatter keys your notes use', async ({ page }) => {
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await page.getByRole('button', { name: 'Syntax cheat sheet' }).click();
    await expect(page.locator('.cloud-tag', { hasText: '#launch' })).toBeVisible();
    const row = page.locator('#sec-vault tr', { has: page.locator('td', { hasText: /^status$/ }) });
    await expect(row).toContainText('todo');
    await expect(row).toContainText('yes');
    await page.locator('.cloud-tag', { hasText: '#launch' }).click();
    await expect(page.locator('#search-q')).toHaveValue('tag:launch');
    await expect(page.locator('#search-results .res').first()).toBeVisible();
  });

  test('says so when there are no tags or frontmatter, and fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'a.md': 'plain note' });
    await nav(page, 'Cheat sheet').click(); // on a phone it is under More
    await expect(page.locator('#sec-vault')).toContainText('No tags yet');
    await expect(page.locator('#sec-vault')).toContainText('None of your notes have frontmatter yet');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
