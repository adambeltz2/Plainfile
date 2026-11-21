import { promises as fs } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { ConflictError, ExistsError, type FileEntry, type ListOptions, type VaultStorage } from './storage';

const SKIP_DIRS = new Set(['node_modules']);

/** A vault on a real folder. Used by the CLI and the future local-server mode. */
export class NodeStorage implements VaultStorage {
  constructor(private root: string) {}

  private abs(path: string): string {
    return join(this.root, ...path.split('/'));
  }

  async list(_opts?: ListOptions): Promise<FileEntry[]> {
    const out: FileEntry[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(join(dir, e.name), rel);
        else if (e.isFile()) {
          const s = await fs.stat(join(dir, e.name));
          out.push({ path: rel, mtime: s.mtimeMs, size: s.size });
        }
      }
    };
    await walk(this.root, '');
    return out.map((f) => ({ ...f, path: f.path.split(sep).join('/') }));
  }

  async listDir(dir: string): Promise<FileEntry[]> {
    try {
      const out: FileEntry[] = [];
      for (const e of await fs.readdir(this.abs(dir), { withFileTypes: true })) {
        if (!e.isFile()) continue;
        const s = await fs.stat(join(this.abs(dir), e.name));
        out.push({ path: dir ? `${dir}/${e.name}` : e.name, mtime: s.mtimeMs, size: s.size });
      }
      return out;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async remove(path: string, expectedMtime: number): Promise<void> {
    const current = await fs.stat(this.abs(path));
    if (current.mtimeMs !== expectedMtime) throw new ConflictError(path);
    await fs.unlink(this.abs(path));
  }

  async create(path: string, content: string): Promise<FileEntry> {
    const target = this.abs(path);
    await fs.mkdir(dirname(target), { recursive: true });
    try {
      await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ExistsError(path);
      throw e;
    }
    return this.stat(path);
  }

  async createBinary(path: string, bytes: Uint8Array): Promise<FileEntry> {
    const target = this.abs(path);
    await fs.mkdir(dirname(target), { recursive: true });
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new ExistsError(path);
      throw e;
    }
    return this.stat(path);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.abs(path)));
  }

  async stat(path: string): Promise<FileEntry> {
    const s = await fs.stat(this.abs(path));
    return { path, mtime: s.mtimeMs, size: s.size };
  }

  async read(path: string): Promise<string> {
    return fs.readFile(this.abs(path), 'utf8');
  }

  async write(path: string, content: string, expectedMtime: number): Promise<FileEntry> {
    const target = this.abs(path);
    const current = await fs.stat(target);
    if (current.mtimeMs !== expectedMtime) throw new ConflictError(path);
    // Write beside the file, then rename over it, so a sync tool never sees a half-written file.
    const tmp = `${target}.plainfile-tmp`;
    await fs.writeFile(tmp, content, { encoding: 'utf8', mode: current.mode });
    await fs.rename(tmp, target);
    return this.stat(path);
  }
}
