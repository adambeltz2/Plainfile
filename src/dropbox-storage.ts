import { throwIfAborted } from './pool';
import { ConflictError, ExistsError, type FileEntry, type ListOptions, type VaultStorage } from './storage';

/**
 * A vault in a Dropbox folder, over the Dropbox HTTP API. Needs nothing but `fetch`, so it runs in the
 * browser with no server and is tested against a fake Dropbox.
 *
 * Guarded writes use Dropbox's own revision (`rev`): a write is only accepted if the file is still at the
 * revision just read, so another device's edit is never overwritten. `mtime` is the server's modified time
 * (whole seconds) plus a few milliseconds taken from the revision, so it also changes when two edits land
 * in the same second. It is only ever compared for equality, or shown as a date.
 */
export interface DropboxOptions {
  /** A current access token. Called again with `refresh: true` after a 401, so it can fetch a new one. */
  getToken: (refresh?: boolean) => Promise<string>;
  /** The folder to use as the vault, such as `/Notes`. Empty means the app folder or the whole Dropbox. */
  root?: string;
  fetch?: typeof fetch;
}

interface Meta {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower?: string;
  path_display?: string;
  server_modified?: string;
  rev?: string;
  size?: number;
}

export class DropboxError extends Error {
  constructor(
    message: string,
    public status: number,
    public summary = '',
  ) {
    super(message);
    this.name = 'DropboxError';
  }
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`${path} was not found in Dropbox`);
    this.name = 'NotFoundError';
  }
}

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
const HIDDEN = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

/** Dropbox wants the JSON in a header, and headers must be plain ASCII. */
function headerJson(v: unknown): string {
  return JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function mtimeOf(m: Meta): number {
  const t = Date.parse(m.server_modified ?? '') || 0;
  const tail = parseInt((m.rev ?? '0').replace(/[^0-9a-f]/gi, '').slice(-5) || '0', 16);
  return t + (tail % 1000);
}

export class DropboxStorage implements VaultStorage {
  private root: string;
  private f: typeof fetch;

  constructor(private opts: DropboxOptions) {
    const r = (opts.root ?? '').trim().replace(/^\/+|\/+$/g, '');
    this.root = r ? `/${r}` : '';
    this.f = opts.fetch ?? ((...a) => fetch(...a));
  }

  private full(path: string): string {
    return `${this.root}/${path}`.replace(/\/+$/, '') || '/';
  }

  private async send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.opts.getToken(refreshed);
      const res = await this.f(url, { ...init, signal, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      if (res.status === 429 && attempt < 4) {
        const wait = Number(res.headers.get('retry-after') ?? '1');
        await new Promise((r) => setTimeout(r, Math.min(30, Math.max(0, wait)) * 1000));
        throwIfAborted(signal);
        continue;
      }
      if (!res.ok) {
        let summary = '';
        try {
          summary = ((await res.json()) as { error_summary?: string }).error_summary ?? '';
        } catch {
          /* not JSON */
        }
        throw new DropboxError(`Dropbox said ${res.status}${summary ? `: ${summary}` : ''}`, res.status, summary);
      }
      return res;
    }
  }

  private async rpc<T>(endpoint: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.send(`${API}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, signal);
    return (await res.json()) as T;
  }

  private rel(m: Meta): string | undefined {
    const lower = m.path_lower ?? '';
    const base = this.root.toLowerCase();
    if (!lower.startsWith(`${base}/`)) return undefined;
    return (m.path_display ?? lower).slice(base.length + 1);
  }

  private entry(path: string, m: Meta): FileEntry {
    return { path, mtime: mtimeOf(m), size: m.size ?? 0 };
  }

  async list(opts: ListOptions = {}): Promise<FileEntry[]> {
    const { onProgress, signal, onHidden } = opts;
    let page = await this.rpc<{ entries: Meta[]; cursor: string; has_more: boolean }>('/files/list_folder', { path: this.root, recursive: true, include_deleted: false, limit: 2000 }, signal);
    const out: FileEntry[] = [];
    let hidden = 0;
    for (;;) {
      for (const m of page.entries) {
        if (m['.tag'] !== 'file') continue;
        const rel = this.rel(m);
        if (!rel) continue;
        if (rel.split('/').some(HIDDEN)) {
          hidden++;
          continue;
        }
        out.push(this.entry(rel, m));
      }
      onProgress?.({ found: out.length, checked: out.length });
      throwIfAborted(signal);
      if (!page.has_more) break;
      page = await this.rpc('/files/list_folder/continue', { cursor: page.cursor }, signal);
    }
    onHidden?.(hidden);
    return out;
  }

  async listDir(dir: string): Promise<FileEntry[]> {
    try {
      const out: FileEntry[] = [];
      let page = await this.rpc<{ entries: Meta[]; cursor: string; has_more: boolean }>('/files/list_folder', { path: this.full(dir), recursive: false, limit: 2000 });
      for (;;) {
        for (const m of page.entries) if (m['.tag'] === 'file') out.push(this.entry(dir ? `${dir}/${m.name}` : m.name, m));
        if (!page.has_more) return out;
        page = await this.rpc('/files/list_folder/continue', { cursor: page.cursor });
      }
    } catch (e) {
      if (e instanceof DropboxError && e.summary.startsWith('path/not_found')) return [];
      throw e;
    }
  }

  private async meta(path: string): Promise<Meta> {
    try {
      return await this.rpc<Meta>('/files/get_metadata', { path: this.full(path) });
    } catch (e) {
      if (e instanceof DropboxError && e.summary.startsWith('path/not_found')) throw new NotFoundError(path);
      throw e;
    }
  }

  async stat(path: string): Promise<FileEntry> {
    const m = await this.meta(path);
    if (m['.tag'] !== 'file') throw new NotFoundError(path);
    return this.entry(path, m);
  }

  async read(path: string): Promise<string> {
    try {
      const res = await this.send(`${CONTENT}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': headerJson({ path: this.full(path) }) } });
      return await res.text();
    } catch (e) {
      if (e instanceof DropboxError && e.summary.startsWith('path/not_found')) throw new NotFoundError(path);
      throw e;
    }
  }

  private async upload(path: string, content: string, mode: unknown): Promise<FileEntry> {
    const res = await this.send(`${CONTENT}/files/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJson({ path: this.full(path), mode, autorename: false, mute: true }) },
      body: content,
    });
    return this.entry(path, (await res.json()) as Meta);
  }

  async create(path: string, content: string): Promise<FileEntry> {
    try {
      return await this.upload(path, content, 'add');
    } catch (e) {
      if (e instanceof DropboxError && e.summary.startsWith('path/conflict')) throw new ExistsError(path);
      throw e;
    }
  }

  async write(path: string, content: string, expectedMtime: number): Promise<FileEntry> {
    const m = await this.meta(path);
    if (mtimeOf(m) !== expectedMtime) throw new ConflictError(path);
    try {
      return await this.upload(path, content, { '.tag': 'update', update: m.rev });
    } catch (e) {
      if (e instanceof DropboxError && e.summary.startsWith('path/conflict')) throw new ConflictError(path);
      throw e;
    }
  }

  async remove(path: string, expectedMtime: number): Promise<void> {
    const m = await this.meta(path);
    if (mtimeOf(m) !== expectedMtime) throw new ConflictError(path);
    try {
      await this.rpc('/files/delete_v2', { path: this.full(path), parent_rev: m.rev });
    } catch (e) {
      if (e instanceof DropboxError && (e.summary.includes('conflict') || e.summary.includes('rev'))) throw new ConflictError(path);
      throw e;
    }
  }
}
