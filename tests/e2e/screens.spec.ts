import { expect, test, type Page } from '@playwright/test';
import { localDate, openVault, readFile, writeFileExternally } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const nav = (page: Page, name: RegExp | string) => page.locator('.nav').getByRole('button', { name });
async function openNoteInEditor(page: Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: title }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('quick add and New menu', () => {
  test('quick add creates the Inbox and appends without touching what is there', async ({ page }) => {
    const today = localDate(0);
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.locator('#quick-text').fill('Call Dana due:today');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toHaveText(`+- [ ] Call Dana due:${today} created:${today}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toBe(`# Inbox\n\n- [ ] Call Dana due:${today} created:${today}\n`);
    await expect(page.locator('.task .t', { hasText: 'Call Dana' })).toBeVisible();

    await page.locator('#quick-text').fill('Second one');
    await page.locator('#quick-text').press('Enter');
    await expect(page.locator('.diff .add')).toHaveText(`+- [ ] Second one created:${today}`);
    expect(await readFile(page, dir, 'inbox/Inbox.md')).toBe(`# Inbox\n\n- [ ] Call Dana due:${today} created:${today}\n- [ ] Second one created:${today}\n`);
  });

  test('+ New from a template shows a live preview, creates the file, and opens it in the editor', async ({ page }) => {
    const dir = await openVault(page, { 'a.md': '# A\n' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Meeting/ }).click();
    await page.locator('#tpl-title').fill('Kickoff');
    await page.locator('#tpl-attendees').fill('dana, sam');
    await page.locator('#tpl-project').fill('site');
    await expect(page.locator('#tpl-preview')).toContainText('project: site');
    await expect(page.locator('#tpl-path')).toHaveText(`meetings/${localDate(0)} Kickoff.md`);
    await expect(page.locator('#tpl-preview')).toContainText('people: [dana, sam]');
    await page.getByRole('button', { name: 'Create file' }).click();

    await expect(page.locator('.cm-content')).toBeVisible();
    const text = await readFile(page, dir, `meetings/${localDate(0)} Kickoff.md`);
    expect(text).toContain('title: Kickoff\ntype: meeting');
    expect(text).not.toContain('{{');
    await expect(page.locator('.cm-fm').first()).toBeVisible();
  });

  test('a taken file name is never overwritten', async ({ page }) => {
    const dir = await openVault(page, { 'inbox/Idea.md': 'mine' });
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Note/ }).click();
    await page.locator('#tpl-title').fill('Idea');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    expect(await readFile(page, dir, 'inbox/Idea.md')).toBe('mine');
    expect(await readFile(page, dir, 'inbox/Idea 2.md')).toContain('title: Idea');
  });
});

test.describe('live editor', () => {
  test('typing "* [ ] " becomes a checkbox right away and is saved as "- [ ]"', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Plain paragraph.' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n* [ ] New thing');
    await expect(page.locator('.cm-cb')).toHaveCount(1);
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Plain paragraph.\n- [ ] New thing');
    await expect(page.locator('.diff .add')).toContainText('- [ ] New thing');
  });

  test('# becomes a heading and the file keeps the markdown', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Intro' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n# Big title');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-h1')).toHaveCount(1);
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Intro\n# Big title\n');
  });

  test('clicking a checkbox in the editor ticks it in the file', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Text\n- [ ] Do it\n- [ ] Other' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-cb').first().click();
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('Text\n- [x] Do it\n- [ ] Other');
  });

  test('X-ray shows the raw markdown and turns the styling off', async ({ page }) => {
    await openVault(page, { 'n.md': '# Title\n- [ ] Do it **now**' });
    await openNoteInEditor(page, 'Title');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cm-cb')).toHaveCount(1);
    await page.getByRole('button', { name: 'X-ray' }).click();
    await expect(page.locator('.cm-cb')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('# Title');
    await expect(page.locator('.cm-content')).toContainText('- [ ] Do it **now**');
    await page.getByRole('button', { name: 'X-ray' }).click();
    await expect(page.locator('.cm-cb')).toHaveCount(1);
  });

  test('a due date chip opens a quick picker that rewrites only the date', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Intro line\n- [ ] Pay rent due:2026-12-01 #home\n' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-due').click();
    await page.getByRole('menuitem', { name: /^Tomorrow/ }).click();
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe(`Intro line\n- [ ] Pay rent due:${localDate(1)} #home\n`);
  });

  test('the properties panel edits one frontmatter line and nothing else', async ({ page }) => {
    const text = '---\ntitle: Copy   # keep\nstatus: todo\n---\nBody stays.\n';
    const dir = await openVault(page, { 'p/tasks/copy.md': text });
    await openNoteInEditor(page, 'Copy');
    await page.locator('#prop-status').selectOption('doing');
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'p/tasks/copy.md')).toBe(text.replace('status: todo', 'status: doing'));
    await page.getByRole('button', { name: 'Show YAML' }).click();
    await expect(page.locator('.yaml')).toContainText('status: doing');
  });

  test('a file changed elsewhere while you edit is never overwritten', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'Original' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await writeFileExternally(page, dir, 'n.md', 'Changed by a sync tool');
    await page.keyboard.type(' plus my edit');
    await expect(page.locator('#note-banner')).toContainText('changed on disk');
    expect(await readFile(page, dir, 'n.md')).toBe('Changed by a sync tool');
    await page.getByRole('button', { name: 'Reload from disk' }).click();
    await expect(page.locator('.cm-content')).toContainText('Changed by a sync tool');
    expect(await readFile(page, dir, 'n.md')).toBe('Changed by a sync tool');
  });

  test('the text cursor is visible in dark mode and in light mode', async ({ page }) => {
    for (const [scheme, rgb] of [['dark', 'rgb(255, 255, 255)'], ['light', 'rgb(0, 0, 0)']] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await openVault(page, { 'n.md': 'Some text' });
      await openNoteInEditor(page, 'n');
      await page.locator('.cm-content').click();
      expect(await page.locator('.cm-content').evaluate((el) => getComputedStyle(el).caretColor), scheme).toBe(rgb);
    }
  });

  test('CRLF files keep their line endings', async ({ page }) => {
    const dir = await openVault(page, { 'n.md': 'One\r\n- [ ] Two\r\n' });
    await openNoteInEditor(page, 'n');
    await page.locator('.cm-cb').click();
    await expect(page.locator('#note-status')).toHaveText('Saved');
    expect(await readFile(page, dir, 'n.md')).toBe('One\r\n- [x] Two\r\n');
  });
});

