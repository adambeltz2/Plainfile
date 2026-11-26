import { expect, test } from '@playwright/test';
import { nav, openVault } from './helpers';

test('the page links a valid manifest whose icons exist', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(`/${href}`);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'tendfile', display: 'standalone', start_url: './' });
  for (const icon of m.icons as { src: string; sizes: string }[]) {
    const r = await request.get(`/${icon.src}`);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
});

test('a service worker takes over and the app opens with no connection', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker, and the shell is cached
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'tendfile' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Tasks').click();
  await expect(page.locator('.title')).toHaveText('All tasks');
  await context.setOffline(false);
});

test('a fresh worker is named for the app version and clears caches left by the earlier app', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Leave a cache like the one the earlier Notebook app made, then start over so a new worker activates.
  await page.evaluate(async () => {
    await caches.open('notebook-v0.12.1');
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.unregister();
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('notebook-v0.12.1');
  const names = await page.evaluate(() => caches.keys());
  expect(names.some((n: string) => /^plainfile-\d+\.\d+\.\d+$/.test(n))).toBe(true);
});

test('Chromium reports no reasons the app cannot be installed', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors, JSON.stringify(installabilityErrors)).toEqual([]);
});

test('the manifest offers New task, Today and Search shortcuts that open the app on those screens', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(new URL(href!, page.url()).toString())).json()) as { shortcuts: { name: string; url: string }[] };
  expect(manifest.shortcuts.map((s) => s.name)).toEqual(['New task', 'Today', 'Search']);
  for (const s of manifest.shortcuts) expect(s.url).toMatch(/^\.\/\?go=(quick|today|search)$/);
});

for (const [go, check] of [
  ['search', '#search-q'],
  ['quick', '#quick-text'],
  ['today', '.hub-dash .cell.on'],
] as const) {
  test(`opening ?go=${go} lands on the right screen once a folder is open`, async ({ page }) => {
    await page.goto(`/?go=${go}`);
    await openVault(page, { 'a.md': '- [ ] A thing due:2999-01-01\n' }, true, 'home');
    await expect(page.locator(check).first()).toBeVisible();
    if (go !== 'today') await expect(page.locator(check).first()).toBeFocused();
    expect(new URL(page.url()).search).toBe('');
  });
}

test('the editor is split off and loaded when a note is first opened, and the worker keeps it for offline', async ({ page, request }) => {
  let chunkBytes = 0;
  const pending: Promise<void>[] = [];
  page.on('response', (r) => {
    if (/\/chunk-[^/]+\.js$/.test(r.url())) pending.push(r.body().then((b) => void (chunkBytes += b.length)));
  });
  await page.goto('/');
  await openVault(page, { 'a.md': '# A\n' }, true, 'home');
  await page.waitForTimeout(300);
  await Promise.all(pending);
  const before = chunkBytes;
  expect(before).toBeLessThan(250_000); // the big editor chunk is not needed yet
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: /^A$/ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await Promise.all(pending);
  expect(chunkBytes).toBeGreaterThan(before + 300_000);
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toMatch(/"\.\/chunk-[A-Z0-9]+\.js"/);
});
