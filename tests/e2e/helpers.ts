import type { Page } from '@playwright/test';

export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Creates a vault in the browser's origin-private file system and opens it through the real FSA adapter. */
export async function openVault(page: Page, files: Record<string, string>): Promise<string> {
  const dir = `vault-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.evaluate(
    async ({ dir, files }) => {
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
      await window.__plainfile!.openHandle(vault, 'test-vault');
    },
    { dir, files },
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
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(dir);
      const w = await (await d.getFileHandle(path, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
    { dir, path, text },
  );
}
