import { expect, test, type Page } from '@playwright/test';
import { FakeOneDrive } from '../../test/helpers/fake-onedrive';

/** Puts a fake OneDrive (Microsoft sign-in page, token service, Graph API and upload address) behind the browser's network requests. */
async function fakeOneDrive(page: Page, fake: FakeOneDrive, opts: { refreshFails?: boolean } = {}): Promise<{ tokenBodies: string[] }> {
  const tokenBodies: string[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
  await page.route('https://login.microsoftonline.com/common/oauth2/v2.0/authorize*', (route) => {
    const u = new URL(route.request().url());
    const back = new URL(u.searchParams.get('redirect_uri') as string);
    if (u.searchParams.get('client_id') === 'DENY') {
      back.searchParams.set('error', 'access_denied');
      back.searchParams.set('error_description', 'The user cancelled');
    } else back.searchParams.set('code', 'CODE123');
    back.searchParams.set('state', u.searchParams.get('state') as string);
    return route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.route('https://login.microsoftonline.com/common/oauth2/v2.0/token', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postData() ?? '';
    tokenBodies.push(body);
    if (opts.refreshFails && new URLSearchParams(body).get('grant_type') === 'refresh_token')
      return route.fulfill({
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description:
            'AADSTS700084: The refresh token was issued to a single page app (SPA), and therefore has a fixed, limited lifetime of 01:00:00:00.',
        }),
      });
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'good', refresh_token: 'refresh1', expires_in: 3600 }),
    });
  });
  await page.route(/https:\/\/(graph\.microsoft\.com\/v1\.0|upload\.fake\.test)\/.*/, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const res = await fake.fetch(req.url(), {
      method: req.method(),
      headers: req.headers(),
      body: (req.postDataBuffer() ?? undefined) as unknown as BodyInit | undefined,
    });
    return route.fulfill({
      status: res.status,
      headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'text/plain' },
      body: Buffer.from(await res.arrayBuffer()),
    });
  });
  return { tokenBodies };
}

/** Opens "Use my own OneDrive app" and types an app ID. */
async function ownId(page: Page, id: string): Promise<void> {
  await page.locator('.cloud summary').click();
  await page.locator('#od-id').fill(id);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('connect OneDrive, open a folder from it, tick a task, and the file changes in OneDrive', async ({ page }) => {
  const fake = new FakeOneDrive();
  fake.seed({ 'Notes/Hello.md': '# Hello\n- [ ] Call Dana due:2026-11-21\n', 'Notes/sub/Deep.md': 'See [[Hello]]', 'Other/Skip.md': 'not mine' });
  const { tokenBodies } = await fakeOneDrive(page, fake);

  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await ownId(page, 'TESTID');
  await page.locator('#od-root').fill('Notes');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(page.locator('.nav')).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/); // the code is gone from the address
  await expect(page.locator('.tag-pill')).toContainText('OneDrive: Notes');
  await expect(page.locator('.task', { hasText: 'Call Dana' })).toBeVisible();
  const body = new URLSearchParams(tokenBodies[0]);
  expect(body.get('grant_type')).toBe('authorization_code');
  expect(body.get('code')).toBe('CODE123');
  expect(body.get('client_id')).toBe('TESTID');
  expect(body.get('scope')).toBe('Files.ReadWrite offline_access');
  expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(body.has('client_secret')).toBe(false);

  await page.getByRole('button', { name: /Mark done: Call Dana/ }).click();
  await expect(page.locator('.diff .add')).toContainText('- [x] Call Dana');
  await expect.poll(() => fake.text('Notes/Hello.md')).toBe(`# Hello\n- [x] Call Dana due:2026-11-21 done:${new Date().toLocaleDateString('en-CA')}\n`);
  expect(fake.text('Other/Skip.md')).toBe('not mine');
  expect(fake.authOnUpload).toBe(false);
});

test('a later visit offers to open OneDrive again without signing in, and Sign out forgets it', async ({ page }) => {
  const fake = new FakeOneDrive();
  fake.seed({ 'Hello.md': '# Hello\n- [ ] Task one due:2026-11-21\n' });
  await fakeOneDrive(page, fake);
  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await ownId(page, 'TESTID');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.nav')).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Open OneDrive' }).click();
  await expect(page.locator('.task', { hasText: 'Task one' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Connect OneDrive' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plainfile:onedrive'))).toBeNull();
});

test('the built-in app ID is used when none is typed; a refused or mismatched sign-in says so and changes nothing', async ({ page }) => {
  const fake = new FakeOneDrive();
  fake.seed({ 'Hello.md': '# Hello\n' });
  const { tokenBodies } = await fakeOneDrive(page, fake);
  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.nav')).toBeVisible();
  expect(new URLSearchParams(tokenBodies[0]).get('client_id')).toBe('ci-test-client');
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await ownId(page, 'DENY');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.notice.err')).toContainText('not completed');
  await page.goto('/?code=abc&state=forged');
  await expect(page.locator('.notice.err')).toContainText('did not match this browser session');
  expect(await page.evaluate(() => localStorage.getItem('plainfile:onedrive'))).toBeNull();
});

test('when Microsoft ends the sign-in (a browser sign-in lasts a day), it says so and offers Connect again', async ({ page }) => {
  const fake = new FakeOneDrive();
  fake.seed({ 'Hello.md': '# Hello\n' });
  await fakeOneDrive(page, fake, { refreshFails: true });
  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await ownId(page, 'TESTID');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.nav')).toBeVisible();

  // A day later: the saved access token has run out, and the refresh is refused.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('plainfile:onedrive') as string);
    s.tokens.expiresAt = 1;
    localStorage.setItem('plainfile:onedrive', JSON.stringify(s));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open OneDrive' }).click();
  await expect(page.locator('.notice.err')).toContainText('sign-in has expired');
  await expect(page.getByRole('button', { name: 'Connect OneDrive' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plainfile:onedrive'))).toBeNull();
});

test("the Dropbox and OneDrive sign-ins do not take each other's return", async ({ page }) => {
  await fakeOneDrive(page, new FakeOneDrive());
  await page.getByRole('button', { name: 'Connect OneDrive' }).click();
  await ownId(page, 'DENY');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('.notice.err')).toContainText('OneDrive sign-in was not completed');
  await expect(page.locator('.notice.err')).not.toContainText('Dropbox');
});
