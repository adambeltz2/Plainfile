import { ConflictError, type FileEntry, type VaultStorage } from './storage';

/** In-memory vault for tests and demos. */
export class MemoryStorage implements VaultStorage {
  private files = new Map<string, { text: string; mtime: number }>();
  private clock = 1000;

  constructor(initial: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(initial)) this.put(p, t);
  }

  private put(path: string, text: string): FileEntry {
    const mtime = ++this.clock;
    this.files.set(path, { text, mtime });
    return { path, mtime, size: text.length };
  }

  /** Simulates an edit made outside the app (another editor, a sync tool). */
  external(path: string, text: string): void {
    this.put(path, text);
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  async list(): Promise<FileEntry[]> {
    return [...this.files].map(([path, f]) => ({ path, mtime: f.mtime, size: f.text.length }));
  }

  async stat(path: string): Promise<FileEntry> {
    const f = this.files.get(path);
    if (!f) throw new Error(`not found: ${path}`);
    return { path, mtime: f.mtime, size: f.text.length };
  }

  async read(path: string): Promise<string> {
    const f = this.files.get(path);
    if (!f) throw new Error(`not found: ${path}`);
    return f.text;
  }

  async write(path: string, content: string, expectedMtime: number): Promise<FileEntry> {
    const f = this.files.get(path);
    if (!f || f.mtime !== expectedMtime) throw new ConflictError(path);
    return this.put(path, content);
  }
}
