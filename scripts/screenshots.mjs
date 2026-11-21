// Regenerates the README screenshots from the sample vault. Run: npm run build && npm run serve (in another shell),
// then: node scripts/screenshots.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = 'docs/screenshots';
const browser = await chromium.launch();

async function session(viewport, scheme, scale = 1) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Try the sample vault' }).click();
  await page.locator('.wrap').waitFor();
  return page;
}
const nav = (page, name) => page.locator('.nav').getByRole('button', { name }).click();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

let page = await session({ width: 1280, height: 800 }, 'light');
await shot(page, 'home');
await nav(page, 'Today');
await shot(page, 'today');
await page.locator('#quick-text').fill('Send logos +website-relaunch @dana #launch due:friday');
await page.locator('#quick-text').blur();
await page.screenshot({ path: `${OUT}/quick-add.png`, clip: { x: 0, y: 60, width: 1280, height: 200 } });
await nav(page, 'Calendar');
await shot(page, 'calendar');
await nav(page, 'Projects');
await page.locator('.pcard .pbtn').first().click();
await page.locator('.pstats').waitFor();
await shot(page, 'project');
await page.getByRole('tab', { name: 'Board' }).click();
await shot(page, 'project-board');
await page.getByRole('tab', { name: 'Tasks' }).click();
await nav(page, 'Board');
await shot(page, 'board');
await nav(page, 'Notes');
await page.locator('.notes-home').waitFor().catch(() => undefined);
await shot(page, 'notes-home');
await page.locator('.note-item', { hasText: 'Kickoff' }).first().click();
await page.locator('.cm-content').waitFor();
await shot(page, 'notes');
await page.locator('.ed-actions').getByRole('button', { name: /More/ }).click();
await shot(page, 'notes-menu');
await page.locator('.ctx').getByRole('menuitem', { name: /^Move/ }).click();
await page.locator('#mv-dest').fill('projects/archive');
await page.locator('#mv-dest').press('Enter');
await shot(page, 'move');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+p');
await page.keyboard.type('pri');
await shot(page, 'palette');
await page.keyboard.press('Escape');
await nav(page, 'Search');
await page.getByRole('button', { name: 'Modified today' }).click();
await shot(page, 'search');
await nav(page, 'Recent');
await shot(page, 'recent');
await nav(page, 'Insight');
await shot(page, 'insight');
await nav(page, 'Explore');
await shot(page, 'explore');
await page.getByRole('button', { name: 'Dark' }).first().click().catch(() => undefined);
await nav(page, 'Today');
await shot(page, 'today-dark');
await page.context().close();

page = await session({ width: 390, height: 800 }, 'light', 2);
await shot(page, 'phone-today');
await browser.close();
