import { expect, test, type Page } from '@playwright/test';
import { listFiles, noteMenu, openVault, readFile, readFileOrEmpty, nav, noteItem } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

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
    await expect(page.locator('.ed-head .title')).toHaveValue('Kickoff');
  });
});

test.describe('the ⋯ More menu', () => {
  test('holds the actions, keeps Undo, Redo, Focus and X-ray in the header, and Esc closes it', async ({ page }) => {
    await openVault(page, VAULT);
    await open(page, 'Kickoff');
    for (const n of ['Undo', 'Redo', 'Focus', 'X-ray']) await expect(page.locator('.ed-actions').getByRole('button', { name: n, exact: true })).toBeVisible();
    await expect(page.locator('.ed-actions').getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
    await page.locator('.ed-actions').getByRole('button', { name: /More/ }).click();
    for (const l of ['X-ray', 'Explore related', 'History', 'Move to…', 'Rename', 'Duplicate', 'Pin to top', 'Copy link', 'Delete…'])
      await expect(page.locator('.ctx').getByRole('menuitem', { name: l })).toBeVisible();
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
    await expect(page.locator('.ed-head .title')).toHaveValue('Kickoff');
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
    await expect(
      page
        .locator('#rn-name, .rn-name, input[name="rn"]')
        .first()
        .or(page.getByRole('heading', { name: /Rename/ }))
        .first(),
    ).toBeVisible();
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
    await (await noteItem(page, /^Kickoff$/)).click({ button: 'right' });
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
    await expect
      .poll(() => readFileOrEmpty(page, dir, path), { timeout: 5000 })
      .toMatch(
        new RegExp(
          `^---\\ntitle: "${stamp.slice(0, 10)} \\d\\d:\\d\\d"\\ncreated: ${stamp.slice(0, 10)}\\nproject:\\ntags: \\[\\]\\npeople: \\[\\]\\n---\\n\\nCalled Dana about the launch\\n$`,
        ),
      );
    await expect(page.locator('.ed-head .title')).toHaveValue(new RegExp('^' + stamp.slice(0, 10)));
  });

  test('is also in the New menu, the Go to palette and on Alt+N, and two in a minute do not collide', async ({ page }) => {
    await openVault(page, VAULT);
    await page.getByRole('button', { name: '+ New' }).click();
    await page
      .locator('.modal')
      .getByRole('button', { name: /^Quick note/ })
      .click();
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

test.describe('paste an image', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  async function pasteImage(page: Page): Promise<void> {
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
      document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG);
  }

  test('a pasted screenshot is saved in _attachments, linked relative to the note, and shown in the editor', async ({ page }) => {
    const dir = await openVault(page, { 'projects/site/Note.md': 'Intro text\n' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Note$/ }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await pasteImage(page);
    await expect(page.locator('.cm-img-el')).toBeVisible();
    expect(await page.locator('.cm-img-el').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1);
    const files = (await listFiles(page, dir)).filter((f) => f.startsWith('_attachments/'));
    expect(files).toHaveLength(1);
    const name = files[0]!.replace('_attachments/', '');
    await expect.poll(() => readFileOrEmpty(page, dir, 'projects/site/Note.md'), { timeout: 5000 }).toBe(`Intro text\n![](../../_attachments/${name})\n`);
    // A second paste is a second file, never an overwrite.
    await pasteImage(page);
    await expect.poll(async () => (await listFiles(page, dir)).filter((f) => f.startsWith('_attachments/')).length).toBe(2);
    // The markdown is one keypress away: moving onto the image line shows it.
    await page.locator('.cm-img-el').first().click();
    await expect(page.locator('.cm-line', { hasText: '![](../../_attachments/' }).first()).toBeVisible();
  });

  test('Insert image… in the ⋯ menu saves a picked file the same way as a paste', async ({ page }) => {
    const dir = await openVault(page, { 'Note.md': 'Intro text\n' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^Note$/ }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), noteMenu(page, /^Insert image/)]);
    await chooser.setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    await expect(page.locator('.cm-img-el')).toBeVisible();
    const files = (await listFiles(page, dir)).filter((f) => f.startsWith('_attachments/'));
    expect(files).toHaveLength(1);
    await expect.poll(() => readFileOrEmpty(page, dir, 'Note.md'), { timeout: 5000 }).toContain(`![](_attachments/${files[0]!.replace('_attachments/', '')})`);
  });

  test('a note that is not editable by paste still ignores text pastes normally', async ({ page }) => {
    await openVault(page, { 'n.md': 'x' });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^n$/ }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', ' pasted words');
      document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.cm-content')).toContainText('x pasted words');
    await expect(page.locator('.cm-img-el')).toHaveCount(0);
  });
});

test('clicking the title changes it: Enter saves just the title line, Escape puts the old one back', async ({ page }) => {
  const text = '---\ntitle: Alpha\ncreated: 2026-11-21\n---\nBody\n';
  const dir = await openVault(page, { 'a.md': text });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Alpha')).click();
  const title = page.locator('#note-title');
  await expect(title).toHaveValue('Alpha');
  await title.fill('Beta: the sequel');
  await title.press('Escape');
  await expect(title).toHaveValue('Alpha');
  await title.fill('Beta: the sequel');
  await title.press('Enter');
  await expect.poll(() => readFile(page, dir, 'a.md')).toBe('---\ntitle: "Beta: the sequel"\ncreated: 2026-11-21\n---\nBody\n');
  await expect(page.locator('.note-item', { hasText: 'Beta: the sequel' }).first()).toBeVisible();
});

test.describe('links in a note', () => {
  test('clicking a link opens that note, and a missing one can be created', async ({ page }) => {
    await page.goto('/');
    const dir = await openVault(page, {
      'plan/index.md': '---\ntitle: Plan\n---\nGo to [[Target note]] then [[Not there yet]].\n',
      'plan/Target note.md': '---\ntitle: Target note\n---\nHello target\n',
    });
    await nav(page, 'Notes').click();
    await (await noteItem(page, /^Plan$/)).click();
    await page.locator('.cm-content').click(); // leave the line, so the links render
    await page.keyboard.press('Control+End');
    await page.keyboard.type('x'); // move off the line with the links
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.locator('.cm-link', { hasText: 'Target note' }).click();
    await expect(page.locator('#note-title')).toHaveValue('Target note');
    await (await noteItem(page, /^Plan$/)).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.locator('.cm-link', { hasText: 'Not there yet' }).click();
    await expect(page.locator('#note-banner')).toContainText('There is no note called');
    await page.getByRole('button', { name: /^Create plan\/Not there yet\.md/ }).click();
    await expect(page.locator('#note-title')).toHaveValue('Not there yet');
    expect(await readFile(page, dir, 'plan/Not there yet.md')).toBe(`---\ntitle: Not there yet\ncreated: ${new Date().toLocaleDateString('en-CA')}\n---\n\n`);
  });
});

test('the list and details panes can be hidden on a wide screen, and stay hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openVault(page, { 'a.md': '---\ntitle: Alpha\n---\nBody\n' });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Alpha')).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.frame.notes > .side')).toBeVisible();
  const wide = (await page.locator('.editor-main').boundingBox())!.width;
  await page.getByRole('button', { name: 'Notes list' }).click();
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.locator('.frame.notes > .side')).toBeHidden();
  await expect(page.locator('#note-side')).toBeHidden();
  expect((await page.locator('.editor-main').boundingBox())!.width).toBeGreaterThan(wide + 400);
  expect(await page.evaluate(() => localStorage.getItem('plainfile.panes'))).toBe('{"list":false,"details":false}');
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.locator('#note-side')).toBeVisible();
});

