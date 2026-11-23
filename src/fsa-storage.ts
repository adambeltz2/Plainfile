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

  /** Handles seen while listing. Some names (on Android, for example) are refused by getFileHandle but still open from the handle the listing gave us. */
  private seen = new Map<string, FileSystemFileHandle>();

  private seenDirs = new Map<string, FileSystemDirectoryHandle>();

  private refused = (e: unknown): boolean => e instanceof TypeError || (e instanceof DOMException && e.name === 'NotFoundError');

  /** The folder that holds `path`. Walks by name, and falls back to the handle the listing gave us when a name is refused. */
  private async parentDir(path: string): Promise<FileSystemDirectoryHandle> {
    const parts = path.split('/');
    parts.pop();
    try {
      let dir = this.root;
      for (const p of parts) dir = await dir.getDirectoryHandle(p);
      return dir;
    } catch (e) {
      const h = this.seenDirs.get(parts.join('/'));
      if (h && this.refused(e)) return h;
      throw e;
    }
  }

  private async fileHandle(path: string): Promise<FileSystemFileHandle> {
    const name = path.split('/').pop() as string;
    try {
      return await (await this.parentDir(path)).getFileHandle(name);
    } catch (e) {
      const h = this.seen.get(path);
      if (h && this.refused(e)) return h;
      throw e;
    }
  }

  /**
   * Each folder entry and each file's details is a round trip to the file system, which is slow on a
   * phone. So folders are walked several at a time, then file details are read several at a time,
   * with progress reported along the way.
   */
  async list(opts: ListOptions = {}): Promise<FileEntry[]> {
    const { onProgress, signal, onSkip, onHidden } = opts;
    let hidden = 0;
    const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
    this.seen.clear();
    this.seenDirs.clear();
    this.seenDirs.set('', this.root);
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
          try {
            for await (const [name, handle] of dir.entries()) {
              if (name.startsWith('.') || name === 'node_modules') {
                hidden++;
                continue;
              }
              const rel = prefix ? `${prefix}/${name}` : name;
              if (handle.kind === 'directory') {
                this.seenDirs.set(rel, handle as FileSystemDirectoryHandle);
                queue.push({ dir: handle as FileSystemDirectoryHandle, prefix: rel });
              } else {
                files.push({ rel, handle: handle as FileSystemFileHandle });
                this.seen.set(rel, handle as FileSystemFileHandle);
                found++;
              }
            }
          } catch (e) {
            // A folder we are not allowed to open is skipped, not fatal.
            onSkip?.(prefix || '(top folder)', why(e));
          }
          report();
        }),
      );
    }
    report(true);
    onHidden?.(hidden);

    const out: FileEntry[] = [];
    await mapPool(
      files,
      24,
      async ({ rel, handle }) => {
        try {
          const f = await handle.getFile();
          out.push({ path: rel, mtime: f.lastModified, size: f.size });
        } catch (e) {
          this.seen.delete(rel);
          onSkip?.(rel, why(e));
        }
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
    const handle = await this.fileHandle(path);
    const f = await handle.getFile();
    if (f.lastModified !== expectedMtime) throw new ConflictError(path);
    // Remove by the name the file system itself gave the file, which can differ from the typed path
    // (for example in how an accented letter is written).
    await (await this.parentDir(path)).removeEntry(handle.name);
    this.seen.delete(path);
  }

  async removeEmptyFolders(dir: string): Promise<void> {
    const parts = dir.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) return;
    let parent = this.root;
    try {
      for (const p of parts) parent = await parent.getDirectoryHandle(p);
      const top = await parent.getDirectoryHandle(name);
      const prune = async (d: FileSystemDirectoryHandle): Promise<boolean> => {
        let empty = true;
        for await (const [entryName, h] of d as unknown as AsyncIterable<[string, FileSystemHandle]>) {
          if (h.kind === 'directory' && (await prune(h as FileSystemDirectoryHandle))) {
            await d.removeEntry(entryName);
            continue;
          }
          empty = false;
        }
        return empty;
      };
      if (await prune(top)) await parent.removeEntry(name);
    } catch {
      /* a folder that cannot be tidied is only left behind, empty */
    }
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

  async createBinary(path: string, bytes: Uint8Array): Promise<FileEntry> {
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
    await w.write(bytes as unknown as BufferSource);
    await w.close();
    return this.stat(path);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.fileHandle(path)).getFile()).arrayBuffer());
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
