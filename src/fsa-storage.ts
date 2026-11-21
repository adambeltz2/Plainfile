import { ConflictError, type FileEntry, type VaultStorage } from './storage';

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

  async list(): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        const rel = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') {
          await walk(handle as FileSystemDirectoryHandle, rel);
        } else {
          const f = await (handle as FileSystemFileHandle).getFile();
          out.push({ path: rel, mtime: f.lastModified, size: f.size });
        }
      }
    };
    await walk(this.root, '');
    return out;
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
