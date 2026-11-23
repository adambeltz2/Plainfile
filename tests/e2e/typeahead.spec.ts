import { expect, test, type Page } from '@playwright/test';
import { localDate, openVault, readFile, readFileOrEmpty, nav } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const VAULT = {
  'people/dana.md': '---\ntitle: Dana Ortiz\ntype: person\naliases: [Dana]\n---\nBrand lead.\n',
  'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\nactive: true\n---\n',
  'projects/site/pricing-research.md': '---\ntitle: Pricing research\nproject: site\ntags: [launch, pricing]\nstatus: doing\n---\n- [ ] Call @sam\n',
  'draft.md': 'Draft',
  'fm.md': '---\ntitle: X\n---\nbody',
};
const options = (page: Page) => page.locator('.cm-tooltip-autocomplete li');

async function open(page: Page, name: string): Promise<void> {
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: new RegExp(`^${name}$`) }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}
/** CodeMirror re-queries a moment after typing; Enter pressed during that gap is a newline, not a choice. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}
async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

test.describe('in the editor', () => {
  test('[[ offers the notes that exist, filters as you type, and Enter completes the link', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, '\n[[');
    await expect(options(page).first()).toBeVisible();
    await expect(options(page).filter({ hasText: 'people/dana.md' })).toBeVisible();
    await expect(options(page).filter({ hasText: 'Pricing research' })).toContainText('projects/site/pricing-research.md');
    await page.keyboard.type('Pri');
    await expect(options(page)).toHaveCount(1);
    await settle(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe('Draft\n[[pricing-research]]');
  });

  test("a note's alias is offered too, and links to a nested note use the shortest name", async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, '\n[[Dan');
    await expect(options(page).filter({ hasText: 'alias of Dana Ortiz' })).toBeVisible();
  });

  test('# offers the tags in use, @ offers the people', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, '\n#la');
    await expect(options(page).filter({ hasText: 'launch' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type(' @sa');
    await expect(options(page).filter({ hasText: 'sam' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type(' @da');
    await expect(options(page).filter({ hasText: 'dana' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe('Draft\n#launch @sam @dana');
  });

  test('frontmatter values are offered: project, type, status and tags', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'X'); // the note's title
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.type('\nproject: s');
    await expect(options(page).filter({ hasText: 'site' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('\ntype: pro');
    await expect(options(page).filter({ hasText: 'project' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('\nstatus: wa');
    await expect(options(page).filter({ hasText: 'waiting' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('\ntags: [la');
    await expect(options(page).filter({ hasText: 'launch' })).toBeVisible();
    await settle(page);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'fm.md'), { timeout: 5000 })
      .toBe('---\ntitle: X\nproject: site\ntype: project\nstatus: waiting\ntags: [launch\n---\nbody');
  });

  test('suggestions do not appear where they would get in the way', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, ' price #5 and a@b.com and http://x.com/#frag');
    await expect(options(page)).toHaveCount(0);
  });

  test('Esc closes the suggestions first and only then leaves focus mode', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'draft');
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n#la');
    await expect(options(page).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(options(page)).toHaveCount(0);
    await expect(page.locator('.wrap.focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.wrap.focus')).toHaveCount(0);
  });
});

test.describe('Tab finishes a suggestion', () => {
  test('in the editor Tab accepts the highlighted suggestion, for links, tags and dates', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, '\n[[Pri');
    await expect(options(page)).toHaveCount(1);
    await settle(page);
    await page.keyboard.press('Tab');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe('Draft\n[[pricing-research]]');
    await page.keyboard.type('\n#la');
    await expect(options(page).first()).toContainText('launch');
    await settle(page);
    await page.keyboard.press('Tab');
    await page.keyboard.type(' due:to');
    await expect(options(page).first()).toContainText('today');
    await settle(page);
    await page.keyboard.press('Tab');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe(`Draft\n[[pricing-research]]\n#launch due:${localDate(0)}`);
  });
});

test.describe('dates', () => {
  test('due: in a note offers day words and writes the real date', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'draft');
    await typeAtEnd(page, '\n- [ ] Buy milk due:to');
    await expect(options(page)).toHaveText([/today/, /tomorrow/]);
    await expect(options(page).first()).toContainText(localDate(0));
    await settle(page);
    await page.keyboard.press('ArrowDown'); // today is first; down once is tomorrow
    await page.keyboard.press('Enter');
    await expect.poll(() => readFileOrEmpty(page, dir, 'draft.md'), { timeout: 5000 }).toBe(`Draft\n- [ ] Buy milk due:${localDate(1)}`);
  });

  test('due: in the frontmatter offers them too, and the one-line quick add offers the day word', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'X');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.type('\ndue: tom');
    await expect(options(page)).toHaveText([/tomorrow/]);
    await page.keyboard.press('Escape');
    await nav(page, 'Today').click();
    const box = page.locator('#quick-text');
    await box.click();
    await box.pressSequentially('Pay rent due:tom');
    await expect(page.locator('.suggest button')).toHaveText(['tomorrow']);
    await page.locator('.suggest button').click();
    await expect(box).toHaveValue('Pay rent due:tomorrow ');
  });
});

test.describe('in fields', () => {
  test('the one-line quick add offers people, tags and projects by their first character, and Enter still adds the task', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    const box = page.locator('#quick-text');
    await box.click();
    await box.pressSequentially('Call ');
    await expect(page.locator('.suggest')).toHaveCount(0);
    await box.pressSequentially('@sa');
    await expect(page.locator('.suggest button')).toHaveText(['sam']);
    await page.locator('.suggest button', { hasText: 'sam' }).click();
    await expect(box).toHaveValue('Call @sam ');
    await box.pressSequentially('#la');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Call @sam #launch ');
    await box.pressSequentially('+si');
    await expect(page.locator('.suggest button')).toHaveText(['site']);
    await page.keyboard.press('Escape');
    await box.press('Backspace');
    await box.press('Backspace');
    await box.press('Backspace');
    // With nothing highlighted, Enter submits as before.
    await box.press('Enter');
    await expect(page.locator('.diff .add')).toContainText('title: Call');
    await expect
      .poll(() => readFileOrEmpty(page, dir, 'tasks/Call.md'))
      .toBe(`---\ntitle: Call\nstatus: todo\ncreated: ${localDate(0)}\ntags: [launch]\npeople: [sam]\n---\n\n`);
  });

  test('template fields suggest too, joined with commas, for example attendees', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await page.getByRole('button', { name: '+ New' }).click();
    await page
      .locator('.modal')
      .getByRole('button', { name: /^Meeting/ })
      .click();
    await page.locator('#tpl-attendees').click();
    await expect(page.locator('.suggest button').first()).toBeVisible();
    await page.locator('.suggest button', { hasText: 'dana' }).click();
    await expect(page.locator('#tpl-attendees')).toHaveValue('dana, ');
    await expect(page.locator('#tpl-preview')).toContainText('people: [dana]');
    await page.locator('#tpl-attendees').pressSequentially('sa');
    await page.locator('.suggest button', { hasText: 'sam' }).click();
    await expect(page.locator('#tpl-preview')).toContainText('people: [dana, sam]');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, `meetings/${localDate(0)} Weekly sync.md`)).toContain('people: [dana, sam]');
  });

  test('the dropdown stays on screen on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, VAULT);
    await page.locator('#quick-text').pressSequentially('@');
    const box = await page.locator('.suggest').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
});