test('a link typed just now can be clicked right away, and creating it opens the new note', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '---\ntitle: Alpha\n---\nBody\n' });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Alpha')).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('See [[Fresh idea');
  await page.keyboard.press('Escape');
  await page.keyboard.type(']] now');
  const at = await page.evaluate(() => {
    const w = document.createTreeWalker(document.querySelector('.cm-content')!, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = (n.textContent ?? '').indexOf('Fresh');
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 5);
        const b = r.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  });
  await page.mouse.click(at!.x, at!.y);
  await expect(page.locator('#note-banner')).toContainText('There is no note called');
  await page.getByRole('button', { name: /^Create / }).click();
  await expect(page.locator('#note-title')).toHaveValue('Fresh idea');
});

test('the note header shows a word count and reading time that follow what you type', async ({ page }) => {
  await page.goto('/');
  await openVault(page, { 'a.md': '---\ntitle: Alpha\n---\nOne two three four five.\n' });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Alpha')).click();
  await expect(page.locator('#note-stats')).toHaveText('5 words · 1 min read');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' six seven');
  await expect(page.locator('#note-stats')).toHaveText('7 words · 1 min read');
});

test('Linked from shows each linking note by title with the line the link is on, and opens it there', async ({ page }) => {
  await page.goto('/');
  await openVault(page, {
    'target.md': '---\ntitle: Target\n---\nBody\n',
    'one.md': '---\ntitle: First source\n---\nIntro\nSee the [[Target]] for the plan, it matters.\n',
    'two.md': '# Second source\n\nAlso [[target|this one]].\n',
    'none.md': 'Nothing here.\n',
  });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Target')).click();
  const list = page.locator('#note-side .backlinks');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText('First source');
  await expect(list).toContainText('See the [[Target]] for the plan, it matters.');
  await expect(list).toContainText('Second source');
  await expect(list).toContainText('Also [[target|this one]].');
  await list.getByRole('button', { name: 'First source' }).click();
  await expect(page.locator('#note-title')).toHaveValue('First source');
});

