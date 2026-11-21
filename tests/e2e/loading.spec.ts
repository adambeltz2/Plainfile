import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/** Fill an origin-private folder with many notes, then start opening it without waiting for it to finish. */
async function startOpening(page: Page, count: number): Promise<void> {
  await page.evaluate(async (count) => {
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle(`big-${Date.now()}`, { create: true });
    for (let f = 0; f < count / 100; f++) {
      const dir = await vault.getDirectoryHandle(`f${f}`, { create: true });
      for (let i = 0; i < 100; i++) {
        const w = await (await dir.getFileHandle(`n${i}.md`, { create: true })).createWritable();
        await w.write(`# Note ${f}-${i}\n\n- [ ] task ${i} [[n${(i + 1) % 100}]]\n`);
        await w.close();
      }
    }
    void window.__plainfile!.openHandle(vault, 'big-vault');
  }, count);
}

test('a big folder shows a progress bar with counts and time instead of a static message', async ({ page }) => {
  await startOpening(page, 1500);
  await expect(page.locator('#load-bar')).toBeVisible();
  await expect(page.locator('#load-text')).toContainText(/files found|Checking files|Reading notes/);
  await expect(page.locator('#load-time')).toContainText(/\d+ s/);
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.locator('.nav')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#load-bar')).toHaveCount(0);
});

test('Cancel stops reading and returns to the first screen without an error', async ({ page }) => {
  await startOpening(page, 2500);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Try the sample vault' })).toBeVisible();
  await expect(page.locator('.notice.err')).toHaveCount(0);
  await expect(page.locator('#load-bar')).toHaveCount(0);
});
