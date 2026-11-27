// Measures how long the app takes to create a note in a large vault, with the CPU slowed down like a phone.
//   NO_MINIFY=1 SOURCEMAP=1 npm run build && node scripts/serve.mjs & node scripts/perf.mjs [notes] [slowdown] [--screens]
// With --screens it also times opening every screen (click to painted) and a search, in the same vault.
import { chromium } from '@playwright/test';

const N = Number(process.argv[2] ?? 2000);
const SLOW = Number(process.argv[3] ?? 4);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 412, height: 900 } })).newPage();
await page.goto('http://127.0.0.1:4173/');

await page.evaluate(async (n) => {
  const root = await navigator.storage.getDirectory();
  const vault = await root.getDirectoryHandle(`perf-${Date.now()}`, { create: true });
  const words = ['launch', 'pricing', 'design', 'budget', 'meeting', 'roadmap', 'client', 'review', 'draft', 'notes'];
  const folders = ['journal', 'projects/alpha', 'projects/beta', 'people', 'reference', 'inbox'];
  for (let i = 0; i < n; i++) {
    const folder = folders[i % folders.length];
    let dir = vault;
    for (const p of folder.split('/')) dir = await dir.getDirectoryHandle(p, { create: true });
    const links = [1, 2, 3].map((k) => `[[note-${(i * 7 + k * 13) % n}]]`).join(' and ');
    const broken = i % 25 === 0 ? ' See [[missing-note-' + i + ']].' : '';
    const text = `---\ntitle: Note ${i}\ntags: [${words[i % 10]}, ${words[(i + 3) % 10]}]\n${i % 40 === 0 ? 'type: project\nactive: true\nsortOrder: ' + i + '\n' : ''}---\n# Note ${i}\nSome ${words[i % 10]} text about ${words[(i * 3) % 10]}. ${links}.${broken}\n- [ ] Task ${i} due:2026-12-${String((i % 28) + 1).padStart(2, '0')} @p${i % 9} #${words[i % 10]}\n`;
    const w = await (await dir.getFileHandle(`note-${i}.md`, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
  window.__perfVault = vault;
}, N);

const t0 = Date.now();
await page.evaluate(() => window.__plainfile.openHandle(window.__perfVault, 'perf'));
console.log(`open + scan of ${N} notes: ${Date.now() - t0} ms (no throttle)`);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');

const t1 = Date.now();
await page.getByRole('button', { name: '+ New' }).click();
await page
  .locator('.modal')
  .getByRole('button', { name: /^Project/ })
  .click();
await page.locator('#tpl-title').fill('Perf test project');
const t2 = Date.now();
await page.getByRole('button', { name: 'Create file' }).click();
await page.locator('.cm-content').waitFor();
const t3 = Date.now();
const { profile } = await cdp.send('Profiler.stop');

console.log(`${SLOW}x slower CPU: open form ${t2 - t1} ms, click Create to editor visible ${t3 - t2} ms`);

const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
});
console.log('top self time (ms):');
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)}  ${k}`);

if (process.argv.includes('--screens')) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const painted = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const timed = async (label, act) => {
    const t = Date.now();
    await act();
    await painted();
    console.log(`  ${String(Date.now() - t).padStart(6)} ms  ${label}`);
  };
  console.log(`opening each screen, ${SLOW}x slower CPU, ${N} notes (click until painted):`);
  for (const id of ['home', 'tasks', 'projects', 'notes', 'calendar', 'search']) {
    await timed(id, () => page.evaluate((x) => document.querySelector(`.nav [data-nav="${x}"]`).click(), id));
  }
  for (const id of ['journal', 'people', 'insight', 'health']) {
    await page.evaluate(() => document.querySelector('.nav-more').click());
    await timed(id, () => page.evaluate((x) => document.querySelector(`.nav-menu [data-nav="${x}"]`).click(), id));
  }
  await page.evaluate(() => document.querySelector('.nav [data-nav="search"]').click());
  await painted();
  await timed('search "launch"', () => page.locator('#search-q').fill('launch'));
  await page.evaluate(() => document.querySelector('.nav [data-nav="tasks"]').click());
  await painted();
  await timed('tasks: type in the search box', () => page.locator('#hub-q, .hubwrap input[type="search"], .hubwrap input.inp').first().fill('Task 12'));
}
await browser.close();
