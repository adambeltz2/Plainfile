import { expect, test, type Page } from '@playwright/test';
import { noteMenu, openVault, readFile, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const nav = (page: Page, name: RegExp | string) => page.locator('.nav').getByRole('button', { name });
const VAULT = {
  'inbox/Kickoff.md': '---\ntitle: Kickoff\n---\nSee [r](../ref/Other.md) and [[Other]] and [[ref/Other]].\n',
  'ref/Other.md': '# Other\nback: [k](../inbox/Kickoff.md) and [[inbox/Kickoff]] and [[Kickoff]]\n',
  'plain.md': 'no frontmatter',
};
async function open(page: Page, title: string): Promise<void> {
  await nav(page, 'Notes').click();
  await page.locator('.note-item', { hasText: new RegExp(`^${title}$`) }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
}

test.describe('landing', () => {
  test('Notes opens on a home with what changed today and folders, and reopens the last note', async ({ page }) => {
    await openVault(page, VAULT);
    await nav(page, 'Notes').click();
    await expect(page.locator('.notes-home')).toContainText('Modified today');
    await expect(page.locator('.notes-home .chip', { hasText: 'inbox/' })).toBeVisible();
    await page.locator('.notes-home .chip', { hasText: 'ref/' }).click();
    await expect(page.locator('#note-filter')).toHaveValue('ref/');
    await page.locator('#note-filter').fill('');
    await page.locator('.note-item', { hasText: /^Kickoff$/ }).click();
    await nav(page, 'Today').click();
    await nav(page, 'Notes').click();
    await expect(page.locator('.ed-head .title')).toHaveText('Kickoff');
  });
});

test.describe('the ⋯ More menu', () => {
  test('holds the actions, keeps Undo, Redo, Focus and X-ray in the header, and Esc closes it', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'Kickoff');
    for (const n of ['Undo', 'Redo', 'Focus', 'X-ray']) await expect(page.locator('.ed-actions').getByRole('button', { name: n, exact: true })).toBeVisible();
    await expect(page.locator('.ed-actions').getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
    await page.locator('.ed-actions').getByRole('button', { name: /More/ }).click();
    for (const l of ['X-ray', 'Explore related', 'History', 'Move to…', 'Rename', 'Duplicate', 'Pin to top', 'Copy link', 'Delete…']) await expect(page.locator('.ctx').getByRole('menuitem', { name: l })).toBeVisible();
    await expect(page.locator('.ctx')).not.toContainText('Add default frontmatter'); // it has some
    await page.keyboard.press('Escape');
    await expect(page.locator('.ctx')).toHaveCount(0);
    await open(page, 'plain');
    await page.locator('.ed-actions').getByRole('button', { name: /More/ }).click();
    await expect(page.locator('.ctx')).toContainText('Add default frontmatter');
  });

  test('Duplicate copies the note exactly, and Pin writes pinned: true and lists it first', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'Kickoff');
    await noteMenu(page, 'Duplicate');
    await expect(page.locator('.ed-head .path')).toHaveText('inbox/Kickoff copy.md');
    expect(await readFile(page, dir, 'inbox/Kickoff copy.md')).toBe(VAULT['inbox/Kickoff.md'].replace('title: Kickoff', 'title: "Kickoff copy"'));
    await noteMenu(page, 'Pin to top');
    await expect.poll(() => readFileOrEmpty(page, dir, 'inbox/Kickoff copy.md'), { timeout: 4000 }).toContain('pinned: true');
    await expect(page.locator('#note-list .folder', { hasText: 'Pinned' })).toBeVisible();
    await expect(page.locator('#note-list .note-quick').first()).toHaveAttribute('data-note', 'inbox/Kickoff copy.md');
    await noteMenu(page, 'Unpin');
    await expect.poll(() => readFileOrEmpty(page, dir, 'inbox/Kickoff copy.md'), { timeout: 4000 }).not.toContain('pinned');
  });
});

test.describe('move', () => {
  test('moves a note to a new folder with a preview of the links it fixes, and Undo moves it back exactly', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await open(page, 'Kickoff');
    await noteMenu(page, /^Move/);
    await expect(page.locator('.modal')).toContainText('Move “Kickoff”');
    await page.locator('#mv-dest').fill('projects/site');
    await expect(page.locator('.mvlist')).toContainText('New folder “projects/site”');
    await page.locator('#mv-dest').press('Enter');
    await expect(page.locator('.modal')).toContainText('projects/site/Kickoff.md');
    await expect(page.locator('.mvedits')).toContainText('](../../ref/Other.md)');
    await expect(page.locator('.mvedits')).toContainText('[[projects/site/Kickoff]]');
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.locator('.snack')).toContainText('projects/site/Kickoff.md');
    await expect(page.locator('.ed-head .path')).toHaveText('projects/site/Kickoff.md');
    expect(await readFile(page, dir, 'projects/site/Kickoff.md')).toContain('[r](../../ref/Other.md)');
    expect(await readFile(page, dir, 'ref/Other.md')).toBe('# Other\nback: [k](../projects/site/Kickoff.md) and [[projects/site/Kickoff]] and [[Kickoff]]\n');
    await page.locator('.snack').getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.ed-head .path')).toHaveText('inbox/Kickoff.md');
    expect(await readFile(page, dir, 'inbox/Kickoff.md')).toBe(VAULT['inbox/Kickoff.md']);
    expect(await readFile(page, dir, 'ref/Other.md')).toBe(VAULT['ref/Other.md']);
  });

  test('refuses the folder it is already in and a name that is taken', async ({ page }) => {
    await openVault(page, { 'a/n.md': 'x', 'b/n.md': 'y' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^n$/ }).first().click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.keyboard.press('Control+Shift+M');
    await page.locator('#mv-dest').fill('b');
    await page.locator('#mv-dest').press('Enter');
    await expect(page.locator('.modal .notice.err')).toContainText('already exists');
  });
});

