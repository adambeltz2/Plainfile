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

test('files the browser refuses to read are skipped and listed, and the folder still opens', async ({ page }) => {
  await page.evaluate(async () => {
    const real = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function (this: FileSystemFileHandle) {
      if (this.name === 'bad.md') return Promise.reject(new TypeError("Failed to execute 'getFileHandle': Name is not allowed."));
      return real.call(this);
    };
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle(`skip-${Date.now()}`, { create: true });
    for (const [name, text] of [['good.md', '# Good\n- [ ] A task due:2026-01-01'], ['bad.md', '# Bad']] as const) {
      const w = await (await vault.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    }
    await window.__plainfile!.openHandle(vault, 'skippy');
  });
  await expect(page.locator('.nav')).toBeVisible();
  const notice = page.locator('.notice', { hasText: 'could not be read' });
  await expect(notice).toContainText('1 file could not be read and was skipped');
  await notice.locator('summary').click();
  await expect(notice).toContainText('bad.md');
  await expect(page.locator('.task', { hasText: 'A task' })).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.notice', { hasText: 'could not be read' })).toHaveCount(0);
});

test('a folder with no markdown notes says what it did find, and deep notes are found', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle(`empty-${Date.now()}`, { create: true });
    let d = vault;
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) d = await d.getDirectoryHandle(n, { create: true });
    const w = await (await d.getFileHandle('pic.png', { create: true })).createWritable();
    await w.write('x');
    await w.close();
    await (await vault.getDirectoryHandle('.git', { create: true })).getFileHandle('x', { create: true });
    await window.__plainfile!.openHandle(vault, 'nomd');
  });
  const n = page.locator('.notice', { hasText: 'No markdown notes were found' });
  await expect(n).toContainText('1 file in 7 folders, down to 7 levels deep');
  await expect(n).toContainText('.png 1');
  await expect(n).toContainText('There is no limit on how deep');
  await expect(n).toContainText('1 item whose names start with a dot');
});

test('notes many folders deep are found', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle(`deep-${Date.now()}`, { create: true });
    let d = vault;
    for (let i = 0; i < 15; i++) d = await d.getDirectoryHandle(`level${i}`, { create: true });
    const w = await (await d.getFileHandle('Deep note.md', { create: true })).createWritable();
    await w.write('# Deep note\n- [ ] Found me due:2026-11-21');
    await w.close();
    await window.__plainfile!.openHandle(vault, 'deepvault');
  });
  await expect(page.locator('.notice', { hasText: 'No markdown notes' })).toHaveCount(0);
  await expect(page.locator('.task', { hasText: 'Found me' })).toBeVisible();
});

test('reopening a folder reads only what changed, using the saved copy', async ({ page }) => {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle('cached-vault', { create: true });
    for (let i = 0; i < 40; i++) {
      const w = await (await vault.getFileHandle(`n${i}.md`, { create: true })).createWritable();
      await w.write(`# Note ${i}\n- [ ] task ${i} due:2026-01-01\n`);
      await w.close();
    }
    await window.__plainfile!.openHandle(vault, 'cached-vault');
  });
  await expect(page.locator('.nav, .tabbar').first()).toBeVisible();
  await page.waitForTimeout(500); // the copy is saved just after the folder opens
  // Count how many notes are read the second time.
  await page.evaluate(async () => {
    (window as unknown as { __reads: number }).__reads = 0;
    const real = Blob.prototype.text;
    Blob.prototype.text = function (this: Blob) {
      (window as unknown as { __reads: number }).__reads++;
      return real.call(this);
    };
    const root = await navigator.storage.getDirectory();
    const vault = await root.getDirectoryHandle('cached-vault');
    const w = await (await vault.getFileHandle('n7.md')).createWritable();
    await w.write('# Note 7 edited\n- [ ] task 7 due:2026-01-01\n');
    await w.close();
    await window.__plainfile!.openHandle(vault, 'cached-vault');
  });
  await expect(page.locator('.stat')).toContainText('from the saved copy');
  expect(await page.evaluate(() => (window as unknown as { __reads: number }).__reads)).toBe(1);
  await expect(page.locator('.task .t', { hasText: /^task 3$/ })).toBeVisible();
});
