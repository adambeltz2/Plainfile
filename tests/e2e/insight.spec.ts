import { expect, test } from '@playwright/test';
import { localDate, nav, openVault, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const card = (page: import('@playwright/test').Page, heading: string) => page.locator('.home-card').filter({ has: page.locator('h3', { hasText: new RegExp(`^${heading}`) }) });

const FILES: Record<string, string> = {
  'projects/a.md': '---\ntitle: A\ntags: [launch, pricing]\ncreated: ' + localDate(0) + '\n---\n- [ ] Late @dana due:2020-01-01 created:' + localDate(0) + '\n- [x] Done thing\n',
  'projects/b.md': '---\ntitle: B\ntags: [launch]\n---\nSee [[A]]',
  'tasks/Messy.md': '---\ntitle: Messy\nstatus: In Progress\ndeadline: Nov 23 2026\n---\n',
  'people/dana.md': '---\ntitle: Dana\ntype: person\n---\n',
  'loose.md': 'a note',
};

test.describe('Insight', () => {
  test('shows activity, this month, topics, people, folders and health from the files', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Insight').click();
    await expect(page.locator('.title')).toHaveText('Insight');
    await expect(page.locator('.heat-col')).toHaveCount(26);
    await expect(page.locator('.heat-col').first().locator('i')).toHaveCount(7);
    await expect(page.locator('.heat i.lv3').first()).toBeVisible(); // today's files were all just written
    await expect(card(page, 'Activity')).toContainText('notes changed on 1 day');
    const month = card(page, 'This month');
    await expect(month).toContainText('Notes changed');
    await expect(month.locator('tr', { hasText: 'Overdue' })).toContainText('1');
    await expect(page.locator('.cloud-tag', { hasText: '#launch' })).toContainText('2');
    await expect(card(page, 'People')).toContainText('Dana');
    await expect(card(page, 'Folders')).toContainText('projects');
    await expect(card(page, 'Health')).toContainText('Fields to tidy');
  });

  test('topics lead to a search, people to their page, and the tidy list fixes notes one line at a time', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Insight').click();
    await card(page, 'People').getByRole('button', { name: /Dana/ }).click();
    await expect(page.locator('.title')).toHaveText('Dana');
    await nav(page, 'Insight').click();
    await page.getByRole('button', { name: 'Review fields to tidy' }).click();
    await expect(page.locator('.tidy')).toContainText('status: In Progress → status: doing');
    await page.getByRole('button', { name: /Fix all/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Messy.md')).toBe('---\ntitle: Messy\nstatus: doing\ndue: 2026-11-23\n---\n');
    await expect(card(page, 'Health').locator('tr', { hasText: 'Fields to tidy' })).toContainText('0');
    await page.locator('.cloud-tag', { hasText: '#pricing' }).click();
    await expect(page.locator('#search-q')).toHaveValue('tag:pricing');
  });

  test('fits a phone, and it is under More', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, FILES);
    await nav(page, 'Insight').click();
    await expect(page.locator('.heat')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
