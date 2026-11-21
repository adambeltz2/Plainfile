import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { listFiles, localDate, noteMenu, nav, openVault, readFileOrEmpty } from './helpers';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' });
  await page.goto('/');
});

const NOTE = '---\ntitle: Kickoff\ntags: [launch]\n---\n# Kickoff call\n\nMet **Dana** about [[Other|pricing]].\n\n- [ ] Send logos @dana due:2026-11-23 #launch\n- [x] Share link\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
const VAULT = { 'meetings/Kickoff.md': NOTE, 'Other.md': 'x' };

async function openKickoff(page: Page): Promise<string> {
  const dir = await openVault(page, VAULT);
  await nav(page, 'Notes').click();
  await (await (await import('./helpers')).noteItem(page, /^Kickoff$/)).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  return dir;
}

/** The clipboard after a copy finished (the page says so in the status line). */
const clip = async (page: Page) => {
  await expect(page.locator('#note-status')).toContainText(/^Copied/);
  return readClip(page);
};
const readClip = (page: Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const html = item?.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
    const plain = item?.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '';
    return { html, plain };
  });

test.describe('export', () => {
  test('Copy as formatted text puts clean HTML and plain text on the clipboard', async ({ page }) => {
    await openKickoff(page);
    await noteMenu(page, 'Copy as formatted text');
    await expect(page.locator('#note-status')).toContainText('Copied as formatted text');
    const { html, plain } = await clip(page);
    expect(html).toContain('<h1>Kickoff call</h1>');
    expect(html).toContain('<b>Dana</b>');
    expect(html).toContain('pricing');
    expect(html).toContain('☐ Send logos');
    expect(html).toContain('<table');
    for (const bad of ['title: Kickoff', '#launch', '@dana', 'due:', '[[']) expect(html, bad).not.toContain(bad);
    expect(plain).toContain('☑ Share link');
    expect(plain).not.toContain('**');
  });

  test('a selection is copied instead of the whole note, and the clean/keep switch changes what is left in', async ({ page }) => {
    await openKickoff(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await noteMenu(page, 'Copy as formatted text');
    const all = await clip(page);
    expect(all.html).toContain('Kickoff call');
    // Select only the last lines: move to the end and select back two lines.
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    await noteMenu(page, 'Copy as formatted text');
    await page.waitForTimeout(400);
    const part = await readClip(page);
    expect(part.html).toContain('<table');
    expect(part.html).not.toContain('Kickoff call');
    await noteMenu(page, /^Copies are clean/);
    await expect(page.locator('#note-status')).toContainText('now keep');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await noteMenu(page, 'Copy as formatted text');
    await page.waitForTimeout(400);
    expect((await readClip(page)).html).toContain('#launch');
  });

  test('Download as Word makes a real .docx with the note in it', async ({ page }) => {
    await openKickoff(page);
    const [download] = await Promise.all([page.waitForEvent('download'), noteMenu(page, /^Download as Word/)]);
    expect(download.suggestedFilename()).toBe('Kickoff.docx');
    const path = await download.path();
    const bytes = readFileSync(path!);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    const text = bytes.toString('latin1');
    expect(text).toContain('word/document.xml');
    expect(text).toContain('Kickoff call');
    expect(text).toContain('Send logos');
    expect(text).not.toContain('title: Kickoff');
  });

  test('Print or save as PDF is in the menu and the palette, and tells you what it is doing', async ({ page }) => {
    await openKickoff(page);
    await page.evaluate(() => {
      // The real print dialog is not something a test can drive; note that it was asked for.
      (window as unknown as { __printed: number }).__printed = 0;
      const real = HTMLIFrameElement.prototype;
      Object.defineProperty(real, 'contentWindow', {
        configurable: true,
        get() {
          const w = Object.getOwnPropertyDescriptor(Node.prototype, 'ownerDocument') ? null : null;
          return { focus() {}, print() { (window as unknown as { __printed: number }).__printed++; }, document: w };
        },
      });
    });
    await page.keyboard.press('Control+p');
    await page.keyboard.type('pdf');
    await expect(page.locator('.pal-item', { hasText: 'Print this note' })).toBeVisible();
    await page.keyboard.press('Escape');
    await noteMenu(page, /^Print or save as PDF/);
    await expect(page.locator('#note-status')).toContainText('print view');
  });
});

test.describe('project status report', () => {
  const FILES: Record<string, string> = {
    'projects/big/index.md': `---\ntitle: Big project\ntype: project\nactive: true\n---\n## Goal\nShip it\n## Phase 1\n- [ ] Late one @sam due:2020-01-01\n- [x] Done one\n- [ ] Soon @dana due:${localDate(3)}\n`,
  };

  async function openReport(page: Page): Promise<string> {
    const dir = await openVault(page, FILES);
    await nav(page, 'Projects').click();
    await page.locator('.pcard .pbtn').click();
    await page.locator('.hub-wide-actions').getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('.report-prev h1')).toHaveText('Big project: status');
    return dir;
  }

  test('previews the report, copies it for Word, and downloads it', async ({ page }) => {
    await openReport(page);
    await expect(page.locator('.report-prev')).toContainText('33% complete');
    await expect(page.locator('.report-prev')).toContainText('Late one');
    await expect(page.locator('.report-prev')).toContainText('Sam');
    await expect(page.locator('.report-prev table')).toBeVisible();
    await page.getByRole('button', { name: 'Copy as formatted text' }).click();
    await expect(page.locator('.report [role="status"]')).toContainText('Copied as formatted text');
    expect((await readClip(page)).html).toContain('<h1>Big project: status</h1>');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Word' }).click()]);
    expect(download.suggestedFilename()).toBe('Big project status.docx');
  });

  test('Save as a note files it under reports/ and opens it', async ({ page }) => {
    const dir = await openReport(page);
    await page.getByRole('button', { name: 'Save as a note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    const file = (await listFiles(page, dir)).find((f) => f.startsWith('reports/'));
    expect(file).toBe(`reports/Big project status ${localDate(0)}.md`);
    const text = await readFileOrEmpty(page, dir, file!);
    expect(text).toContain('type: report');
    expect(text).toContain('# Big project: status');
    expect(text).toContain('project: big');
  });
});
