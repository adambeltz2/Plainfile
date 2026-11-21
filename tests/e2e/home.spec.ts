import { expect, test } from '@playwright/test';
import { listFiles, localDate, nav, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TODAY = localDate(0);
const card = (page: import('@playwright/test').Page, heading: string) => page.locator('.home-card').filter({ has: page.locator('h3', { hasText: new RegExp(`^${heading}`) }) });
const VAULT: Record<string, string> = {
  'projects/site/index.md': '---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n- [ ] Overdue inline due:2020-01-01\n- [ ] Undated inline\n',
  'inbox/2026-11-21 1420.md': `---\ntitle: "2026-11-21 14:20"\ncreated: ${TODAY}\nproject:\ntags: []\npeople: []\n---\n\nCalled Dana\n`,
  'tasks/Late one.md': `---\ntitle: Late one\nstatus: todo\ndue: 2020-02-02\ncreated: ${TODAY}\ntags: []\npeople: []\n---\n`,
  'tasks/Waiting one.md': `---\ntitle: Waiting one\nstatus: waiting\ncreated: ${TODAY}\npeople: [pat]\n---\n`,
  'tasks/Due today.md': `---\ntitle: Due today\nstatus: todo\ndue: ${TODAY}\n---\n`,
};

test.describe('Home', () => {
  test('is the first screen and shows capture, today, where you left off, filing, waiting, the week and projects', async ({ page }) => {
    await openVault(page, VAULT, true, 'home');
    await expect(page.locator('.title')).toHaveText('Home');
    for (const h of ['Capture', 'Today', 'Pick up where you left off', 'Needs filing', 'Waiting on', 'This week', 'Projects']) await expect(page.locator('.home-card h3', { hasText: h })).toBeVisible();
    await expect(card(page, 'Needs filing').locator('.chip.late')).toHaveText('4'); // the quick note and three task notes with no project
    await expect(card(page, 'Waiting on')).toContainText('Waiting one');
    await expect(card(page, 'Waiting on')).toContainText('@pat');
    await expect(card(page, 'Today')).toContainText('Due today');
    await expect(page.locator('.wday')).toHaveCount(7);
    await expect(page.locator('.home-proj')).toContainText('Website');
  });

  test('capture adds a task note right from Home, ticking works there, and Quick note opens a note', async ({ page }) => {
    const dir = await openVault(page, VAULT, true, 'home');
    await page.locator('#quick-text').fill('Send the brief due:today');
    await page.locator('#quick-text').press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Send the brief.md')).toContain(`due: ${TODAY}`);
    await expect(page.locator('.title')).toHaveText('Home'); // stays on Home
    await expect(card(page, 'Today')).toContainText('Send the brief');
    await page.getByRole('button', { name: /Mark done: Due today/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Due today.md')).toContain('status: done');
    await page.locator('.home').getByRole('button', { name: 'Quick note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect((await listFiles(page, dir)).some((f) => /^inbox\/\d{4}-\d{2}-\d{2} \d{4}\.md$/.test(f))).toBe(true);
  });

  test('the buttons lead to Today and to the weekly review', async ({ page }) => {
    await openVault(page, VAULT, true, 'home');
    await page.getByRole('button', { name: 'All of Today' }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await nav(page, 'Home').click();
    await page.getByRole('button', { name: /^File all|File them/ }).click();
    await expect(page.locator('.title')).toHaveText('Weekly review');
  });
});

test.describe('Weekly review', () => {
  test('files, reschedules, finishes and plans, each as one guarded edit, then returns Home', async ({ page }) => {
    const dir = await openVault(page, VAULT, true, 'home');
    await page.getByRole('button', { name: /^File all|File them/ }).click();

    // 1 Triage: file the quick note into the project with a tag. Only those two fields change.
    const quick = page.locator('.rv-item', { hasText: '2026-11-21 14:20' });
    await quick.locator('select').selectOption('site');
    await quick.locator('input').fill('#meeting');
    await quick.getByRole('button', { name: 'File' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'inbox/2026-11-21 1420.md')).toBe(`---\ntitle: "2026-11-21 14:20"\ncreated: ${TODAY}\nproject: site\ntags: [meeting]\npeople: []\n---\n\nCalled Dana\n`);
    await expect(page.locator('.rv-item', { hasText: '2026-11-21 14:20' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next' }).click();

    // 2 Slipped: move one to tomorrow, finish another.
    await expect(page.getByRole('tab', { name: /Slipped/ })).toHaveAttribute('aria-selected', 'true');
    const tomorrow = localDate(1);
    await page.locator('.rv-item', { hasText: 'Late one' }).getByRole('button', { name: 'Tomorrow' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Late one.md')).toContain(`due: ${tomorrow}`);
    await page.locator('.rv-item', { hasText: 'Overdue inline' }).getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/site/index.md')).toContain('- [x] Overdue inline due:2020-01-01');
    await page.getByRole('button', { name: 'Next' }).click();

    // 3 Waiting on: it arrived.
    await page.locator('.rv-item', { hasText: 'Waiting one' }).getByRole('button', { name: 'Arrived' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Waiting one.md')).toContain('status: done');
    await page.getByRole('button', { name: 'Next' }).click();

    // 4 Plan the week: give an undated task a day.
    await expect(page.locator('.rv-day')).toHaveCount(7);
    await page.locator('.rv-item', { hasText: 'Undated inline' }).locator('select').selectOption(localDate(2));
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/site/index.md')).toContain(`- [ ] Undated inline due:${localDate(2)}`);
    expect(await readFile(page, dir, 'tasks/Due today.md')).toBe(VAULT['tasks/Due today.md']); // nothing else was touched
    await expect(page.locator('#rv-count')).toContainText('5 changes');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('.title')).toHaveText('Home');
    await expect(page.locator('.home .notice.ok')).toContainText('Weekly review done. 5 changes made.');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('.home .notice.ok')).toHaveCount(0);
  });

  test('says so when there is nothing to do, and the steps can be jumped between', async ({ page }) => {
    await openVault(page, { 'a.md': '# A' }, true, 'home');
    await page.locator('.tabbar, .nav').first().waitFor();
    await page.keyboard.press('Control+p');
    await page.keyboard.type('weekly');
    await page.locator('.pal-item', { hasText: 'Weekly review' }).click();
    await expect(page.locator('.rv-body')).toContainText('Everything is filed');
    await page.getByRole('tab', { name: /Slipped/ }).click();
    await expect(page.locator('.rv-body')).toContainText('Nothing is overdue');
    await page.getByRole('tab', { name: /Waiting on/ }).click();
    await expect(page.locator('.rv-body')).toContainText('not waiting on anything');
    await page.getByRole('tab', { name: /Plan the week/ }).click();
    await expect(page.locator('.rv-body')).toContainText('Every open task has a date');
  });
});
