import { mapPool, throwIfAborted } from './pool';
import { ConflictError, ExistsError, type FileEntry, type ListOptions, type VaultStorage } from './storage';

/**
 * A vault on a real folder the user picked in the browser, using the File System
 * Access API. Works with any FileSystemDirectoryHandle, including the one from
 * showDirectoryPicker() and the origin-private one from navigator.storage.getDirectory().
 *
 * The API has no compare-and-swap, so a write checks the file's last-modified time
 * immediately before writing. A very small window remains between that check and the
 * writable stream closing; the browser writes to a swap file and replaces the original
 * only on close, so a failure never leaves a half-written note.
 */
export class FsaStorage implements VaultStorage {
  constructor(public readonly root: FileSystemDirectoryHandle) {}

  private async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const parts = path.split('/');
    const name = parts.pop() as string;
    let dir = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    return dir.getFileHandle(name);
  }

  /**
   * Each folder entry and each file's details is a round trip to the file system, which is slow on a
   * phone. So folders are walked several at a time, then file details are read several at a time,
   * with progress reported along the way.
   */
  async list(opts: ListOptions = {}): Promise<FileEntry[]> {
    const { onProgress, signal } = opts;
    let found = 0;
    let checked = 0;
    let last = 0;
    const report = (force = false): void => {
      const now = Date.now();
      if (force || now - last > 80) {
        last = now;
        onProgress?.({ found, checked });
      }
    };

    const files: { rel: string; handle: FileSystemFileHandle }[] = [];
    const queue: { dir: FileSystemDirectoryHandle; prefix: string }[] = [{ dir: this.root, prefix: '' }];
    while (queue.length) {
      throwIfAborted(signal);
      const batch = queue.splice(0, 8);
      await Promise.all(
        batch.map(async ({ dir, prefix }) => {
          for await (const [name, handle] of dir.entries()) {
            if (name.startsWith('.') || name === 'node_modules') continue;
            const rel = prefix ? `${prefix}/${name}` : name;
            if (handle.kind === 'directory') queue.push({ dir: handle as FileSystemDirectoryHandle, prefix: rel });
            else {
              files.push({ rel, handle: handle as FileSystemFileHandle });
              found++;
            }
          }
          report();
        }),
      );
    }
    report(true);

    const out: FileEntry[] = [];
    await mapPool(
      files,
      24,
      async ({ rel, handle }) => {
        const f = await handle.getFile();
        out.push({ path: rel, mtime: f.lastModified, size: f.size });
        checked++;
        report();
      },
      signal,
    );
    report(true);
    return out;
  }

  async listDir(dir: string): Promise<FileEntry[]> {
    try {
      let d = this.root;
      for (const p of dir.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p);
      const out: FileEntry[] = [];
      for await (const [name, handle] of d.entries()) {
        if (handle.kind !== 'file') continue;
        const f = await (handle as FileSystemFileHandle).getFile();
        out.push({ path: dir ? `${dir}/${name}` : name, mtime: f.lastModified, size: f.size });
      }
      return out;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return [];
      throw e;
    }
  }

  async remove(path: string, expectedMtime: number): Promise<void> {
    const parts = path.split('/');
    const name = parts.pop() as string;
    let dir = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    const f = await (await dir.getFileHandle(name)).getFile();
    if (f.lastModified !== expectedMtime) throw new ConflictError(path);
    await dir.removeEntry(name);
  }

  async create(path: string, content: string): Promise<FileEntry> {
    const parts = path.split('/');
    const name = parts.pop() as string;
    let dir = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    try {
      await dir.getFileHandle(name);
      throw new ExistsError(path);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
    }
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(content);
    await w.close();
    return this.stat(path);
  }

  async stat(path: string): Promise<FileEntry> {
    const f = await (await this.fileHandle(path)).getFile();
    return { path, mtime: f.lastModified, size: f.size };
  }

  async read(path: string): Promise<string> {
    return (await (await this.fileHandle(path)).getFile()).text();
  }

  async write(path: string, content: string, expectedMtime: number): Promise<FileEntry> {
    const handle = await this.fileHandle(path);
    const current = await handle.getFile();
    if (current.lastModified !== expectedMtime) throw new ConflictError(path);
    const w = await handle.createWritable();
    await w.write(content);
    await w.close();
    return this.stat(path);
  }
}

export function fsaSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
