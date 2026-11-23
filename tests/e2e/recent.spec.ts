import { expect, test } from '@playwright/test';
import { nav, openVault, readFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Recent lists notes newest first and filters them', async ({ page }) => {
  await openVault(page, { 'alpha.md': '# Alpha\n', 'notes/beta.md': '# Beta\n' }, true, 'today');
  await nav(page, 'Recent').click();
  await expect(page.locator('.title')).toHaveText('Recent');
  await expect(page.locator('.recent-row').first()).toContainText('Today');
  await expect(page.locator('.recent-row')).toHaveCount(2);
  await page.locator('#recent-q').fill('beta');
  await expect(page.locator('.recent-row')).toHaveCount(1);
  await expect(page.locator('.recent-row')).toContainText('notes');
  await page.locator('.recent-row').click();
  await expect(page.locator('#note-title')).toHaveValue('Beta');
});

test('Recent orders by last change, shows Show more past 60 notes, and says when a filter matches nothing', async ({ page }) => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 70; i++) files[`n/note-${String(i).padStart(2, '0')}.md`] = `# Note ${i}\n`;
  const dir = await openVault(page, files, true, 'today');
  await nav(page, 'Recent').click();
  await expect(page.locator('.recent-row')).toHaveCount(60);
  await page.getByRole('button', { name: /^Show more \(10 left\)/ }).click();
  await expect(page.locator('.recent-row')).toHaveCount(70);
  await page.locator('#recent-q').fill('zzz-nothing');
  await expect(page.getByText('No note matches that.')).toBeVisible();
  await page.locator('#recent-q').fill('note-05');
  await page.locator('.recent-row').click();
  await expect(page.locator('.cm-content')).toContainText('Note 5');
  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await expect.poll(() => readFile(page, dir, 'n/note-05.md')).toContain('edited');
  await nav(page, 'Recent').click();
  await expect(page.locator('.recent-row').first()).toContainText('Note 5');
});

test('tasks can be opened from Calendar and People, not only from Today', async ({ page }) => {
  await openVault(
    page,
    {
      'projects/site/index.md': '---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n',
      'tasks/Fix footer.md': `---\ntitle: Fix footer\nstatus: todo\nproject: site\npeople: [dana]\ndue: ${new Date().toLocaleDateString('en-CA')}\n---\n\nFooter body text\n`,
    },
    true,
    'today',
  );
  await nav(page, 'Calendar').click();
  await page.locator('.cal-trow li.task .t, .tasks li.task .t').filter({ hasText: 'Fix footer' }).first().click();
  await expect(page.locator('.cm-content')).toContainText('Footer body text');
  await nav(page, 'People').click();
  await page.locator('.portfolio [data-person]').first().click();
  await page.locator('li.task .t', { hasText: 'Fix footer' }).first().click();
  await expect(page.locator('.cm-content')).toContainText('Footer body text');
});