test.describe('command palette and keys', () => {
  test('Ctrl+P finds a note by a few letters, and Enter opens it', async ({ page }) => {
    await openVault(page, VAULT);
    await page.keyboard.press('Control+p');
    await expect(page.locator('#pal-q')).toBeFocused();
    await page.keyboard.type('kck');
    await expect(page.locator('.pal-item').first()).toContainText('Kickoff');
    await page.keyboard.press('Enter');
    await expect(page.locator('.ed-head .title')).toHaveText('Kickoff');
    await expect(page.locator('.pal')).toHaveCount(0);
  });

  test('offers to create a note, run an action on the open note, or move a note you name', async ({ page }) => {
    await openVault(page, VAULT);
    await page.keyboard.press('Control+p');
    await page.keyboard.type('Brand new idea');
    await page.locator('.pal-item', { hasText: 'New note “Brand new idea”' }).click();
    await expect(page.locator('#tpl-title')).toHaveValue('Brand new idea');
    await page.locator('.modal').getByRole('button', { name: 'Close' }).click();

    await page.keyboard.press('Control+p');
    await page.keyboard.type('move kick');
    await page.locator('.pal-item', { hasText: 'Move “Kickoff”' }).click();
    await expect(page.locator('.modal')).toContainText('Move “Kickoff”');
    await expect(page.locator('.pal')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);

    await page.keyboard.press('Control+p');
    await page.keyboard.type('go to sea');
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-q')).toBeVisible();
    await page.keyboard.press('Control+p');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pal')).toHaveCount(0);
  });

  test('F2 renames, Ctrl+Shift+M moves, Ctrl+Shift+X toggles X-ray, and ? opens the cheat sheet', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'Kickoff');
    await page.keyboard.press('Control+Shift+X');
    await expect(page.locator('.ed-actions').getByRole('button', { name: 'X-ray', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+Shift+X');
    await page.keyboard.press('Control+Shift+M');
    await expect(page.locator('.modal')).toContainText('Move');
    await page.keyboard.press('Escape');
    await page.keyboard.press('F2');
    await expect(page.locator('#rn-name, .rn-name, input[name="rn"]').first().or(page.getByRole('heading', { name: /Rename/ })).first()).toBeVisible();
    await nav(page, 'Today').click();
    await page.keyboard.press('?');
    await expect(page.locator('.guide')).toBeVisible();
  });
});

test.describe('right-click or long-press a note', () => {
  test('opens the same actions without opening the note first', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Kickoff$/ }).click({ button: 'right' });
    await expect(page.locator('.ctx')).toContainText('Open');
    await expect(page.locator('.ctx')).not.toContainText('X-ray');
    await page.locator('.ctx').getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.locator('.ed-head .path')).toHaveText('inbox/Kickoff copy.md');
    expect(await readFile(page, dir, 'inbox/Kickoff copy.md')).toBe(VAULT['inbox/Kickoff.md'].replace('title: Kickoff', 'title: "Kickoff copy"'));
  });

  test('on a phone the menu is a bottom sheet that fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openVault(page, VAULT);
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Kickoff$/ }).click({ button: 'right' });
    const box = await page.locator('.ctx').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  });
});

test.describe('quick note', () => {
  test('one click makes a note titled with the date and time and puts the cursor in the body', async ({ page }) => {
    const dir = await openVault(page, VAULT);
    await nav(page, 'Notes').click();
    await page.locator('.notes-home').getByRole('button', { name: 'Quick note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const path = (await page.locator('.ed-head .path').textContent()) ?? '';
    expect(path).toMatch(/^inbox\/\d{4}-\d{2}-\d{2} \d{4}\.md$/);
    await page.keyboard.type('Called Dana about the launch');
    const stamp = path.replace('inbox/', '').replace('.md', '');
    await expect.poll(() => readFileOrEmpty(page, dir, path), { timeout: 5000 }).toMatch(
      new RegExp(`^---\\ntitle: "${stamp.slice(0, 10)} \\d\\d:\\d\\d"\\ncreated: ${stamp.slice(0, 10)}\\nproject:\\ntags: \\[\\]\\npeople: \\[\\]\\n---\\n\\nCalled Dana about the launch\\n$`),
    );
    await expect(page.locator('.ed-head .title')).toContainText(stamp.slice(0, 10));
  });

  test('is also in the New menu, the Go to palette and on Alt+N, and two in a minute do not collide', async ({ page }) => {
    await openVault(page, VAULT);
    await page.getByRole('button', { name: '+ New' }).click();
    await page.locator('.modal').getByRole('button', { name: /^Quick note/ }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const first = await page.locator('.ed-head .path').textContent();
    await page.keyboard.press('Alt+n');
    await expect(page.locator('.ed-head .path')).not.toHaveText(first ?? '');
    await page.keyboard.press('Control+p');
    await page.keyboard.type('quick');
    await page.locator('.pal-item', { hasText: 'Quick note' }).click();
    await expect(page.locator('.ed-head .path')).toHaveText(/ 3\.md$|\d{4} \d\.md$|\d{4}\.md$/);
    await nav(page, 'Notes').click();
    await expect(page.locator('#note-list .note-item')).toHaveCount(6); // three quick notes beside the three in the vault
  });
});
