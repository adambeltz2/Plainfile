import { expect, test } from '@playwright/test';

test('the page links a valid manifest whose icons exist', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(`/${href}`);
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Plainfile', display: 'standalone', start_url: './' });
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
  await expect(page.getByRole('heading', { name: 'Plainfile' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
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
