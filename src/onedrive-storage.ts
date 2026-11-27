import { mapPool, throwIfAborted } from './pool';
import { ConflictError, ExistsError, type FileEntry, type ListOptions, type VaultStorage } from './storage';

/**
 * A vault in a OneDrive folder, over the Microsoft Graph HTTP API. Needs nothing but `fetch`, so it runs in the
 * browser with no server and is tested against a fake OneDrive. Personal and work or school OneDrive both work.
 *
 * Guarded writes use OneDrive's own revision (`eTag`): a replace or a delete is sent with `If-Match: <eTag>` and
 * OneDrive answers 412 when the file has changed since it was read, so another device's edit is never overwritten.
 * Writes go through an upload session, because that is where Microsoft documents `If-Match` and the choice of
 * "fail if it exists" for a new file. `mtime` is the server's modified time plus a few milliseconds taken from the
 * eTag, so it also changes when two edits land in the same instant. It is only ever compared for equality, or shown.
 */
export interface OneDriveOptions {
  /** A current access token. Called again with `refresh: true` after a 401, so it can fetch a new one. */
  getToken: (refresh?: boolean) => Promise<string>;
  /** The folder to use as the vault, such as `Notes` or `Documents/Notes`. Empty means the whole OneDrive. */
  root?: string;
  fetch?: typeof fetch;
  /** Bytes sent per request of an upload. Must be a multiple of 320 KiB (Microsoft's rule). */
  chunkBytes?: number;
}

interface Item {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  file?: unknown;
  folder?: unknown;
}

interface Page {
  value: Item[];
  '@odata.nextLink'?: string;
}

export class OneDriveError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = '',
  ) {
    super(message);
    this.name = 'OneDriveError';
  }
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`${path} was not found in OneDrive`);
    this.name = 'NotFoundError';
  }
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SELECT = '$select=id,name,size,eTag,lastModifiedDateTime,file,folder';
const HIDDEN = (name: string): boolean => name.startsWith('.') || name === 'node_modules';
const FRAGMENT = 320 * 1024;

/** A path as Graph wants it in an address: each name encoded, the slashes kept. */
const enc = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

export function mtimeOf(m: Item): number {
  const t = Date.parse(m.lastModifiedDateTime ?? '') || 0;
  let h = 0;
  for (const c of m.eTag ?? '') h = (h * 31 + c.charCodeAt(0)) % 1000;
  return t + h;
}

export class OneDriveStorage implements VaultStorage {
  private root: string;
  private f: typeof fetch;
  private chunk: number;
  /** Folders known to exist, so a create does not ask again. */
  private folders = new Set<string>(['']);

  constructor(private opts: OneDriveOptions) {
    this.root = (opts.root ?? '').trim().replace(/^\/+|\/+$/g, '');
    this.f = opts.fetch ?? ((...a) => fetch(...a));
    this.chunk = Math.max(FRAGMENT, Math.floor((opts.chunkBytes ?? 32 * FRAGMENT) / FRAGMENT) * FRAGMENT);
  }

  private full(path: string): string {
    return [this.root, path].filter(Boolean).join('/');
  }

  /** The address of a file or folder by its path, with `suffix` after it (such as `/children`). */
  private at(path: string, suffix = ''): string {
    return this.atDrive(this.full(path), suffix);
  }

  /** The same, for a path counted from the top of the whole drive (not from the vault folder). */
  private atDrive(path: string, suffix = ''): string {
    return path ? `${GRAPH}/me/drive/root:/${enc(path)}:${suffix}` : `${GRAPH}/me/drive/root${suffix}`;
  }

