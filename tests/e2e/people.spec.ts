import { expect, test } from '@playwright/test';
import { localDate, nav, openVault, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const FILES: Record<string, string> = {
  'people/dana.md': '---\ntitle: Dana Ortiz\ntype: person\naliases: [Dana O]\ncompany: Northfield\n---\nBrand lead.\n',
  'a.md': `- [ ] Send logos @dana due:2020-01-01\n- [x] Old thing @dana\n- [ ] Call @sam due:${localDate(3)}\n`,
  'tasks/Wait.md': '---\ntitle: Review copy\nstatus: waiting\npeople: [Dana O]\ncreated: 2026-11-10\n---\n',
  'meetings/Kickoff.md': `---\ntitle: Kickoff\ndate: ${localDate(-4)}\nattendees: [dana, pat]\n---\nNotes\n`,
};

test.describe('People', () => {
  test('lists everyone from @mentions, people fields and person notes, joined by aliases, and sorts', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'People').click();
    const rows = page.locator('.portfolio tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Dana Ortiz'); // the most open tasks first
    await expect(rows.first().locator('td').nth(1)).toHaveText('2'); // Send logos, and the one she holds for Review copy
    await expect(rows.first().locator('.chip.late')).toHaveText('1');
    await expect(rows.filter({ hasText: 'sam' }).locator('.chip.quiet')).toHaveText('no note');
    await page.locator('.portfolio').getByRole('button', { name: /^Person/ }).click();
    await expect(rows.first()).toContainText('Dana Ortiz'); // A to Z
    await page.locator('.portfolio').getByRole('button', { name: /^Person/ }).click();
    await expect(rows.first()).toContainText('sam'); // Z to A
  });

  test('a person page has their open tasks (tick one), who you wait on, meetings and notes', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'People').click();
    await page.locator('.portfolio').getByRole('button', { name: 'Dana Ortiz' }).click();
    await expect(page.locator('.title')).toHaveText('Dana Ortiz');
    await expect(page.locator('.meta')).toContainText('Northfield');
    await expect(page.locator('.psec', { hasText: 'Open tasks' })).toContainText('Send logos');
    await expect(page.locator('.psec', { hasText: 'Waiting on' })).toContainText('Review copy');
    await expect(page.locator('.psec', { hasText: 'Meetings' })).toContainText('Kickoff');
    await expect(page.locator('.pstat').nth(1)).toContainText('1'); // overdue
    await page.getByRole('button', { name: /Mark done: Send logos/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toContain('- [x] Send logos @dana due:2020-01-01');
    await page.getByRole('button', { name: 'Open note' }).click();
    await expect(page.locator('.ed-head .title')).toHaveText('Dana Ortiz');
  });

  test('someone without a note can get one, starting from their name', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'People').click();
    await page.locator('.portfolio').getByRole('button', { name: 'sam' }).click();
    await page.getByRole('button', { name: 'Make a person note' }).click();
    await expect(page.locator('#tpl-title')).toHaveValue('Sam');
    await page.locator('.modal').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'All people' }).click();
    await expect(page.locator('.portfolio')).toBeVisible();
  });

  test('an empty vault explains how people appear, and the page fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'a.md': 'plain' });
    await nav(page, 'People').click();
    await expect(page.locator('.empty')).toContainText('@dana');
    await nav(page, 'Home').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
