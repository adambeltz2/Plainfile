import { expect, test } from '@playwright/test';
import { listFiles, localDate, nav, noteItem, openVault, openViewMenu, readFile, showView } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const FILES: Record<string, string> = {
  'tasks/Late one.md': `---\ntitle: Late one\nstatus: todo\ndue: ${localDate(-3)}\n---\n`,
  'tasks/Done one.md': '---\ntitle: Done one\nstatus: done\n---\n',
  'a.md': `- [ ] Inline job due:${localDate(5)}\n`,
};

test.describe('the Tasks screen: filters panel, View menu, short rows', () => {
  test('the filters panel is docked on a wide screen, folds away with « Hide, and comes back with Filters', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await expect(page.locator('.fpane')).toBeVisible();
    await expect(page.locator('.hub-filterbtn')).toBeHidden(); // the panel is showing, so no extra button
    await page.getByRole('button', { name: 'Hide the filters panel' }).click();
    await expect(page.locator('.fpane')).toHaveCount(0);
    await page.locator('.hub-filterbtn').click();
    await expect(page.locator('.fpane')).toBeVisible();
  });

  test('done tasks are hidden until Show done is on, and Show done lists how many there are', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await showView(page, 'All');
    await expect(page.locator('.hub-content')).not.toContainText('Done one');
    await expect(page.locator('.fpane .sw')).toContainText('1 done');
    await page.locator('#hub-showdone').check();
    await page.locator('.hub-group .grp', { hasText: 'Done' }).click();
    await expect(page.locator('.hub-content')).toContainText('Done one');
    await page.locator('#hub-showdone').uncheck();
    await expect(page.locator('.hub-content')).not.toContainText('Done one');
  });

  test('a short row has the title and one line, a late task says how late, and Detailed rows adds the file and dates', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await showView(page, 'All');
    const row = page.locator('li.task', { hasText: 'Late one' });
    await expect(row.locator('.age')).toHaveText('3d late');
    await expect(row.locator('.chip')).toHaveCount(0);
    await openViewMenu(page);
    await page.locator('#hub-detailed').check();
    await expect(row.locator('.chip.src')).toBeVisible();
    await expect(page.locator('.hub-viewmenu > summary')).toContainText('Detailed rows');
  });

  test('a click outside the View menu closes it, so it never covers the list', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await showView(page, 'All');
    await openViewMenu(page);
    await page.locator('#hub-detailed').check();
    await page.locator('#hub-detailed').uncheck(); // the menu stays open while you change things in it
    await expect(page.locator('.hub-viewbox')).toBeVisible();
    await page
      .locator('li.task', { hasText: 'Late one' })
      .locator('.tmeta')
      .click({ position: { x: 20, y: 5 } }); // the left of the row, clear of the menu
    await expect(page.locator('.hub-viewbox')).toBeHidden();
    await expect(page.locator('.hub-taskpanel')).toBeVisible(); // and the click still did its job
  });

  test('choosing Group by closes the View menu', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await openViewMenu(page);
    await page.locator('#hub-group').selectOption('status');
    await expect(page.locator('.hub-viewbox')).toBeHidden();
  });

  test('the View menu switches between List, Board and Timeline', async ({ page }) => {
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await openViewMenu(page);
    await page.locator('.hub-viewbox').getByRole('button', { name: 'Board' }).click();
    await expect(page.locator('.hub-cols')).toBeVisible();
    await openViewMenu(page);
    await page.locator('.hub-viewbox').getByRole('button', { name: 'List' }).click();
    await expect(page.locator('.hub-cols')).toHaveCount(0);
  });
});

test('the readout of the last change goes when you change view, filter or screen', async ({ page }) => {
  await openVault(page, { 'tasks/Thing.md': `---\ntitle: Thing\nstatus: todo\ndue: ${localDate(1)}\n---\n` });
  await nav(page, 'Tasks').click();
  await showView(page, 'All');
  await page.getByRole('button', { name: 'Mark done: Thing' }).click();
  await expect(page.locator('.plog .diff')).toBeVisible(); // what changed on disk
  await page
    .getByRole('group', { name: 'Dates' })
    .getByRole('button', { name: /^Upcoming/ })
    .click();
  await expect(page.locator('.plog')).toHaveCount(0);
  await showView(page, 'All');
  await page.locator('#hub-showdone').check();
  await page.getByRole('button', { name: 'Mark not done: Thing' }).click();
  await expect(page.locator('.plog .diff')).toBeVisible();
  await nav(page, 'Home').click();
  await nav(page, 'Tasks').click();
  await expect(page.locator('.plog')).toHaveCount(0);
});

