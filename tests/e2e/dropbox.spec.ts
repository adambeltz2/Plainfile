import { expect, test, type Page } from '@playwright/test';
import { FakeDropbox } from '../../test/helpers/fake-dropbox';

/** Puts a fake Dropbox (sign-in page, token service and API) behind the browser's network requests. */
async function fakeDropbox(page: Page, fake: FakeDropbox): Promise<{ tokenBodies: string[] }> {
  const tokenBodies: string[] = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' };
  await page.route('https://www.dropbox.com/oauth2/authorize*', (route) => {
    const u = new URL(route.request().url());
    const back = new URL(u.searchParams.get('redirect_uri') as string);
    if (u.searchParams.get('client_id') === 'DENY') back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', 'CODE123');
    back.searchParams.set('state', u.searchParams.get('state') === 'x' ? 'x' : (u.searchParams.get('state') as string));
    return route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.route('https://api.dropboxapi.com/oauth2/token', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    tokenBodies.push(route.request().postData() ?? '');
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'good', refresh_token: 'refresh1', expires_in: 14400 }),
    });
  });
  await page.route(/https:\/\/(api|content)\.dropboxapi\.com\/2\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST' } });
    const res = await fake.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() ?? undefined });
    return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'text/plain' }, body: await res.text() });
  });
  return { tokenBodies };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('connect Dropbox, open a folder from it, tick a task, and the file changes in Dropbox', async ({ page }) => {
  const fake = new FakeDropbox();
  fake.seed({ 'Notes/Hello.md': '# Hello\n- [ ] Call Dana due:2026-11-21\n', 'Notes/sub/Deep.md': 'See [[Hello]]', 'Other/Skip.md': 'not mine' });
  const { tokenBodies } = await fakeDropbox(page, fake);

  await page.getByRole('button', { name: 'Connect Dropbox' }).click();
  await page.locator('.cloud summary').click();
  await page.locator('#db-key').fill('TESTKEY');
  await page.locator('#db-root').fill('/Notes');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(page.locator('.nav')).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/); // the code is gone from the address
  await expect(page.locator('.tag-pill')).toContainText('Dropbox: Notes');
  await expect(page.locator('.task', { hasText: 'Call Dana' })).toBeVisible();
  const body = new URLSearchParams(tokenBodies[0]);
  expect(body.get('grant_type')).toBe('authorization_code');
  expect(body.get('code')).toBe('CODE123');
  expect(body.get('client_id')).toBe('TESTKEY');
  expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(body.has('client_secret')).toBe(false);

  await page.getByRole('button', { name: /Mark done: Call Dana/ }).click();
  await expect(page.locator('.diff .add')).toContainText('- [x] Call Dana');
  expect(fake.files.get('/notes/hello.md')?.content).toBe(`# Hello\n- [x] Call Dana due:2026-11-21 done:${new Date().toLocaleDateString('en-CA')}\n`);
  expect(fake.files.get('/other/skip.md')?.content).toBe('not mine');
});

test('a later visit offers to open Dropbox again without signing in, and Sign out forgets it', async ({ page }) => {
  const fake = new FakeDropbox();
  fake.seed({ 'Hello.md': '# Hello\n- [ ] Task one due:2026-11-21\n' });
  const { tokenBodies } = await fakeDropbox(page, fake);
  await page.getByRole('button', { name: 'Connect Dropbox' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click(); // no key typed: the built-in app
  await expect(page.locator('.nav')).toBeVisible();
  expect(tokenBodies.map((b) => new URLSearchParams(b).get('client_id'))).toEqual(['vfcwmj0eu2kdiud']);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Dropbox' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Dropbox' }).click();
  await expect(page.locator('.task', { hasText: 'Task one' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Connect Dropbox' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plainfile:dropbox'))).toBeNull();
});

test('a refused or mismatched sign-in says so and changes nothing', async ({ page }) => {
  await fakeDropbox(page, new FakeDropbox());
  await page.getByRole('button', { name: 'Connect Dropbox' }).click();
  await page.locator('.cloud summary').click();
  await page.locator('#db-key').fill('DENY');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.notice.err')).toContainText('not completed');
  await page.goto('/?code=abc&state=forged');
  await expect(page.locator('.notice.err')).toContainText('did not match this browser session');
  expect(await page.evaluate(() => localStorage.getItem('plainfile:dropbox'))).toBeNull();
});
