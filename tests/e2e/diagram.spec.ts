import { expect, test } from '@playwright/test';
import { addFileExternally, listFiles, nav, openVault, readFileOrEmpty } from './helpers';

// A draw.io diagram saved as `name.drawio.svg` is a picture in the note, edited in draw.io itself.
const svg = (fill: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30" content="&lt;mxfile&gt;${fill}&lt;/mxfile&gt;"><rect width="40" height="30" fill="${fill}"/></svg>`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

async function openFlow(page: import('@playwright/test').Page): Promise<string> {
  const dir = await openVault(page, {
    'notes/Flow.md': '# Flow\n\n![Flow chart](../_attachments/flow.drawio.svg)\n\n![Logo](../_attachments/logo.svg)\n\nend\n',
    '_attachments/flow.drawio.svg': svg('#000000'),
    '_attachments/logo.svg': svg('#444444'),
  });
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: /^Flow$/ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  return dir;
}

test('a .drawio.svg shows as a picture with an Edit diagram button; an ordinary image has none', async ({ page }) => {
  await openFlow(page);
  await expect(page.locator('.cm-img-el')).toHaveCount(2);
  expect(
    await page
      .locator('.cm-img-el')
      .first()
      .evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBe(40);
  await expect(page.locator('.cm-img-edit')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Edit diagram Flow chart' })).toBeVisible();
});

test('Edit diagram asks where the folder is (once), changes nothing, and the picture is redrawn when the window is back', async ({ page }) => {
  const dir = await openFlow(page);
  const before = await readFileOrEmpty(page, dir, 'notes/Flow.md');
  const first = await page.locator('.cm-img-el').first().getAttribute('src');
  await page.getByRole('button', { name: 'Edit diagram Flow chart' }).click();
  await expect(page.getByRole('group', { name: 'Where is this folder' })).toBeVisible();
  expect(await readFileOrEmpty(page, dir, 'notes/Flow.md')).toBe(before); // pressing the button never writes
  // The diagram is changed in draw.io (another program); coming back to this window shows the new version.
  await page.waitForTimeout(30);
  await addFileExternally(page, dir, '_attachments/flow.drawio.svg', svg('#ff0000'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.locator('.cm-img-el').first().getAttribute('src')).not.toBe(first);
  expect(
    await page
      .locator('.cm-img-el')
      .first()
      .evaluate((i: HTMLImageElement) => i.naturalWidth),
  ).toBe(40);
  expect(await readFileOrEmpty(page, dir, 'notes/Flow.md')).toBe(before);
});

test('dropping a .drawio.svg saves it with its own name and links it, with the Edit diagram button', async ({ page }) => {
  const dir = await openVault(page, { 'notes/Plain.md': 'Intro\n' });
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: /^Plain$/ }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.evaluate(async (text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'flow2.drawio.svg', { type: 'image/svg+xml' }));
    document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, svg('#0000ff'));
  await expect(page.locator('.cm-img-el')).toBeVisible();
  await expect(page.locator('.cm-img-edit')).toHaveCount(1);
  expect((await listFiles(page, dir)).filter((f) => f.startsWith('_attachments/'))).toEqual(['_attachments/flow2.drawio.svg']);
  await expect.poll(() => readFileOrEmpty(page, dir, 'notes/Plain.md'), { timeout: 5000 }).toContain('![](../_attachments/flow2.drawio.svg)');
});
