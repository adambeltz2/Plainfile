import type { Page } from '@playwright/test';

export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Creates a vault in the browser's origin-private file system and opens it through the real FSA adapter. */
export async function openVault(page: Page, files: Record<string, string>, open = true): Promise<string> {
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