test.describe('editor keys and paste', () => {
  async function open(page: import('@playwright/test').Page, text: string): Promise<string> {
    const dir = await openVault(page, { 'n.md': text });
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: /^n$/ }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    return dir;
  }

  test('Tab and Shift+Tab nest and un-nest a list item, and leave other lines to move focus', async ({ page }) => {
    await page.goto('/');
    const dir = await open(page, '- one\n- two\n\nplain\n');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect.poll(() => readFileOrEmpty(page, dir, 'n.md')).toBe('- one\n  - two\n\nplain\n');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => readFileOrEmpty(page, dir, 'n.md')).toBe('- one\n- two\n\nplain\n');
    // On a plain line Tab does not type an indent.
    await page.keyboard.press('Control+End');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1200);
    expect(await readFileOrEmpty(page, dir, 'n.md')).toBe('- one\n- two\n\nplain\n');
  });

  test('pasting a web address over selected text makes a link of it', async ({ page }) => {
    await page.goto('/');
    const dir = await open(page, 'See the docs here\n');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); // after "See "
    await page.keyboard.press('Shift+Control+ArrowRight'); // selects "the"
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'https://example.com/docs');
      document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => readFileOrEmpty(page, dir, 'n.md')).toBe('See [the](https://example.com/docs) docs here\n');
  });
});

test('each side panel has its own Hide button, and an edge tab brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await openVault(page, { 'a.md': '---\ntitle: Alpha\n---\nBody\n' });
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'Alpha')).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  const wide = (await page.locator('.editor-main').boundingBox())!.width;
  await page.getByRole('button', { name: 'Collapse left pane' }).click();
  await expect(page.locator('.frame.notes > .side')).toBeHidden();
  await page.getByRole('button', { name: 'Collapse right pane' }).click();
  await expect(page.locator('#note-side')).toBeHidden();
  expect((await page.locator('.editor-main').boundingBox())!.width).toBeGreaterThan(wide + 400);
  await expect(page.getByRole('button', { name: 'Collapse left pane' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand right pane' }).click();
  await expect(page.locator('#note-side')).toBeVisible();
  await page.getByRole('button', { name: 'Expand left pane' }).click();
  await expect(page.locator('.frame.notes > .side')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Expand/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('plainfile.panes'))).toBe('{"list":true,"details":true}');
});
