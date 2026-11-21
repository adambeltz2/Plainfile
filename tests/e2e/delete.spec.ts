import { expect, test, type Page } from '@playwright/test';
import { listFiles, openVault, readFile, writeFileExternally } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const nav = (page: Page, name: RegExp | string) => page.locator('.nav').getByRole('button', { name });
const VAULT = {
  'notes/kickoff.md': '---\ntitle: Kickoff\n---\n- [ ] Send files\nBody text\n',
  'index.md': 'See [[kickoff]] for details.\n',
  'other.md': 'unrelated\n',
};

async function open(page: Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: title }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}
const trashFiles = async (page: Page, dir: string) => (await listFiles(page, dir)).filter((f) => f.startsWith('.plainfile/trash/'));

test('Delete asks first, and says what links to the note and which tasks go with it', async ({ page }) => {
  const dir = await openVault(page, VAULT);
  await open(page, 'Kickoff');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const box = page.locator('#note-banner');
  await expect(box).toContainText('Delete “Kickoff”?');
  await expect(box).toContainText('1 note links here');
  await expect(box).toContainText('index.md');
  await expect(box).toContainText('1 open task');
  // Nothing has happened yet, and Cancel leaves it alone.
  expect(await readFile(page, dir, 'notes/kickoff.md')).toBe(VAULT['notes/kickoff.md']);
  await box.getByRole('button', { name: 'Cancel' }).click();
  await expect(box).toBeEmpty();
  expect(await listFiles(page, dir)).toContain('notes/kickoff.md');
});

test('Move to trash removes the note, keeps a copy, and Undo puts it back exactly', async ({ page }) => {
  const dir = await openVault(page, VAULT);
  await open(page, 'Kickoff');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Move to trash' }).click();

  await expect(page.locator('.notice.ok')).toContainText('Deleted “Kickoff”. It is in the trash.');
  await expect(page.locator('.note-item', { hasText: 'Kickoff' })).toHaveCount(0);
  expect(await listFiles(page, dir)).not.toContain('notes/kickoff.md');
  const trashed = await trashFiles(page, dir);
  expect(trashed).toHaveLength(1);
  expect(trashed[0]).toMatch(/__notes%2Fkickoff\.md$/);
  expect(await readFile(page, dir, trashed[0] as string)).toBe(VAULT['notes/kickoff.md']);
  // The note that linked to it is untouched.
  expect(await readFile(page, dir, 'index.md')).toBe(VAULT['index.md']);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(await readFile(page, dir, 'notes/kickoff.md')).toBe(VAULT['notes/kickoff.md']);
  expect(await trashFiles(page, dir)).toEqual([]);
});

test('permanent delete needs a second confirmation and leaves no copy', async ({ page }) => {
  const dir = await openVault(page, VAULT);
  await open(page, 'other');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently…' }).click();
  await expect(page.locator('#note-banner')).toContainText('There is no undo');
  expect(await listFiles(page, dir)).toContain('other.md');
  await page.getByRole('button', { name: 'Yes, delete permanently' }).click();
  await expect(page.locator('.notice.ok')).toContainText('removed permanently');
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  expect(await listFiles(page, dir)).not.toContain('other.md');
  expect(await trashFiles(page, dir)).toEqual([]);
});

test('the trash lists deleted notes, restores them later, and deletes forever only on a second click', async ({ page }) => {
  const dir = await openVault(page, VAULT);
  for (const title of ['other', 'Kickoff']) {
    await open(page, title);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Move to trash' }).click();
    await expect(page.locator('.notice.ok')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Trash (2)' }).click();
  await expect(page.locator('#note-trash')).toContainText('other.md');
  await expect(page.locator('#note-trash')).toContainText('notes/kickoff.md');

  await page.locator('.trow', { hasText: 'other.md' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(await readFile(page, dir, 'other.md')).toBe(VAULT['other.md']);

  // The trash list stays open after a restore.
  await expect(page.locator('#note-trash')).toContainText('Trash (1)');
  await page.locator('.trow', { hasText: 'notes/kickoff.md' }).getByRole('button', { name: 'Delete forever' }).click();
  // First click only arms it.
  expect(await trashFiles(page, dir)).toHaveLength(1);
  await page.getByRole('button', { name: 'Really delete?' }).click();
  await expect.poll(() => trashFiles(page, dir)).toEqual([]);
});

test('a note that changed on disk while you were deciding is not deleted', async ({ page }) => {
  const dir = await openVault(page, VAULT);
  await open(page, 'other');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await writeFileExternally(page, dir, 'other.md', 'changed by a sync tool\n');
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(page.locator('.notice.err')).toContainText('changed on disk, so it was not deleted');
  expect(await readFile(page, dir, 'other.md')).toBe('changed by a sync tool\n');
  expect(await trashFiles(page, dir)).toEqual([]);
});

test('deleting a project note warns that the project card goes away', async ({ page }) => {
  await openVault(page, { 'projects/site/index.md': '---\ntitle: Site\ntype: project\nactive: true\n---\nHome\n', 'projects/site/a.md': 'A' });
  await open(page, 'Site');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#note-banner')).toContainText('project card goes away');
});

test('the delete confirmation fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openVault(page, VAULT);
  await open(page, 'Kickoff');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently…' }).click();
  await expect(page.locator('#note-banner')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
