import { expect, test } from '@playwright/test';
import { localDate, nav, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const TODAY = localDate(0);
const FILES: Record<string, string> = {
  'a.md': `- [ ] Pay invoice due:${TODAY}\n- [x] Book flights due:${TODAY}\n- [ ] Far off due:2999-05-05\n`,
  'tasks/Task note.md': `---\ntitle: Task note\nstatus: todo\ndue: ${TODAY}\n---\n`,
  'meetings/Kickoff.md': `---\ntitle: Kickoff\ntype: meeting\ndate: ${TODAY}\n---\nNotes\n`,
  'nodate.md': '- [ ] Undated task',
};

test.describe('Calendar', () => {
  test('shows tasks by due date and notes by date on a month, with today marked and the day listed below', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Calendar').click();
    const cell = page.locator('.cal-cell.today');
    await expect(cell).toBeVisible();
    await expect(cell.locator('.cal-ev.task', { hasText: 'Pay invoice' })).toBeVisible();
    await expect(cell.locator('.cal-ev.done', { hasText: 'Book flights' })).toBeVisible();
    await expect(cell.locator('.cal-ev', { hasText: 'Task note' })).toBeVisible();
    await expect(cell.locator('.cal-more')).toHaveText('+1 more'); // three show, the meeting note is the fourth
    await expect(page.locator('.cal-ev', { hasText: 'Undated task' })).toHaveCount(0);
    const panel = page.locator('.cal-day');
    await expect(panel).toContainText('today');
    await expect(panel).toContainText('Pay invoice');
    await expect(panel).toContainText('Kickoff');
  });

  test('changing the date in the day panel, or dragging the task to another day, rewrites only its due date', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Calendar').click();
    const tomorrow = localDate(1);
    const row = page.locator('.cal-trow', { hasText: 'Pay invoice' });
    await row.locator('input[type="date"]').fill(tomorrow);
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toContain(`- [ ] Pay invoice due:${tomorrow}\n`);
    expect(await readFile(page, dir, 'a.md')).toBe(`- [ ] Pay invoice due:${tomorrow}\n- [x] Book flights due:${TODAY}\n- [ ] Far off due:2999-05-05\n`);

    // Drag the task note to a day two ahead, when that day is in view. Wait for the grid to show the first change.
    await expect(page.locator(`.cal-cell[data-cal-day="${tomorrow}"] .cal-ev`, { hasText: 'Pay invoice' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0)); // filling the date box above scrolled the grid up out of view
    const target = localDate(2);
    const dest = page.locator(`.cal-cell[data-cal-day="${target}"]`);
    if (await dest.count()) {
      await page.locator('.cal-cell.today .cal-ev', { hasText: 'Task note' }).dragTo(dest);
      await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Task note.md')).toContain(`due: ${target}`);
    }
    // A note is not a task: it cannot be dragged.
    await expect(page.locator('.cal-ev.note').first()).not.toHaveAttribute('draggable', 'true');
  });

  test('moves between months, switches to Week and Agenda, and adds a task for the chosen day', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Calendar').click();
    const label = await page.locator('.cal-bar .title').textContent();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.cal-bar .title')).not.toHaveText(label ?? '');
    await page.locator('.cal-bar').getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.cal-bar .title')).toHaveText(label ?? '');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.cal-col')).toHaveCount(7);
    await expect(page.locator('.cal-col.today .cal-ev', { hasText: 'Pay invoice' })).toBeVisible();
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    await expect(page.locator('.cal-agenda')).toContainText('Pay invoice');
    await expect(page.locator('.cal-agenda')).toContainText('Kickoff');
    await expect(page.locator('.cal-agenda')).not.toContainText('Far off'); // beyond 30 days
    await page.locator('#cal-add-text').fill('Water the plants');
    await page.locator('#cal-add-text').press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Water the plants.md')).toContain(`due: ${TODAY}`);
    await expect(page.locator('.cal-agenda')).toContainText('Water the plants');
  });

  test('on a phone the month shows counts, tapping a day lists it, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, FILES);
    await nav(page, 'Calendar').click();
    await expect(page.locator('.cal-cell.today .cal-count')).toBeVisible();
    await expect(page.locator('.cal-cell.today .cal-ev').first()).toBeHidden();
    await page.locator(`.cal-cell[data-cal-day="${localDate(3)}"] .cal-num`).click().catch(() => undefined);
    await page.locator('.cal-cell.today .cal-num').click();
    await expect(page.locator('.cal-day')).toContainText('Pay invoice');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
