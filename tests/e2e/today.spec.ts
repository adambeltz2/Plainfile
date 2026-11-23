import { expect, test } from '@playwright/test';
import { listFiles, localDate, openVault, readFile, readFileOrEmpty, writeFileExternally, nav } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('landing offers a folder and the sample vault', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Plainfile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a folder' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the sample vault' })).toBeVisible();
});

test('sample vault shows Today grouped by overdue, today and this week', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.grp', { hasText: 'Overdue' })).toContainText('2');
  await expect(page.locator('.grp', { hasText: 'Due today' })).toContainText('2');
  await expect(page.locator('.grp', { hasText: 'This week' })).toContainText('3');
  await expect(page.getByText('File estimated tax payment')).toBeVisible();
  await expect(page.locator('.task.done')).toHaveCount(0);
});

test('ticking a task shows exactly what changed on disk and keeps it on screen', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await page.getByRole('button', { name: 'Mark done: Send logo files' }).click();
  const diff = page.locator('.diff');
  await expect(diff.locator('.del')).toHaveText('−- [ ] Send logo files @dana due:2026-11-23');
  await expect(diff.locator('.add')).toHaveText('+- [x] Send logo files @dana due:2026-11-23');
  await expect(page.locator('.task.done')).toHaveCount(1);
  await expect(page.locator('.ln.hi')).toContainText('- [x] Send logo files');
  // Undo it again.
  await page.getByRole('button', { name: 'Mark not done: Send logo files' }).click();
  await expect(page.locator('.task.done')).toHaveCount(0);
});

