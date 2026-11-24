import { expect, test } from '@playwright/test';
import { listFiles, nav, openVault, readFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const proj = (title: string, active = true): string => `---\ntitle: ${title}\ntype: project\nactive: ${active}\n---\n- [ ] ${title} task\n`;

async function openSite(page: import('@playwright/test').Page, files: Record<string, string>): Promise<string> {
  const dir = await openVault(page, { 'projects/site/index.md': proj('Site'), ...files });
  await nav(page, 'Projects').click();
  await page.locator('.pcard', { hasText: 'Site' }).first().locator('.pbtn').click();
  await expect(page.locator('.hubwrap')).toBeVisible();
  return dir;
}

test.describe('sub-projects', () => {
  test('+ Sub-project files a project folder inside the parent, and the parent lists it', async ({ page }) => {
    const dir = await openSite(page, {});
    await page.getByRole('button', { name: '+ Sub-project' }).first().click();
    await page.locator('#tpl-title').fill('Media Plan');
    await page.getByRole('button', { name: 'Create file' }).click();
    await expect.poll(() => listFiles(page, dir)).toContain('projects/site/media-plan/index.md');
    expect(await readFile(page, dir, 'projects/site/media-plan/index.md')).toContain('type: project');
    await nav(page, 'Projects').click();
    await page.locator('.pcard', { hasText: 'Site' }).first().locator('.pbtn').click();
    await expect(page.locator('.hub-subs')).toContainText('Media Plan');
  });

  test('a sub-project opens with a link back, is indented in the list, and Close out waits for its sub-projects', async ({ page }) => {
    const dir = await openSite(page, { 'projects/site/media/index.md': proj('Media') });
    await expect(page.locator('.hub-subs li')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Close out', exact: true }).first()).toBeDisabled();
    await expect(page.locator('.hub-subs')).toContainText('Close out the open sub-project before closing this project');
    await page.locator('.hub-subs').getByRole('button', { name: 'Media' }).click();
    await expect(page.locator('.hubwrap .meta')).toContainText('Part of Site');
    await expect(page.locator('.hub-pick option', { hasText: '– Media' })).toHaveCount(1);
    // Close the sub-project: no folder move is offered, and then the parent can be closed.
    await page.getByRole('button', { name: 'Close out', exact: true }).first().click();
    await expect(page.locator('.notice', { hasText: 'Close out “Media”?' })).toBeVisible();
    await expect(page.locator('#close-move')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close out', exact: true }).last().click();
    await expect(page.locator('.notice', { hasText: 'Archived.' })).toBeVisible();
    expect(await listFiles(page, dir)).toContain('projects/site/media/index.md'); // closing a sub-project does not move its folder
    await page.locator('.hubwrap .meta').getByRole('button', { name: 'Site' }).click();
    await expect(page.getByRole('button', { name: 'Close out', exact: true }).first()).toBeEnabled();
  });

  test('tasks in a sub-project count in the parent, and the Projects list shows only the parent as numbered', async ({ page }) => {
    await openVault(page, { 'projects/site/index.md': proj('Site'), 'projects/site/media/index.md': proj('Media') });
    await nav(page, 'Projects').click();
    await expect(page.locator('.pcard')).toHaveCount(2);
    await expect(page.locator('.pcard').first().locator('.chips')).toContainText('2 open tasks');
    await expect(page.locator('.pcard').nth(1).locator('.pnum')).toHaveText('↳');
  });
});
