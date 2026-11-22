import { expect, test } from '@playwright/test';
import { nav, noteItem, openVault } from './helpers';

/** A stand-in for Mermaid, so the test needs no network. It draws one box holding the source's first word. */
const STUB = `window.mermaid = { initialize() {}, async render(id, src) {
  if (/boom/.test(src)) throw new Error('Parse error on line 1');
  return { svg: '<svg data-stub="1" width="40" height="20"><text>' + src.trim().split(/\\s+/)[0] + '</text></svg>' };
} };`;

test.describe('mermaid diagrams', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((src) => {
      window.__plainfile!.mermaidUrl = `data:text/javascript,${encodeURIComponent(src)}`;
    }, STUB);
  });

  test('a mermaid block is drawn under its code, and the markdown stays as it was', async ({ page }) => {
    await openVault(page, { 'd.md': '---\ntitle: Diagram\n---\nBefore\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nAfter\n' });
    await nav(page, 'Notes').click();
    await (await noteItem(page, 'Diagram')).click();
    await expect(page.locator('.cm-mermaid svg[data-stub]')).toBeVisible();
    await expect(page.locator('.cm-mermaid text')).toHaveText('graph');
    await expect(page.locator('.cm-content')).toContainText('A-->B'); // the code is still there
  });

  test('a diagram that cannot be drawn says so and keeps the code; plain code blocks get nothing', async ({ page }) => {
    await openVault(page, { 'd.md': '---\ntitle: Diagram\n---\n```mermaid\nboom\n```\n\n```js\nconst a = 1;\n```\n' });
    await nav(page, 'Notes').click();
    await (await noteItem(page, 'Diagram')).click();
    await expect(page.locator('.cm-mermaid-err')).toContainText('Diagram not drawn: Parse error');
    await expect(page.locator('.cm-mermaid')).toHaveCount(1);
  });
});
