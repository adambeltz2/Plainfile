import { expect, test } from '@playwright/test';
import { nav, noteItem, openVault } from './helpers';

// Text from a user's files is drawn into the page as HTML in many places. This puts markup that would run code into every
// kind of value (title, tag, person, project, status, heading, file name) and visits every screen: none of it may run or become an element.
const EVIL = '<img src=x data-xss=1 onerror="window.__xss=1">';
const EVIL2 = '"><svg data-xss=1 onload="window.__xss=1"></svg>';

test('markup in note titles, tags, people, projects and file names is shown as text on every screen and never runs', async ({ page }) => {
  await page.goto('/');
  await openVault(
    page,
    {
      'projects/evil/index.md': `---\ntitle: ${EVIL}\ntype: project\nactive: true\n---\n- [ ] ${EVIL} @${EVIL2} #${EVIL2} due:2026-12-01\n`,
      'notes/<b data-xss=1>bold</b>.md': `---\ntitle: ${EVIL2}\ntags: [${EVIL2}]\npeople: [${EVIL}]\nproject: ${EVIL}\nstatus: ${EVIL2}\n---\n# ${EVIL}\n- [ ] ${EVIL} due:2026-12-02\n- [ ] another #followup ${EVIL2}\nlink [[${EVIL}]] and [[<i data-xss=1>x</i>]]\n`,
      'people/evil.md': `---\ntitle: ${EVIL}\ntype: person\ncompany: ${EVIL2}\n---\nhi\n`,
      'journal/2026-12-01.md': `---\ntitle: ${EVIL2}\ntype: journal\ndate: 2026-12-01\n---\n${EVIL}\n`,
    },
    true,
    'home',
  );
  const clean = async (where: string): Promise<void> => {
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `markup ran on ${where}`).toBeUndefined();
    expect(await page.locator('[data-xss]').count(), `markup became an element on ${where}`).toBe(0);
  };
  await clean('Home');
  for (const name of ['Tasks', 'Projects', 'Notes', 'Calendar', 'Search', 'Journal', 'People', 'Insight', 'Vault health']) {
    await nav(page, name).click();
    await page.waitForTimeout(150);
    await clean(name);
  }
  await nav(page, 'Search').click();
  await page.locator('#search-q').fill('img');
  await page.waitForTimeout(150);
  await clean('a search for the markup');
  await page.locator('#search-q').fill('evil');
  await page.waitForTimeout(150);
  await clean('a search for the project');
  await page.getByRole('button', { name: 'Explore' }).click();
  await page.waitForTimeout(300);
  await clean('Explore');
  await page.keyboard.press('Control+p');
  await page.keyboard.type('img');
  await page.waitForTimeout(200);
  await clean('the Go to box');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '+ New' }).click();
  await page.waitForTimeout(150);
  await clean('the New menu');
  await page.keyboard.press('Escape');
  await nav(page, 'Home').click();
  await page
    .getByRole('button', { name: /weekly review/i })
    .first()
    .click();
  await page.waitForTimeout(300);
  await clean('the weekly review');
  await nav(page, 'Notes').click();
  await (await noteItem(page, 'data-xss')).first().click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.waitForTimeout(300);
  await clean('an open note');
  await nav(page, 'Projects').click();
  await page.locator('.pcard .pbtn, [data-open-project]').first().click();
  await page.waitForTimeout(300);
  await clean('a project page');
});
