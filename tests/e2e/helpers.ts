import type { Page } from '@playwright/test';

export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Creates a vault in the browser's origin-private file system and opens it through the real FSA adapter. */
export async function openVault(page: Page, files: Record<string, string>, open = true, screen: 'today' | 'home' = 'today'): Promise<string> {
  const dir = `vault-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.evaluate(
    async ({ dir, files, open }) => {
      const root = await navigator.storage.getDirectory();
      const vault = await root.getDirectoryHandle(dir, { create: true });
      for (const [path, text] of Object.entries(files)) {
        const parts = path.split('/');
        const name = parts.pop() as string;
        let d = vault;
        for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
        const w = await (await d.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      }
      if (open) await window.__plainfile!.openHandle(vault, 'test-vault');
    },
    { dir, files, open },
  );
  // The app opens on Home. Most tests are about Today, so land there unless asked not to.
  if (open && screen === 'today') await goTo(page, 'Today');
  return dir;
}

export async function readFile(page: Page, dir: string, path: string): Promise<string> {
  return page.evaluate(
    async ({ dir, path }) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const p of parts) d = await d.getDirectoryHandle(p);
      return (await (await d.getFileHandle(name)).getFile()).text();
    },
    { dir, path },
  );
}

export async function writeFileExternally(page: Page, dir: string, path: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ dir, path, text }) => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const w = await (await d.getFileHandle(path)).createWritable();
      await w.write(text);
      await w.close();
    },
    { dir, path, text },
  );
}

export async function addFileExternally(page: Page, dir: string, path: string, text: string): Promise<void> {
  await page.evaluate(
    async ({ dir, path, text }) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const p of parts) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    { dir, path, text },
  );
}

export async function removeFileExternally(page: Page, dir: string, path: string): Promise<void> {
  await page.evaluate(
    async ({ dir, path }) => {
      let d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const parts = path.split('/');
      const name = parts.pop() as string;
      for (const p of parts) d = await d.getDirectoryHandle(p);
      await d.removeEntry(name);
    },
    { dir, path },
  );
}

export async function listFiles(page: Page, dir: string): Promise<string[]> {
  return page.evaluate(async (dir) => {
    const out: string[] = [];
    const walk = async (h: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, e] of h.entries()) {
        if (e.kind === 'directory') await walk(e as FileSystemDirectoryHandle, `${prefix}${name}/`);
        else out.push(`${prefix}${name}`);
      }
    };
    await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle(dir), '');
    return out.sort();
  }, dir);
}

/** Run an action from the note header's ⋯ More menu, for example 'Rename' or 'Delete…'. */
export async function noteMenu(page: Page, label: string | RegExp): Promise<void> {
  await page.locator('.ed-actions').getByRole('button', { name: /More/ }).click();
  await page.locator('.ctx').getByRole('menuitem', { name: label }).click();
}

/** Like readFile, but an empty string while the file does not exist yet, so a poll can wait for it. */
export async function readFileOrEmpty(page: Page, dir: string, path: string): Promise<string> {
  return readFile(page, dir, path).catch(() => '');
}

/** Go to a screen by name at any width: the header tabs on a wide screen, the bottom bar (or its More sheet) on a phone. */
export async function goTo(page: Page, name: RegExp | string): Promise<void> {
  const top = page.locator('.nav').getByRole('button', { name });
  if (await top.isVisible()) return top.click();
  if (!(await page.locator('.tabbar').count())) {
    // A note is open on a phone: the bar is out of the way, and All notes brings it back.
    const back = page.getByRole('button', { name: 'All notes' });
    if (await back.isVisible()) await back.click();
  }
  const tab = page.locator('.tabbar').getByRole('button', { name });
  if (await tab.count()) return tab.first().click();
  await page.locator('.tabbar').getByRole('button', { name: /^More/ }).click();
  await page.locator('.more-sheet').getByRole('button', { name }).click();
}

/** `nav(page, 'Notes').click()` for every spec: works on a wide screen and on a phone. */
export const nav = (page: Page, name: RegExp | string): { click: () => Promise<void> } => ({ click: () => goTo(page, name) });

/** A note in the Notes list. On a phone the list is folded under "All notes", so open it first. */
export async function noteItem(page: Page, hasText: string | RegExp): Promise<import('@playwright/test').Locator> {
  const t = page.locator('.side-toggle');
  if ((await t.isVisible()) && (await t.getAttribute('aria-expanded')) === 'false') await t.click();
  return page.locator('.note-item', { hasText });
}
