import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { localDate, nav, noteItem, openVault } from './helpers';

/**
 * Accessibility smoke test: axe checks each screen, in light and dark, against WCAG 2 A and AA. It finds what a
 * machine can (names, roles, contrast, duplicate ids); it is not a substitute for trying the app with a keyboard
 * and a screen reader.
 */
const TODAY = localDate(0);
const VAULT: Record<string, string> = {
  'projects/site/index.md': `---\ntitle: Website\ntype: project\nactive: true\n---\n# Website\n- [ ] Overdue inline due:2020-01-01 @dana\n- [ ] Today inline due:${TODAY} #launch\n`,
  'projects/site/tasks/Fix footer.md': `---\ntitle: Fix footer\nstatus: doing\nproject: site\npeople: [dana]\ndue: ${TODAY}\n---\n\nFooter body\n`,
  'meetings/Kickoff.md': `---\ntitle: Kickoff\ndate: ${TODAY}\nattendees: [dana]\n---\nSee [[Fix footer]].\n\n| Item | Owner |\n| --- | --: |\n| Logo | Dana |\n`,
  'people/dana.md': '---\ntitle: Dana\ntype: person\n---\nDana\n',
};

const screens: { name: string; go: (p: Page) => Promise<void> }[] = [
  { name: 'Home', go: (p) => nav(p, 'Home').click() },
  { name: 'Today', go: (p) => nav(p, 'Today').click() },
  { name: 'Tasks', go: (p) => nav(p, 'Tasks').click() },
  { name: 'Projects', go: (p) => nav(p, 'Projects').click() },
  {
    name: 'Project hub',
    go: async (p) => {
      await nav(p, 'Projects').click();
      await p.locator('.pcard .pbtn').first().click();
    },
  },
  {
    name: 'Notes with a note open',
    go: async (p) => {
      await nav(p, 'Notes').click();
      await (await noteItem(p, 'Kickoff')).click();
      await expect(p.locator('.cm-content')).toBeVisible();
    },
  },
  { name: 'Search', go: (p) => nav(p, 'Search').click() },
  { name: 'Calendar', go: (p) => nav(p, 'Calendar').click() },
  { name: 'Journal', go: (p) => nav(p, 'Journal').click() },
  { name: 'People', go: (p) => nav(p, 'People').click() },
  { name: 'Insight', go: (p) => nav(p, 'Insight').click() },
  { name: 'Vault health', go: (p) => nav(p, /^Vault health/).click() },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const s of screens) {
      test(s.name, async ({ page }) => {
        await page.goto('/');
        await openVault(page, VAULT, true, 'home');
        await s.go(page);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cm-editor').analyze();
        const summary = results.violations.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes.length} × ${v.help}\n   ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join('\n   ')}`,
        );
        expect(summary, summary.join('\n')).toEqual([]);
      });
    }
  });
}