  private async send(url: string, init: RequestInit = {}, opts: { signal?: AbortSignal; auth?: boolean } = {}): Promise<Response> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
      if (opts.auth !== false) headers.Authorization = `Bearer ${await this.opts.getToken(refreshed)}`;
      const res = await this.f(url, { ...init, signal: opts.signal, headers });
      if (res.status === 401 && opts.auth !== false && !refreshed) {
        refreshed = true;
        continue;
      }
      if ((res.status === 429 || res.status === 503) && attempt < 4) {
        const wait = Number(res.headers.get('retry-after') ?? '1');
        await new Promise((r) => setTimeout(r, Math.min(30, Math.max(0, wait)) * 1000));
        throwIfAborted(opts.signal);
        continue;
      }
      if (!res.ok) {
        let code = '';
        let message = '';
        try {
          const e = ((await res.json()) as { error?: { code?: string; message?: string } }).error;
          code = e?.code ?? '';
          message = e?.message ?? '';
        } catch {
          /* not JSON */
        }
        throw new OneDriveError(`OneDrive said ${res.status}${code ? `: ${code}` : ''}${message ? ` (${message})` : ''}`, res.status, code);
      }
      return res;
    }
  }

  private async json<T>(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    return (await (await this.send(url, init, { signal })).json()) as T;
  }

  private entry(path: string, m: Item): FileEntry {
    return { path, mtime: mtimeOf(m), size: m.size ?? 0 };
  }

  private async meta(path: string): Promise<Item> {
    try {
      return await this.json<Item>(`${this.at(path)}?${SELECT}`);
    } catch (e) {
      if (e instanceof OneDriveError && e.status === 404) throw new NotFoundError(path);
      throw e;
    }
  }

  /** Every item directly inside a folder (all pages). A folder that does not exist has none. */
  private async children(dir: string, signal?: AbortSignal): Promise<Item[]> {
    const out: Item[] = [];
    let url: string | undefined = `${this.at(dir, '/children')}${this.at(dir, '/children').includes('?') ? '&' : '?'}$top=999&${SELECT}`;
    try {
      while (url) {
        const page: Page = await this.json<Page>(url, {}, signal);
        out.push(...page.value);
        url = page['@odata.nextLink'];
        throwIfAborted(signal);
      }
    } catch (e) {
      if (e instanceof OneDriveError && e.status === 404) return [];
      throw e;
    }
    return out;
  }

  /** Every visible file, found by walking the folders (a few at a time). */
  async list(opts: ListOptions = {}): Promise<FileEntry[]> {
    const { onProgress, signal, onHidden, onSkip } = opts;
    const out: FileEntry[] = [];
    let hidden = 0;
    let pending = [''];
    while (pending.length) {
      const next: string[] = [];
      await mapPool(
        pending,
        4,
        async (dir) => {
          let items: Item[];
          try {
            items = await this.children(dir, signal);
          } catch (e) {
            if (e instanceof OneDriveError && dir) {
              onSkip?.(dir, e.message);
              return;
            }
            throw e;
          }
          for (const m of items) {
            const rel = dir ? `${dir}/${m.name}` : m.name;
            if (HIDDEN(m.name)) {
              hidden++;
              continue;
            }
            if (m.folder) next.push(rel);
            else if (m.file) out.push(this.entry(rel, m));
          }
          onProgress?.({ found: out.length, checked: out.length });
        },
        signal,
      );
      pending = next;
    }
    onHidden?.(hidden);
    return out;
  }

  async listDir(dir: string): Promise<FileEntry[]> {
    const items = await this.children(dir);
    return items.filter((m) => m.file).map((m) => this.entry(dir ? `${dir}/${m.name}` : m.name, m));
  }

  async stat(path: string): Promise<FileEntry> {
    const m = await this.meta(path);
    if (!m.file) throw new NotFoundError(path);
    return this.entry(path, m);
  }

  private async download(path: string): Promise<Response> {
    try {
      return await this.send(this.at(path, '/content'));
    } catch (e) {
      if (e instanceof OneDriveError && e.status === 404) throw new NotFoundError(path);
      throw e;
    }
  }

  async read(path: string): Promise<string> {
    return (await this.download(path)).text();
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.download(path)).arrayBuffer());
  }

  /** Makes every folder on the way to `dir` that is not there yet. */
  private async ensureFolders(dir: string): Promise<void> {
    const parts = dir.split('/').filter(Boolean);
    let at = '';
    for (const part of parts) {
      const parent = at;
      at = at ? `${at}/${part}` : part;
      if (this.folders.has(at)) continue;
      try {
        await this.send(this.atDrive(parent, '/children'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        });
      } catch (e) {
        if (!(e instanceof OneDriveError && e.status === 409)) throw e; // already there is fine
      }
      this.folders.add(at);
    }
  }

  /**
   * Sends the bytes through an upload session. `createUrl` says what to make or replace; `ifMatch` is the eTag a
   * replace must still match; `behavior` is `fail` for a new file and `replace` for an existing one.
   */
  private async upload(createUrl: string, bytes: Uint8Array, behavior: 'fail' | 'replace', ifMatch?: string): Promise<Item> {
    const session = await this.json<{ uploadUrl: string }>(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': behavior } }),
    });
    const total = bytes.length;
    for (let from = 0; ; from += this.chunk) {
      const to = Math.min(from + this.chunk, total);
      // The upload address is already signed, so no Authorization header goes with it.
      const res = await this.send(
        session.uploadUrl,
        { method: 'PUT', headers: { 'Content-Range': `bytes ${from}-${to - 1}/${total}` }, body: bytes.slice(from, to) as BodyInit },
        { auth: false },
      );
      if (to >= total) return (await res.json()) as Item;
    }
  }

  /** An empty file cannot be sent through an upload session (a range needs at least one byte), so it goes in one request. */
  private async putEmpty(url: string, ifMatch?: string): Promise<Item> {
    return this.json<Item>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
      body: new Uint8Array(0),
    });
  }

  private async make(path: string, bytes: Uint8Array): Promise<FileEntry> {
    const slash = path.lastIndexOf('/');
    await this.ensureFolders(this.full(slash < 0 ? '' : path.slice(0, slash)));
    try {
      const item = bytes.length
        ? await this.upload(this.at(path, '/createUploadSession'), bytes, 'fail')
        : await this.putEmpty(`${this.at(path, '/content')}?@microsoft.graph.conflictBehavior=fail`);
      return this.entry(path, item);
    } catch (e) {
      if (e instanceof OneDriveError && (e.status === 409 || e.code === 'nameAlreadyExists')) throw new ExistsError(path);
      throw e;
    }
  }

  async create(path: string, content: string): Promise<FileEntry> {
    return this.make(path, new TextEncoder().encode(content));
  }

  async createBinary(path: string, bytes: Uint8Array): Promise<FileEntry> {
    return this.make(path, bytes);
  }

  async write(path: string, content: string, expectedMtime: number): Promise<FileEntry> {
    const m = await this.meta(path);
    if (mtimeOf(m) !== expectedMtime) throw new ConflictError(path);
    const bytes = new TextEncoder().encode(content);
    try {
      const item = bytes.length
        ? await this.upload(`${GRAPH}/me/drive/items/${encodeURIComponent(m.id)}/createUploadSession`, bytes, 'replace', m.eTag)
        : await this.putEmpty(`${GRAPH}/me/drive/items/${encodeURIComponent(m.id)}/content`, m.eTag);
      return this.entry(path, item);
    } catch (e) {
      if (e instanceof OneDriveError && (e.status === 412 || e.code === 'resourceModified')) throw new ConflictError(path);
      throw e;
    }
  }

  async remove(path: string, expectedMtime: number): Promise<void> {
    const m = await this.meta(path);
    if (mtimeOf(m) !== expectedMtime) throw new ConflictError(path);
    try {
      await this.send(`${GRAPH}/me/drive/items/${encodeURIComponent(m.id)}`, { method: 'DELETE', headers: m.eTag ? { 'If-Match': m.eTag } : {} });
    } catch (e) {
      if (e instanceof OneDriveError && (e.status === 412 || e.code === 'resourceModified')) throw new ConflictError(path);
      throw e;
    }
  }

  /** Removes `dir` and the folders under it, but only the ones that are completely empty, so nothing is ever deleted. */
  async removeEmptyFolders(dir: string): Promise<void> {
    if (!dir) return;
    // Empties out (removes) a folder when nothing but empty folders is inside it; says whether it did.
    const prune = async (d: string, id: string): Promise<boolean> => {
      let left = 0;
      for (const m of await this.children(d)) {
        if (!m.folder || !(await prune(d ? `${d}/${m.name}` : m.name, m.id))) left++;
      }
      if (left) return false;
      await this.send(`${GRAPH}/me/drive/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      this.folders.delete(d);
      return true;
    };
    const here = await this.meta(dir).catch(() => undefined);
    if (here?.folder) await prune(dir, here.id);
  }
}
