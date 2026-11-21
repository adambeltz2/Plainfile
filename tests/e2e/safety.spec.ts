import { expect, test, type Page } from '@playwright/test';
import { listFiles, openVault, readFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const nav = (page: Page, name: RegExp | string) => page.locator('.nav').getByRole('button', { name });

async function open(page: Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: title }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}
async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}
const historyFiles = async (page: Page, dir: string) => (await listFiles(page, dir)).filter((f) => f.startsWith('.plainfile/history/'));

test.describe('saving and undo', () => {
  test('saves by itself a moment after you stop typing, with no Save button to press', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Start' });
    await open(page, 'n');
    await typeAtEnd(page, ' and more');
    await expect(page.locator('#note-status')).toHaveText('Unsaved changes');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Start and more');
  });

  test('Ctrl or Cmd S saves straight away', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Start' });
    await open(page, 'n');
    await typeAtEnd(page, ' quick');
    await page.keyboard.press('Control+s');
    await expect.poll(() => readFile(page, dir, 'n.md'), { timeout: 600 }).toBe('Start quick');
  });

  test('Undo and Redo buttons work without a keyboard shortcut, and are disabled when there is nothing to do', async ({ page }) => {
    await openVault(page, { 'n.md': 'Start' });
    await open(page, 'n');
    await expect(page.locator('#note-undo')).toBeDisabled();
    await expect(page.locator('#note-redo')).toBeDisabled();
    await typeAtEnd(page, ' oops');
    await expect(page.locator('#note-undo')).toBeEnabled();
    await page.locator('#note-undo').click();
    await expect(page.locator('.cm-content')).toHaveText('Start');
    await expect(page.locator('#note-redo')).toBeEnabled();
    await page.locator('#note-redo').click();
    await expect(page.locator('.cm-content')).toHaveText('Start oops');
  });
});

test.describe('version history', () => {
  test('keeps what was on disk before the first save, and lets you compare and restore it', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Original text' });
    await open(page, 'n');
    await expect(page.locator('#note-side')).toContainText('Earlier versions of this note appear here');
    await typeAtEnd(page, ' plus a mistake');
    await expect(page.locator('#note-status')).toHaveText('Saved');

    const files = await historyFiles(page, dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('/n.md/');
    expect(await readFile(page, dir, files[0] as string)).toBe('Original text');

    await expect(page.getByRole('button', { name: '1 saved' })).toBeVisible();
    await page.getByRole('button', { name: '1 saved' }).click();
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.locator('#note-side .diff.plain-box')).toContainText('If you restore this');
    await expect(page.locator('#note-side .diff.plain-box .add')).toContainText('Original text');
    await expect(page.locator('#note-side .diff.plain-box .del')).toContainText('Original text plus a mistake');

    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('.cm-content')).toHaveText('Original text');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Original text');

    // Restoring is an edit, so Undo brings back the version you had before it.
    await page.locator('#note-undo').click();
    await expect(page.locator('.cm-content')).toHaveText('Original text plus a mistake');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Original text plus a mistake');
  });

  test('does not pile up a version on every keystroke, and survives closing the note', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'One', 'm.md': 'Other' });
    await open(page, 'n');
    await typeAtEnd(page, ' two');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    await typeAtEnd(page, ' three');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await historyFiles(page, dir)).toHaveLength(1);

    // Go to another note and come back: the version is still there.
    await page.locator('.note-item', { hasText: 'm' }).click();
    await page.locator('.note-item', { hasText: 'n' }).click();
    await expect(page.getByRole('button', { name: '1 saved' })).toBeVisible();
  });

  test('is kept out of the notes list and search', async ({ page }) => {
    await openVault(page, { 'n.md': 'Findable words' });
    await open(page, 'n');
    await typeAtEnd(page, ' more');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    await expect(page.locator('.note-item')).toHaveCount(1);
    await nav(page, 'Search').click();
    await page.locator('#search-q').fill('Findable');
    await expect(page.locator('#search-results .res')).toHaveCount(1);
  });
});

test.describe('focus mode', () => {
  test('hides everything but the note, keeps the cursor in it, and Esc or the button brings it all back', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Start' });
    await open(page, 'n');
    await expect(page.locator('.nav')).toBeVisible();
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('.bar')).toBeHidden();
    await expect(page.locator('#note-list')).toBeHidden();
    await expect(page.locator('#note-side')).toBeHidden();
    await expect(page.locator('.foot')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Rename' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
    await expect(page.locator('#note-undo')).toBeVisible();

    // The cursor is already in the note, so you can type straight away.
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' focused');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Start focused');

    await page.keyboard.press('Escape');
    await expect(page.locator('.bar')).toBeVisible();
    await expect(page.locator('#note-list')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.locator('.bar')).toBeVisible();
  });

  test('works on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, { 'n.md': 'Start' });
    await open(page, 'n');
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('.bar')).toBeHidden();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Exit focus' }).click();
    await expect(page.locator('.bar')).toBeVisible();
  });
});