test('tag filter and All open view', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await page.getByRole('button', { name: /^All open/ }).click();
  await expect(page.locator('.grp', { hasText: 'No date' })).toHaveCount(0);
  await page.getByRole('button', { name: /^#admin/ }).click();
  await expect(page.locator('.task')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.locator('.task').first()).toBeVisible();
});

test('theme: Light, Dark and Auto work on the landing screen and in the app, and are remembered', async ({ page }) => {
  const group = page.getByRole('group', { name: 'Color theme' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = () => page.locator('html').getAttribute('data-theme');

  // On the landing screen, before any folder is open.
  await page.emulateMedia({ colorScheme: 'light' });
  await group.getByRole('button', { name: 'Dark' }).click();
  expect(await attr()).toBe('dark');
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await expect(group.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

  // It survives a reload and carries into the app.
  await page.reload();
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await group.getByRole('button', { name: 'Light' }).click();
  expect(await attr()).toBe('light');
  expect(await bg()).toBe('rgb(255, 255, 255)');

  // Auto follows the device, which here is set to dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await group.getByRole('button', { name: 'Auto' }).click();
  expect(await attr()).toBeNull();
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bg()).toBe('rgb(255, 255, 255)');
  await page.reload();
  expect(await attr()).toBeNull();
});

test('real folder: reads files, ticks one character, leaves everything else byte for byte', async ({ page }) => {
  const today = localDate(0);
  const late = localDate(-2);
  const text = `---\ntitle: Notes\n---\n\nSome   odd   spacing\r\n- [ ] Pay invoice due:${late} #admin\n- [ ] Call Dana due:${today}\n\ntrailing line`;
  const dir = await openVault(page, { 'notes/a.md': text });

  await expect(page.locator('.grp', { hasText: 'Overdue' })).toContainText('1');
  await expect(page.getByText('Call Dana')).toBeVisible();

  await page.getByRole('button', { name: 'Mark done: Call Dana' }).click();
  await expect(page.locator('.task.done')).toHaveCount(1);

  const after = await readFile(page, dir, 'notes/a.md');
  expect(after).toBe(text.replace('- [ ] Call Dana', '- [x] Call Dana'));
});

test('real folder: a file edited elsewhere is never overwritten', async ({ page }) => {
  const today = localDate(0);
  const dir = await openVault(page, { 'a.md': `- [ ] Original task due:${today}\n` });
  await expect(page.getByText('Original task')).toBeVisible();

  const edited = `- [ ] Edited somewhere else due:${today}\n`;
  await writeFileExternally(page, dir, 'a.md', edited);

  await page.getByRole('button', { name: 'Mark done: Original task' }).click();
  await expect(page.locator('.diff')).toContainText('nothing was written');
  expect(await readFile(page, dir, 'a.md')).toBe(edited);
  // The list was refreshed to match the file.
  await expect(page.getByText('Edited somewhere else')).toBeVisible();
});

test('real folder: Rescan picks up a new file', async ({ page }) => {
  const today = localDate(0);
  const dir = await openVault(page, { 'a.md': `- [ ] First due:${today}\n` });
  await expect(page.locator('.task')).toHaveCount(1);
  await page.evaluate(
    async ({ dir, text }) => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const w = await (await d.getFileHandle('b.md', { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    { dir, text: `- [ ] Second due:${today}\n` },
  );
  await page.getByRole('button', { name: 'Rescan' }).click();
  await expect(page.locator('.task')).toHaveCount(2);
});

test('works at phone width without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await expect(page.getByText('File estimated tax payment')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the quick add box empties at once, so a line typed during the save is not lost', async ({ page }) => {
  await page.goto('/');
  const dir = await openVault(page, { 'a.md': '# A\n' });
  const box = page.locator('#quick-text');
  await box.fill('First task');
  await box.press('Enter');
  await expect(box).toHaveValue(''); // emptied straight away
  await box.fill('Second task');
  await box.press('Enter');
  await expect
    .poll(async () => (await listFiles(page, dir)).filter((f) => f.startsWith('tasks/')).sort())
    .toEqual(['tasks/First task.md', 'tasks/Second task.md']);
});

test('a line that cannot be added is put back in the box', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '# A\n' });
  const box = page.locator('#quick-text');
  await box.fill('Task +NoSuchProject');
  await box.press('Enter');
  await expect(page.locator('.notice.err, .err-text').first()).toContainText('No project called');
  await expect(box).toHaveValue('Task +NoSuchProject');
});

test('a date in plain words ends up as the due date, in the preview and in the file', async ({ page }) => {
  await page.goto('/');
  const dir = await openVault(page, { 'a.md': '# A\n' });
  const box = page.locator('#quick-text');
  await box.fill('Call Dana tomorrow @dana');
  await expect(page.locator('#quick-preview')).toContainText('Task note "Call Dana"');
  await expect(page.locator('#quick-preview')).toContainText('due');
  await box.press('Enter');
  const tomorrow = localDate(1);
  await expect.poll(async () => readFileOrEmpty(page, dir, 'tasks/Call Dana.md')).toContain(`due: ${tomorrow}`);
});

test.describe('keys on the Today list', () => {
  const TODAY = localDate(0);
  const FILES = { 'a.md': `- [ ] First due:${TODAY}\n- [ ] Second due:${TODAY}\n- [ ] Third due:${TODAY}\n` };

  test('j and k move through the tasks, x ticks the chosen one, e opens its note', async ({ page }) => {
    await page.goto('/');
    const dir = await openVault(page, FILES);
    await expect(page.locator('li.task')).toHaveCount(3);
    await page.keyboard.press('j');
    await expect(page.locator('li.task.sel')).toContainText('First');
    await page.keyboard.press('j');
    await expect(page.locator('li.task.sel')).toContainText('Second');
    await page.keyboard.press('j');
    await page.keyboard.press('k');
    await expect(page.locator('li.task.sel')).toContainText('Second');
    await page.keyboard.press('x');
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toBe(`- [ ] First due:${TODAY}\n- [x] Second due:${TODAY}\n- [ ] Third due:${TODAY}\n`);
    await page.keyboard.press('e');
    await expect(page.locator('.cm-content')).toBeVisible();
  });

  test('the keys do nothing while you are typing in a box', async ({ page }) => {
    await page.goto('/');
    await openVault(page, FILES);
    await page.locator('#quick-text').click();
    await page.keyboard.type('jkxe');
    await expect(page.locator('#quick-text')).toHaveValue('jkxe');
    await expect(page.locator('li.task.sel')).toHaveCount(0);
  });
});

test.describe('reschedule from Today', () => {
  const TODAY = localDate(0);
  test("buttons and a date box move one task's due date, writing only that date", async ({ page }) => {
    await page.goto('/');
    const text = `- [ ] Pay rent due:${TODAY}\n- [ ] Other due:${TODAY}\n`;
    const dir = await openVault(page, { 'a.md': text });
    await page.locator('li.task', { hasText: 'Pay rent' }).locator('.t').click();
    const panel = page.getByRole('group', { name: 'Reschedule this task' });
    await panel.getByRole('button', { name: 'Tomorrow' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toBe(`- [ ] Pay rent due:${localDate(1)}\n- [ ] Other due:${TODAY}\n`);
    await page
      .getByRole('button', { name: 'Upcoming' })
      .first()
      .click()
      .catch(() => undefined);
    await page.locator('li.task', { hasText: 'Pay rent' }).locator('.t').click();
    await page.getByRole('group', { name: 'Reschedule this task' }).getByRole('button', { name: 'No date' }).click();
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toBe(`- [ ] Pay rent\n- [ ] Other due:${TODAY}\n`);
  });

  test('the date box sets any date', async ({ page }) => {
    await page.goto('/');
    const dir = await openVault(page, { 'a.md': `- [ ] Pay rent due:${TODAY}\n` });
    await page.locator('li.task', { hasText: 'Pay rent' }).locator('.t').click();
    await page.locator('[data-resched-pick]').fill(localDate(3));
    await expect.poll(() => readFileOrEmpty(page, dir, 'a.md')).toBe(`- [ ] Pay rent due:${localDate(3)}\n`);
  });
});

test('a task with checkboxes nested under it shows how many are done', async ({ page }) => {
  await page.goto('/');
  const T = localDate(0);
  await openVault(page, { 'a.md': `- [ ] Plan the trip due:${T}\n  - [x] Book flights\n  - [ ] Book hotel\n  - [ ] Pack\n` });
  await expect(page.locator('li.task', { hasText: 'Plan the trip' }).locator('.chip', { hasText: '1 of 3' })).toBeVisible();
});

test.describe('priority', () => {
  const NOTE = `# Work\n- [ ] Plain thing due:${localDate(0)}\n- [ ] (B) Second thing due:${localDate(0)}\n- [ ] (A) First thing due:${localDate(0)}\n`;

  test('shows a badge, sorts A before B before none, and keeps the badge out of the title', async ({ page }) => {
    await openVault(page, { 'work.md': NOTE });
    await nav(page, 'Today').click();
    const rows = page.locator('li.task .t');
    await expect(rows).toHaveText(['AFirst thing', 'BSecond thing', 'Plain thing']);
    await expect(page.getByRole('img', { name: 'Priority A' })).toBeVisible();
    await expect(page.locator('li.task').first().getByRole('button', { name: 'Mark done: First thing' })).toBeVisible();
  });

  test('1, 2, 3 and 0 set and clear the priority of the selected task, changing one piece of the line', async ({ page }) => {
    const dir = await openVault(page, { 'work.md': NOTE });
    await nav(page, 'Today').click();
    await page.locator('li.task', { hasText: 'Plain thing' }).click();
    await page.keyboard.press('2');
    await expect.poll(() => readFile(page, dir, 'work.md')).toBe(NOTE.replace('- [ ] Plain thing', '- [ ] (B) Plain thing'));
    await expect(page.locator('.diff .add')).toContainText('(B) Plain thing');
    await page.keyboard.press('1');
    await expect.poll(() => readFile(page, dir, 'work.md')).toBe(NOTE.replace('- [ ] Plain thing', '- [ ] (A) Plain thing'));
    await page.keyboard.press('0');
    await expect.poll(() => readFile(page, dir, 'work.md')).toBe(NOTE);
  });

  test('a quick add that starts with (A) makes a task note with that priority', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await nav(page, 'Today').click();
    await page.locator('#quick-text').fill('(A) Call Dana');
    await expect(page.locator('#quick-preview')).toContainText('priority A');
    await page.locator('#quick-text').press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'tasks/Call Dana.md')).toContain('priority: A');
    expect(await readFile(page, dir, 'tasks/Call Dana.md')).toContain('title: Call Dana\n');
  });
});
