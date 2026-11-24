import { expect, test } from '@playwright/test';
import { nav, noteItem, openVault } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const filler = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}`).join('\n\n');
const LONG = `---\ntitle: Long\n---\n# Long\n${filler}\n## Middle\n${filler}\n### Deep\nEnd\n`;

async function open(page: import('@playwright/test').Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await (await noteItem(page, title)).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('contents', () => {
  test('headings are listed in Properties, and clicking one jumps there', async ({ page }) => {
    await openVault(page, { 'long.md': LONG });
    await open(page, 'Long');
    const items = page.locator('#note-side .outline button');
    await expect(items).toHaveText(['Long', 'Middle', 'Deep']);
    await items.nth(2).click();
    await expect(page.locator('.cm-line', { hasText: 'Deep' })).toBeInViewport();
    await items.nth(1).click();
    await expect(page.locator('.cm-line', { hasText: 'Middle' })).toBeInViewport();
  });

  test('a note with fewer than two headings has no Contents, and the list can be hidden', async ({ page }) => {
    await openVault(page, { 'one.md': '# Only\nText\n', 'long.md': LONG });
    await open(page, 'Only');
    await expect(page.getByRole('heading', { name: /^Contents/ })).toHaveCount(0);
    await open(page, 'Long');
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(page.locator('#note-side .outline')).toHaveCount(0);
    await page.getByRole('button', { name: /^Show 3/ }).click();
    await expect(page.locator('#note-side .outline button')).toHaveCount(3);
  });

  test('a heading typed into the note appears in the list', async ({ page }) => {
    await openVault(page, { 'd.md': '# One\nText\n' });
    await open(page, 'One');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n## Added');
    await expect(page.locator('#note-side .outline button')).toHaveText(['One', 'Added']);
  });
});
