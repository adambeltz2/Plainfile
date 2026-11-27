import { expect, test } from '@playwright/test';
import { listFiles, localDate, nav, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TODAY = localDate(0);
const card = (page: import('@playwright/test').Page, heading: string) =>
  page.locator('.home-card').filter({ has: page.locator('h3', { hasText: new RegExp(`^${heading}`) }) });
const VAULT: Record<string, string> = {
  'projects/site/index.md': '---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n- [ ] Overdue inline due:2020-01-01\n- [ ] Undated inline\n',
  'inbox/2026-11-21 1420.md': `---\ntitle: "2026-11-21 14:20"\ncreated: ${TODAY}\nproject:\ntags: []\npeople: []\n---\n\nCalled Dana\n`,
  'tasks/Late one.md': `---\ntitle: Late one\nstatus: todo\ndue: 2020-02-02\ncreated: ${TODAY}\ntags: []\npeople: []\n---\n`,
  'tasks/Waiting one.md': `---\ntitle: Waiting one\nstatus: waiting\ncreated: ${TODAY}\npeople: [pat]\n---\n`,
  'tasks/Due today.md': `---\ntitle: Due today\nstatus: todo\ndue: ${TODAY}\n---\n`,
};

test('Home puts Today beside the other cards, so nothing waits below a tall list', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  const files: Record<string, string> = { 'projects/site/index.md': '---\ntitle: Website\ntype: project\nactive: true\n---\n' };
  for (let i = 0; i < 12; i++) files[`tasks/T${i}.md`] = `---\ntitle: Task ${i}\nstatus: todo\ndue: ${TODAY}\n---\n`;
  await openVault(page, files, true, 'home');
  const today = await card(page, 'Today').boundingBox();
  const filing = await card(page, 'Needs filing').boundingBox();
  const projects = await card(page, 'Projects').boundingBox();
  expect(today!.x).toBeGreaterThan(projects!.x + projects!.width - 1); // Today is a column to the right
  expect(filing!.y).toBeLessThan(800); // the smaller cards are on the first screen
  expect(filing!.y).toBeLessThan(today!.y + today!.height - 200);
});

test.describe('Home', () => {
  test('clicking an inline task on Home opens its note at that line, and the checkbox only ticks it', async ({ page }) => {
    const dir = await openVault(page, { 'plan.md': `# Plan\n\nIntro\n- [ ] Ship it due:${TODAY}\n` }, true, 'home');
    await card(page, 'Today').locator('li.task .cb').click();
    await expect.poll(() => readFile(page, dir, 'plan.md')).toContain('- [x] Ship it');
    await expect(page.locator('.home')).toBeVisible(); // ticking did not leave Home
    await card(page, 'Today').locator('li.task .t').click();
    await expect(page.locator('.cm-content')).toContainText('Intro');
  });

  test('Home shows how many notes there are, and the count opens the Notes list', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n', 'b.md': '# B\n', 'c.md': '# C\n' }, true, 'home');
    await expect(page.locator('[data-count]')).toHaveText('3 notes');
    await page.locator('[data-count]').click();
    await expect(page.locator('.frame.notes')).toBeVisible();
    await nav(page, 'Home').click();
    await page.locator('.home-links').getByRole('button', { name: 'Explore' }).click();
    await expect(page.locator('.finder')).toBeVisible();
  });

  test('the one-line bar at the top adds a task file and Quick note starts a note', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' }, true, 'home');
    await expect(page.locator('.home-top')).toContainText(/\w+day \d+ \w+/);
    await page.locator('#quick-text').fill('Call Dana @dana due:tomorrow');
    await expect(page.locator('#quick-preview')).toContainText('Call Dana');
    await page.locator('#quick-text').press('Enter');
    await expect.poll(async () => (await listFiles(page, dir)).filter((f) => f.startsWith('tasks/')).length).toBe(1);
    await expect(page.locator('#quick-text')).toHaveValue('');
    await page.locator('.home-quick').getByRole('button', { name: 'Quick note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
  });

  test('a task added from the one-line bar with #followup shows in Follow-ups and is still a task', async ({ page }) => {
    await openVault(page, { 'a.md': '# A\n' }, true, 'home');
    await expect(card(page, 'Follow-ups')).toContainText('None');
    await page.locator('#quick-text').fill('doing things #followup');
    await page.locator('#quick-text').press('Enter');
    await expect(card(page, 'Follow-ups')).toContainText('doing things');
    await expect(card(page, 'Follow-ups').locator('h3 .n')).toHaveText('1');
    await nav(page, 'Tasks').click();
    await page.locator('.hub-q, #hub-q').fill('doing things'); // a search spans every date view
    await expect(page.getByRole('tab', { name: /^Tasks 1/ })).toBeVisible(); // it is still a task: the list has it
  });

  test('on a phone Home has no sideways scroll and the quick bar and stats show', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'a.md': '# A\n' }, true, 'home');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('#quick-text')).toBeVisible();
    await expect(page.locator('.wday')).toHaveCount(7);
  });

  test('clicking a task on Home opens its note', async ({ page }) => {
    await openVault(page, { 'tasks/Do things.md': `---\ntitle: Do things\nstatus: todo\ndue: ${TODAY}\n---\n\nBody text\n` }, true, 'home');
    await card(page, 'Today').locator('li.task .t').click();
    await expect(page.locator('.cm-content')).toContainText('Body text');
  });

  test('is the first screen and shows capture, today, where you left off, filing, waiting, the week and projects', async ({ page }) => {
    await openVault(page, VAULT, true, 'home');
    await expect(page.locator('.home')).toBeVisible();
    for (const h of ['Today', 'Needs filing', 'Waiting on', 'Projects']) await expect(page.locator('.home-card h3', { hasText: h })).toBeVisible();
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
    await expect(page.locator('.home')).toBeVisible(); // stays on Home
    await expect(card(page, 'Today')).toContainText('Send the brief');
    await page.getByRole('button', { name: /Mark done: Due today/ }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Due today.md')).toContain('status: done');
    await page.locator('.home').getByRole('button', { name: 'Quick note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect((await listFiles(page, dir)).some((f) => /^inbox\/\d{4}-\d{2}-\d{2} \d{4}\.md$/.test(f))).toBe(true);
  });

  test('the buttons lead to the Today view and to the weekly review', async ({ page }) => {
    await openVault(page, VAULT, true, 'home');
    await page.getByRole('button', { name: 'All of Today' }).click();
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-pressed', 'true');
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
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'inbox/2026-11-21 1420.md'))
      .toBe(`---\ntitle: "2026-11-21 14:20"\ncreated: ${TODAY}\nproject: site\ntags: [meeting]\npeople: []\n---\n\nCalled Dana\n`);
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
    await expect(page.locator('.home')).toBeVisible();
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
