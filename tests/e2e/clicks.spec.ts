import { expect, test, type Page } from '@playwright/test';
import { localDate, nav, openVault } from './helpers';

/**
 * The clickability audit: every place that lists a note or a task must take you to it. Each case goes to a
 * screen, clicks the row's title (not a special button) and expects the note to open in the editor.
 */
const TODAY = localDate(0);
const VAULT: Record<string, string> = {
  'projects/site/index.md': '---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n- [ ] Inline overdue due:2020-01-01 @dana\n',
  'projects/site/tasks/Fix footer.md': `---\ntitle: Fix footer\nstatus: todo\nproject: site\npeople: [dana]\ndue: ${TODAY}\ncreated: ${TODAY}\n---\n\nFooter body text\n`,
  'projects/site/Kickoff.md': `---\ntitle: Kickoff\ndate: ${TODAY}\nproject: site\nattendees: [dana]\n---\nKickoff body text\n`,
  'inbox/Loose.md': `---\ntitle: Loose note\ncreated: ${TODAY}\n---\nLoose body text\n`,
  'people/dana.md': '---\ntitle: Dana\ntype: person\n---\nDana body\n',
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const opened = async (page: Page, text: string): Promise<void> => {
  await expect(page.locator('.cm-content')).toContainText(text);
};

const cases: { name: string; go: (page: Page) => Promise<void>; click: string; expect: string }[] = [
  { name: 'Home, Today card', go: async (p) => nav(p, 'Home').click(), click: '.home-card li.task .t', expect: '' },
  { name: 'Home, Needs filing', go: async (p) => nav(p, 'Home').click(), click: '.home-card:has(h3:text-is("Needs filing")) .item', expect: '' },
  { name: 'Calendar day panel', go: async (p) => nav(p, 'Calendar').click(), click: '.cal-day li.task .t', expect: '' },
  { name: 'Calendar event chip', go: async (p) => nav(p, 'Calendar').click(), click: '.cal-cell.today .cal-ev.task', expect: '' },
  { name: 'People, person page task', go: async (p) => { await nav(p, 'People').click(); await p.locator('.portfolio [data-person]').first().click(); }, click: 'li.task .t', expect: '' },
  { name: 'People, person page note', go: async (p) => { await nav(p, 'People').click(); await p.locator('.portfolio [data-person]').first().click(); }, click: '.pnotes .res-btn, .pnotes button', expect: '' },
  { name: 'Board card', go: async (p) => nav(p, 'Board').click(), click: '.card .t, .card', expect: '' },
  { name: 'Project hub task row', go: async (p) => { await nav(p, 'Projects').click(); await p.locator('.pcard .pbtn').first().click(); }, click: '.hub-content li.task .t', expect: '' },
  { name: 'All tasks list', go: async (p) => { await nav(p, 'Projects').click(); await p.getByRole('button', { name: 'All tasks' }).click(); }, click: '.hub-content li.task .t', expect: '' },
  { name: 'Project hub timeline item', go: async (p) => { await nav(p, 'Projects').click(); await p.locator('.pcard .pbtn').first().click(); await p.getByRole('tab', { name: 'Timeline' }).or(p.getByRole('button', { name: 'Timeline' })).first().click(); }, click: '.tlitem', expect: '' },
  { name: 'Search result', go: async (p) => { await nav(p, 'Search').click(); await p.locator('#search-q').fill('body'); }, click: '.res-btn', expect: '' },
  { name: 'Recent row', go: async (p) => nav(p, 'Recent').click(), click: '.recent-row td:first-child', expect: '' },
  { name: 'Insight drill list', go: async (p) => { await nav(p, 'Insight').click(); await p.getByRole('button', { name: /behind: Notes changed this month/ }).click(); }, click: '.home-rows .item', expect: '' },
];

test.describe('clickability audit', () => {
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await openVault(page, VAULT, true, 'today');
      await c.go(page);
      const target = page.locator(c.click).first();
      await expect(target).toBeVisible();
      await target.click();
      if (c.expect) await opened(page, c.expect);
      else await expect(page.locator('.cm-content')).toBeVisible();
    });
  }
});
