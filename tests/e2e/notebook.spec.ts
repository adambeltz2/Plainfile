import { expect, test, type Page } from '@playwright/test';
import { openVault, nav } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const view = (page: Page, name: RegExp | string) => page.locator('.side').getByRole('button', { name });

test('Follow-ups lists every #followup line and opens the note at that line', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await expect(view(page, /^Follow-ups/)).toContainText('1');
  await view(page, /^Follow-ups/).click();
  await expect(page.locator('.task .t')).toHaveText('Ask Dana to confirm the launch date');
  await page
    .getByRole('button', { name: /^Open projects\/website-relaunch\/index\.md|Website relaunch · line/ })
    .first()
    .click();
  await expect(page.locator('.cm-content')).toContainText('Ask Dana to confirm the launch date');
});

test('Projects shows numbered cards with previews and counts, like the first Notebook app', async ({ page }) => {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Today').click();
  await view(page, /^Projects/).click();
  const cards = page.locator('.pcard');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('.pnum')).toHaveText('1');
  await expect(cards.nth(0).locator('.ptitle')).toHaveText('Website relaunch');
  await expect(cards.nth(0)).toContainText('4 tasks');
  await expect(cards.nth(0)).toContainText('1 follow-up');
  await expect(cards.nth(1).locator('.pnum')).toHaveText('2');
  await expect(cards.nth(1)).toContainText('1 task');
  await cards.nth(1).locator('.pbtn').click();
  await expect(page.locator('.ed-head .title')).toHaveValue('Tax 2026');
});

test('inactive projects are kept, collapsed, and unnumbered; Notebook files work as they are', async ({ page }) => {
  await openVault(page, {
    'kitchen.md':
      '---\ntitle: "Kitchen Remodel"\nactive: true\nsortOrder: 1\n---\nCabinet quote came in at $14,200.\n\n- [ ] Order walnut sample panel #due:2026-09-20\n- Confirm oak vs walnut finish with Dana #followup\n',
    'archive.md': '---\ntitle: "Old Thing"\nactive: false\nsortOrder: 2\n---\nDone and dusted.\n',
  });
  await page
    .locator('.side')
    .getByRole('button', { name: /^Projects/ })
    .click();
  await expect(page.locator('.pcard')).toHaveCount(1);
  await expect(page.locator('.pcard')).toContainText('Cabinet quote came in at $14,200.');
  await expect(page.locator('.pcard')).not.toContainText('#followup');
  await page.getByRole('button', { name: 'Show 1 inactive project' }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await expect(page.locator('.pcard.off .pnum')).toHaveText('–');
  // The old #due: tag is read as a date on the task.
  await page
    .locator('.side')
    .getByRole('button', { name: /^All open/ })
    .click();
  await expect(page.locator('.task', { hasText: 'Order walnut sample panel' })).toContainText(/20 Sep/);
});

test('with no projects it explains how to make one', async ({ page }) => {
  await openVault(page, { 'a.md': 'plain' });
  await page
    .locator('.side')
    .getByRole('button', { name: /^Projects/ })
    .click();
  await expect(page.locator('.empty')).toContainText('sortOrder');
});
