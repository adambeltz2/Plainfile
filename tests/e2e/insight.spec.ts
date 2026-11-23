import { expect, test } from '@playwright/test';
import { localDate, nav, openVault, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const card = (page: import('@playwright/test').Page, heading: string) =>
  page.locator('.home-card').filter({ has: page.locator('h3', { hasText: new RegExp(`^${heading}`) }) });

const FILES: Record<string, string> = {
  'projects/a.md':
    '---\ntitle: A\ntags: [launch, pricing]\ncreated: ' +
    localDate(0) +
    '\n---\n- [ ] Late @dana due:2020-01-01 created:' +
    localDate(0) +
    '\n- [x] Done thing\n',
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
    await expect(page.locator('.heat-col').first().locator('i, button')).toHaveCount(7);
    await expect(page.locator('.heat .lv3').first()).toBeVisible(); // today's files were all just written
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

test('a number on Insight opens the notes or tasks behind it', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '- [ ] Late one due:2020-01-01\n', 'b.md': '# B\n' }, true, 'today');
  await nav(page, 'Insight').click();
  await page.getByRole('button', { name: /behind: Overdue tasks/ }).click();
  await expect(page.locator('.home-card', { hasText: 'Overdue tasks · 1' })).toContainText('Late one');
  await page.getByRole('button', { name: /behind: Notes changed this month/ }).click();
  await expect(page.locator('.home-card h3', { hasText: 'Notes changed this month · 2' })).toBeVisible();
  await page.locator('.heat button').last().click();
  await expect(page.locator('.home-card h3', { hasText: /^Notes changed on/ })).toBeVisible();
});

test('Insight exports its numbers as CSV and JSON', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '---\ntags: [launch]\n---\n- [ ] Call @dana\n' });
  await nav(page, 'Insight').click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^insight-\d{4}-\d{2}-\d{2}\.csv$/);
  const read = async (d: import('@playwright/test').Download): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  };
  expect((await read(csv)).replace(/^﻿/, '')).toContain('section,name,value,detail');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const data = JSON.parse(await read(json)) as { topics: { tag: string }[]; month: { open: number } };
  expect(data.topics[0]!.tag).toBe('launch');
  expect(data.month.open).toBe(1);
});
