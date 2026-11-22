import { expect, test, type Page } from '@playwright/test';
import { openVault, noteMenu, nav } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});


async function sample(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await nav(page, 'Explore').click();
}

test.describe('explore', () => {
  test('starts with the most connected notes and shows a note\'s links and graph', async ({ page }) => {
    await sample(page);
    await expect(page.locator('.empty, .meta').first()).toBeVisible();
    await expect(page.locator('#explore-list .item').first()).toBeVisible();
    await page.locator('#explore-list').getByRole('button', { name: /^Pricing research/ }).click();
    await expect(page.locator('.ed-head .title')).toHaveText('Pricing research');
    await expect(page.locator('.gn.focus')).toHaveCount(1);
    expect(await page.locator('.gn').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.xgrid h3', { hasText: 'Linked from' })).toContainText('2');
    await expect(page.locator('.xgrid h3', { hasText: 'Links to' })).toContainText('0');
    // The line each link sits on is shown, as context.
    await expect(page.locator('.xgrid')).toContainText('pricing-research');
  });

  test('lists related notes that nothing links yet, with the reason', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-list').getByRole('button', { name: /^Pricing research/ }).click();
    const rel = page.locator('.xwide', { has: page.locator('h3', { hasText: 'Related, not linked' }) });
    await expect(rel).toContainText('Pricing psychology');
    await expect(rel.locator('.xrow', { hasText: 'Pricing psychology' })).toContainText('#pricing');
    // Notes already linked are not offered again.
    await expect(rel).not.toContainText('Website relaunch');
  });

  test('clicking a note in the graph moves the focus there, and Back returns', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-list').getByRole('button', { name: /^Pricing research/ }).click();
    await page.locator('.gn', { hasText: 'Website relaunch' }).click();
    await expect(page.locator('.ed-head .title')).toHaveText('Website relaunch');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.ed-head .title')).toHaveText('Pricing research');
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  });

  test('a list entry also moves the focus, and Open edits the note', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-list').getByRole('button', { name: /^Website relaunch/ }).click();
    await page.locator('.xgrid').getByRole('button', { name: 'Kickoff call with Dana' }).first().click();
    await expect(page.locator('.ed-head .title')).toHaveText('Kickoff call with Dana');
    await page.getByRole('button', { name: 'Open note' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.locator('.ed-head .title')).toHaveValue('Kickoff call with Dana');
  });

  test('2 hops draws more of the neighbourhood than 1 hop', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-list').getByRole('button', { name: /^Website relaunch/ }).click();
    const one = await page.locator('.gn').count();
    await page.getByRole('button', { name: '2 hops' }).click();
    expect(await page.locator('.gn').count()).toBeGreaterThan(one);
    await expect(page.getByRole('button', { name: '2 hops' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('graph nodes work from the keyboard', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-list').getByRole('button', { name: /^Website relaunch/ }).click();
    const node = page.locator('.gn', { hasText: 'Pricing research' });
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ed-head .title')).toHaveText('Pricing research');
  });

  test('the Notes screen has an Explore button for the open note', async ({ page }) => {
    await page.getByRole('button', { name: 'Try the sample vault' }).click();
    await nav(page, 'Notes').click();
    await page.locator('.note-item', { hasText: 'Kickoff call with Dana' }).click();
    await noteMenu(page, /^Explore/);
    await expect(page.locator('.ed-head .title')).toHaveText('Kickoff call with Dana');
    await expect(page.locator('.gn.focus')).toHaveCount(1);
  });

  test('the find box looks notes up by title', async ({ page }) => {
    await sample(page);
    await page.locator('#explore-find').fill('psych');
    await expect(page.locator('#explore-list .item')).toHaveCount(1);
    await page.locator('#explore-list .item').click();
    await expect(page.locator('.ed-head .title')).toHaveText('Pricing psychology');
    await page.locator('#explore-find').fill('zzzz');
    await expect(page.locator('#explore-list')).toContainText('No notes match');
  });

  test('finds notes that mention each other by name without a link', async ({ page }) => {
    await openVault(page, {
      'people/dana.md': '---\ntitle: Dana Ortiz\n---\nBrand lead.\n',
      'a.md': 'Met Dana Ortiz at lunch about the logo.\n',
      'b.md': 'Already linked: [[Dana Ortiz]].\n',
    });
    await nav(page, 'Explore').click();
    await page.locator('#explore-find').fill('Dana');
    await page.locator('#explore-list .item').first().click();
    const inbound = page.locator('.xgrid > div', { has: page.locator('h3', { hasText: 'Mention this note without linking' }) });
    await expect(inbound).toContainText('a');
    await expect(inbound.locator('mark')).toHaveText('Dana Ortiz');
    await expect(inbound).not.toContainText('Already linked');
    // From the other side: note a mentions Dana without linking.
    await page.locator('#explore-find').fill('');
    await page.locator('#explore-find').fill('a');
    await page.locator('#explore-list .item', { hasText: /^a$/ }).click();
    const outbound = page.locator('.xgrid > div', { has: page.locator('h3', { hasText: 'Mentioned here without a link' }) });
    await expect(outbound).toContainText('Dana Ortiz');
  });

  test('a note with no links or look-alikes says there is nothing to draw', async ({ page }) => {
    await openVault(page, { 'lonely.md': 'Nothing connects here.\n' });
    await nav(page, 'Explore').click();
    await expect(page.locator('#explore-list')).toContainText('No links between notes yet');
    await page.locator('#explore-find').fill('lonely');
    await page.locator('#explore-list .item').click();
    await expect(page.locator('.graph-wrap')).toContainText('nothing to draw');
  });

  test('fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await sample(page);
    await page.locator('.side-toggle').click();
    await page.locator('#explore-list').getByRole('button', { name: /^Website relaunch/ }).click();
    await page.getByRole('button', { name: '2 hops' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
