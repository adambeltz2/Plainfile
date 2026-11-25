import { expect, test } from '@playwright/test';
import { listFiles, localDate, nav, openVault, readFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const T = localDate(0);
const Y = localDate(-1);
const PAST = localDate(-3);
const j = (d: string, body = 'Notes\n'): string => `---\ntitle: ${d}\ntype: journal\ndate: ${d}\n---\n${body}`;

test.describe('the Journal tab', () => {
  test('is under More, and lands on the calendar with today selected', async ({ page }) => {
    await openVault(page, { [`journal/${Y}.md`]: j(Y), 'a.md': '# A\n' });
    const tabs = await page.locator('.nav .navbtn').allInnerTexts();
    expect(tabs.map((t) => t.replace(/\s*\d+$/, '').trim()).slice(0, 6)).toEqual(['Home', 'Tasks', 'Projects', 'Notes', 'Calendar', 'Search']);
    await nav(page, 'Journal').click();
    await expect(page.locator('.jgrid')).toBeVisible();
    await expect(page.locator('.jday.sel')).toHaveAttribute('data-j-day', T);
    await expect(page).toHaveTitle('Journal · Plainfile');
  });

  test('the list is dates only, a dot marks a day with a journal, and clicking a day that has one opens it', async ({ page }) => {
    await openVault(page, { [`journal/${Y}.md`]: j(Y, 'Plenty of text here\n'), [`journal/${PAST}.md`]: j(PAST, 'Older entry\n') });
    await nav(page, 'Journal').click();
    const items = page.locator('.jpane .opt');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveText(Y);
    await expect(page.locator('.jpane')).not.toContainText('Plenty of text');
    await expect(page.locator(`.jday[data-j-day="${Y}"] .jdot`)).toBeVisible();
    await items.first().click(); // one click on a date in the list opens its journal
    await expect(page.locator('.cm-content')).toContainText('Plenty of text');
    await page.getByRole('button', { name: '‹ Journals' }).click();
    await expect(page.locator('.jgrid')).toBeVisible();
    await expect(page.locator('.jday.sel')).toHaveAttribute('data-j-day', Y); // back where you were
    await page.locator(`.jday[data-j-day="${PAST}"]`).click(); // and so does a day with a dot in the calendar
    await expect(page.locator('.cm-content')).toContainText('Older entry');
  });

  test('today with no journal starts at once; another day asks first, and Cancel makes nothing', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await nav(page, 'Journal').click();
    await page.locator(`.jday[data-j-day="${PAST}"]`).click();
    await page.getByRole('button', { name: /^\+ Journal for/ }).click();
    await expect(page.getByRole('group', { name: 'Make a journal' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await listFiles(page, dir)).toEqual(['a.md']);
    await page.getByRole('button', { name: /^\+ Journal for/ }).click();
    await page.getByRole('button', { name: 'Make it' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, `journal/${PAST}.md`)).toContain(`type: journal\ndate: ${PAST}`);
    await page.getByRole('button', { name: '‹ Journals' }).click();
    await page.locator('[data-j-today]').click();
    await page.getByRole('button', { name: "Start today's journal" }).click(); // no question for today
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, `journal/${T}.md`)).toContain(`date: ${T}`);
  });

  test('Home has one button: open today’s journal, or start it', async ({ page }) => {
    const dir = await openVault(page, { [`journal/${Y}.md`]: j(Y) }, true, 'home');
    await expect(page.getByRole('button', { name: /^Open latest journal/ })).toBeVisible();
    await page.getByRole('button', { name: "Start today's journal" }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await listFiles(page, dir)).toContain(`journal/${T}.md`);
    await nav(page, 'Home').click();
    await expect(page.getByRole('button', { name: "Open today's journal" })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yesterday' })).toBeVisible();
    await page.getByRole('button', { name: 'All journals' }).click();
    await expect(page.locator('.jgrid')).toBeVisible();
  });

  test('on a phone Journal is under More, and Entries opens the date list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { [`journal/${Y}.md`]: j(Y) });
    await nav(page, 'Journal').click();
    await expect(page.locator('.jgrid')).toBeVisible();
    await expect(page.locator('.jpane')).toBeHidden();
    await page.getByRole('button', { name: /^Entries 1/ }).click();
    await expect(page.locator('.jpane.fly')).toBeVisible();
    await page.locator('.jpane .opt').first().click(); // a date with a journal opens it
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