test.describe('search', () => {
  test('finds notes and tasks, narrows with operators, and opens a result in the editor', async ({ page }) => {
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await nav(page, 'Search').click();
    await page.locator('#search-q').fill('pricing');
    await expect(page.locator('#search-count')).toContainText('result');
    await expect(page.locator('#search-results mark').first()).toBeVisible();
    await page.locator('#search-q').fill('is:open tag:launch');
    await expect(page.locator('#search-results .res')).toHaveCount(4);
    await page.locator('#search-q').fill('type:meeting');
    await page.locator('.res-btn', { hasText: 'Kickoff call with Dana' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.locator('.ed-head .title')).toHaveText('Kickoff call with Dana');
  });

  test('facets narrow the query', async ({ page }) => {
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await nav(page, 'Search').click();
    await page.locator('#search-q').fill('is:task');
    await page.locator('[data-add="tag:admin"]').click();
    await expect(page.locator('#search-q')).toHaveValue('is:task tag:admin');
    await expect(page.locator('#search-results .res')).toHaveCount(1);
  });
});

test.describe('vault health', () => {
  test('lists problems and fixes a broken link by editing only the link text', async ({ page }) => {
    const text = 'Intro\nSee [[pricing-reserach|the research]] now.  \n';
    const dir = await openVault(page, { 'a.md': text, 'pricing-research.md': 'x' });
    await nav(page, /^Vault health/).click();
    await expect(page.locator('.res')).toHaveCount(1);
    await page.getByRole('button', { name: 'Link to pricing-research' }).click();
    await expect(page.locator('.diff .add')).toContainText('[[pricing-research|the research]]');
    expect(await readFile(page, dir, 'a.md')).toBe(text.replace('reserach', 'research'));
    await expect(page.locator('.empty')).toContainText('Nothing to fix');
  });

  test('other checks list duplicates and orphans, and Open jumps to the note', async ({ page }) => {
    await openVault(page, { 'a/x.md': 'one', 'b/x.md': 'two' });
    await nav(page, /^Vault health/).click();
    await page.getByRole('button', { name: /^Duplicate names/ }).click();
    await expect(page.locator('.res')).toContainText('a/x.md, b/x.md');
    await page.getByRole('button', { name: /^Orphan notes/ }).click();
    await page.locator('.res').getByRole('button', { name: 'Open' }).first().click();
    await expect(page.locator('.cm-content')).toBeVisible();
  });
});

test('every screen fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  for (const name of ['Today', 'Notes', 'Search', /^Vault health/]) {
    await nav(page, name).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, String(name)).toBeLessThanOrEqual(0);
  }
  await page.getByRole('button', { name: '+ New' }).click();
  await expect(page.locator('.modal')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('on a phone the note list gives way to the open note, with an All notes button back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Notes').click();
  await expect(page.locator('#note-list')).toBeVisible();
  await page.locator('.note-item', { hasText: 'Kickoff call with Dana' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('#note-list')).toBeHidden();
  // The buttons stay on one line each.
  const xray = await page.getByRole('button', { name: 'X-ray' }).boundingBox();
  expect(xray!.height).toBeLessThan(50);
  await page.getByRole('button', { name: 'All notes' }).click();
  await expect(page.locator('#note-list')).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveCount(0);
});

test('on a wide screen the list and the note sit side by side and there is no All notes button', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: 'Kickoff call with Dana' }).click();
  await expect(page.locator('#note-list')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All notes' })).toBeHidden();
});

test('a very large folder shows a capped note list with a Show more button, and the filter still finds everything', async ({ page }) => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 650; i++) files[`bulk/note-${String(i).padStart(4, '0')}.md`] = `Note number ${i}\n`;
  await openVault(page, files);
  await nav(page, 'Notes').click();
  await expect(page.locator('.note-item')).toHaveCount(300);
  await expect(page.locator('#note-list')).toContainText('Showing 300 of 650 notes');
  await page.getByRole('button', { name: 'Show 300 more' }).click();
  await expect(page.locator('.note-item')).toHaveCount(600);
  await page.locator('#note-filter').fill('0649');
  await expect(page.locator('.note-item')).toHaveCount(1);
  // The open note stays in the list even when it sorts beyond the limit.
  await page.locator('#note-filter').fill('');
  await page.locator('.note-item').first().click();
  await expect(page.locator('.cm-content')).toBeVisible();
});