test.describe('the selected task', () => {
  test('a task that is its own note can go to the trash, with Undo; a task line in a note cannot', async ({ page }) => {
    const dir = await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await showView(page, 'All');
    await page.locator('li.task', { hasText: 'Inline job' }).locator('.tmeta').click();
    await expect(page.locator('.hub-taskpanel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move to Trash' })).toHaveCount(0);
    await page.locator('li.task', { hasText: 'Late one' }).locator('.tmeta').click();
    const before = await readFile(page, dir, 'tasks/Late one.md');
    await page.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page.locator('.notice.ok', { hasText: 'to the trash' })).toBeVisible();
    expect(await listFiles(page, dir)).not.toContain('tasks/Late one.md');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => listFiles(page, dir)).toContain('tasks/Late one.md');
    expect(await readFile(page, dir, 'tasks/Late one.md')).toBe(before);
  });

  test('on a phone a tap selects the task and a sheet slides up; Open note is in the sheet and ✕ closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, FILES);
    await nav(page, 'Tasks').click();
    await showView(page, 'All');
    await page.locator('li.task', { hasText: 'Late one' }).locator('.t').click();
    const sheet = page.locator('.hub-status.has-task');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(790); // pinned to the bottom edge
    await expect(sheet.getByRole('button', { name: 'Move to Trash' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Close task details' }).click();
    await expect(page.locator('.hub-status.has-task')).toHaveCount(0);
    await page.locator('li.task', { hasText: 'Late one' }).locator('.t').click();
    await page.locator('.hub-status.has-task').getByRole('button', { name: 'Open note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
  });
});

test('search lists a task that is its own note once, as the task', async ({ page }) => {
  await openVault(page, { 'tasks/RFID Validation.md': `---\ntitle: RFID Validation\nstatus: todo\ndue: ${localDate(1)}\n---\n` });
  await nav(page, 'Search').click();
  await page.locator('#search-q').fill('RFID');
  await expect(page.locator('li.res')).toHaveCount(1);
  await expect(page.locator('li.res .mini-cb')).toBeVisible(); // the task, with its tick box
  await expect(page.getByText(/^1 result in /)).toBeVisible();
});

test('the browser tab names the note, project or screen you are on', async ({ page }) => {
  await openVault(page, {
    'notes/pricing-research.md': '---\ntitle: Pricing research\n---\nBody\n',
    'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\nactive: true\n---\n- [ ] A task\n',
  });
  await expect(page).toHaveTitle('Tasks · Plainfile'); // openVault lands on Tasks
  await nav(page, 'Home').click();
  await expect(page).toHaveTitle('Home · Plainfile');
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Pricing research')).click();
  await expect(page).toHaveTitle('Pricing research · Plainfile');
  await page.locator('#note-title').fill('Pricing analysis');
  await page.locator('#note-title').press('Enter');
  await expect(page).toHaveTitle('Pricing analysis · Plainfile');
  await nav(page, 'Projects').click();
  await page.locator('.pcard .pbtn').first().click();
  await expect(page).toHaveTitle('Website relaunch · Plainfile');
});

test('Tasks has a link to the Calendar, in the tab row and in the View menu', async ({ page }) => {
  await openVault(page, FILES);
  await nav(page, 'Tasks').click();
  await page.getByRole('button', { name: 'Calendar →' }).first().click();
  await expect(page.locator('.cal-bar')).toBeVisible();
  await nav(page, 'Tasks').click();
  await openViewMenu(page);
  await page.locator('.hub-viewbox').getByRole('button', { name: 'Calendar →' }).click();
  await expect(page.locator('.cal-bar')).toBeVisible();
});

test('the Board lists finished tasks in Done whatever date view is on, and stacks its columns on a phone', async ({ page }) => {
  await openVault(page, {
    'tasks/Open one.md': `---\ntitle: Open one\nstatus: todo\ndue: ${localDate(1)}\n---\n`,
    'tasks/Done undated.md': '---\ntitle: Done undated\nstatus: done\n---\n',
  });
  await nav(page, 'Tasks').click(); // opens on the Today view, which has no place for an undated task
  await page.getByRole('tab', { name: 'Board' }).click();
  await expect(page.locator('.hub-col[data-col="todo"] .hub-card', { hasText: 'Open one' })).toBeVisible();
  await expect(page.locator('.hub-col[data-col="done"] .hub-card', { hasText: 'Done undated' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  const xs = await page.locator('.hub-col').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(xs).toHaveLength(4);
  expect(new Set(xs).size).toBe(1); // one column, not a 2 by 2 grid
  const w = await page.locator('.hub-col[data-col="todo"]').evaluate((e) => e.getBoundingClientRect().width);
  expect(w).toBeGreaterThan(300);
});
