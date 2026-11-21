/**
 * The only way the core touches files. Browser mode (File System Access API),
 * server mode and the in-memory test store all implement this interface, so the
 * parser, index and write-back code never know which one they are running on.
 *
 * Paths are always vault-relative with forward slashes, e.g. "projects/a/b.md".
 */
export interface FileEntry {
  path: string;
  /** Last-modified time in ms. Compared for equality, never interpreted. */
  mtime: number;
  size: number;
}

export interface VaultStorage {
  /** Every visible file in the vault (not just markdown). Hidden folders are skipped. */
  list(): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry>;
  read(path: string): Promise<string>;
  /** Direct child files of a folder, including hidden ones. Empty if the folder does not exist. */
  listDir(dir: string): Promise<FileEntry[]>;
  /** Delete a file. Throws ConflictError if it changed since `expectedMtime`. */
  remove(path: string, expectedMtime: number): Promise<void>;
  /** Create a new file and any missing folders. Throws ExistsError if the file is already there. */
  create(path: string, content: string): Promise<FileEntry>;
  /**
   * Replace a file's content. Must throw ConflictError if the file's current
   * mtime differs from `expectedMtime`, so an edit made elsewhere is never overwritten.
   */
  write(path: string, content: string, expectedMtime: number): Promise<FileEntry>;
}

export class ConflictError extends Error {
  constructor(public path: string) {
    super(`${path} changed on disk since it was read`);
    this.name = 'ConflictError';
  }
}

export class ExistsError extends Error {
  constructor(public path: string) {
    super(`${path} already exists`);
    this.name = 'ExistsError';
  }
}

export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}
