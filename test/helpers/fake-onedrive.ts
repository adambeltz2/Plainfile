/**
 * An in-memory OneDrive for tests: just enough of the Microsoft Graph HTTP API for OneDriveStorage and the sign-in
 * flow. Folders are real items (as in OneDrive), eTags change on every write, `If-Match` is enforced on upload
 * sessions and deletes, upload fragments are checked for the Content-Range rules, the upload address must be called
 * without an Authorization header, and list pages are small so paging is exercised.
 */
interface Entry {
  id: string;
  /** Full path in the drive, original case. */
  path: string;
  folder: boolean;
  bytes: Uint8Array;
  etag: number;
  modified: number;
}

interface Session {
  path: string;
  id?: string;
  ifMatch?: string;
  behavior: string;
  chunks: Uint8Array[];
  received: number;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
const UPLOAD = 'https://upload.fake.test/session/';

export class FakeOneDrive {
  entries = new Map<string, Entry>(); // lower-case path -> entry
  calls: string[] = [];
  pageSize = 3;
  tokens = new Set<string>(['good']);
  /** Make the next request answer 429 once. */
  rateLimitOnce = false;
  /** Every Content-Range an upload sent, to check fragmenting. */
  ranges: string[] = [];
  /** Set when an upload-address request carried an Authorization header (it must not). */
  authOnUpload = false;
  private seq = 1;
  private clock = Date.UTC(2026, 10, 21, 4, 0, 0);
  private sessions = new Map<string, Session>();

  tick(s = 1): void {
    this.clock += s * 1000;
  }

  /** Put files in the drive directly, making their folders. */
  seed(files: Record<string, string>): void {
    for (const [p, t] of Object.entries(files)) this.putFile(p, new TextEncoder().encode(t));
  }

  text(path: string): string | undefined {
    const e = this.entries.get(path.toLowerCase());
    return e && !e.folder ? new TextDecoder().decode(e.bytes) : undefined;
  }

  private ensureFolders(path: string): void {
    const parts = path.split('/');
    parts.pop();
    let at = '';
    for (const part of parts) {
      at = at ? `${at}/${part}` : part;
      if (!this.entries.has(at.toLowerCase()))
        this.entries.set(at.toLowerCase(), { id: `id-${this.seq++}`, path: at, folder: true, bytes: new Uint8Array(), etag: this.seq++, modified: this.clock });
    }
  }

  private putFile(path: string, bytes: Uint8Array): Entry {
    this.ensureFolders(path);
    const old = this.entries.get(path.toLowerCase());
    const e: Entry = { id: old?.id ?? `id-${this.seq++}`, path, folder: false, bytes, etag: this.seq++, modified: this.clock };
    this.entries.set(path.toLowerCase(), e);
    return e;
  }

  private item(e: Entry): Record<string, unknown> {
    return {
      id: e.id,
      name: e.path.split('/').pop(),
      size: e.folder ? 0 : e.bytes.length,
      eTag: `"{${e.etag}},1"`,
      lastModifiedDateTime: new Date(e.modified).toISOString(),
      ...(e.folder ? { folder: { childCount: 0 } } : { file: { mimeType: 'text/plain' } }),
    };
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  private err(status: number, code: string): Response {
    return this.json({ error: { code, message: code } }, status);
  }

  private byId(id: string): Entry | undefined {
    return [...this.entries.values()].find((e) => e.id === id);
  }

  private children(path: string): Entry[] {
    const prefix = path ? `${path.toLowerCase()}/` : '';
    return [...this.entries.values()]
      .filter((e) => e.path.toLowerCase().startsWith(prefix) && !e.path.slice(prefix.length).includes('/'))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private remove(e: Entry): void {
    for (const k of [...this.entries.keys()]) if (k === e.path.toLowerCase() || k.startsWith(`${e.path.toLowerCase()}/`)) this.entries.delete(k);
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers as HeadersInit);
    this.calls.push(`${method} ${url.replace(GRAPH, '').replace(UPLOAD, 'upload/')}`);
    if (this.rateLimitOnce) {
      this.rateLimitOnce = false;
      return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
    }
    if (url.startsWith(UPLOAD)) return this.uploadFragment(url, method, headers, init.body as Uint8Array | undefined);
    const token = (headers.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!this.tokens.has(token)) return this.err(401, 'InvalidAuthenticationToken');
    if (!url.startsWith(GRAPH)) return this.err(404, 'itemNotFound');
    const u = new URL(url);
    const rest = decodeURIComponent(u.pathname.replace('/v1.0/me/drive', ''));

    // /items/{id}...
    const byId = /^\/items\/([^/]+)(\/.*)?$/.exec(rest);
    if (byId) {
      const e = this.byId(byId[1] as string);
      if (!e) return this.err(404, 'itemNotFound');
      const tail = byId[2] ?? '';
      const ifMatch = headers.get('if-match');
      if (method === 'DELETE') {
        if (ifMatch && ifMatch !== `"{${e.etag}},1"`) return this.err(412, 'resourceModified');
        this.remove(e);
        return new Response(null, { status: 204 });
      }
      if (method === 'POST' && tail === '/createUploadSession') {
        if (ifMatch && ifMatch !== `"{${e.etag}},1"`) return this.err(412, 'resourceModified');
        return this.openSession({ path: e.path, id: e.id, behavior: 'replace', chunks: [], received: 0 }, init.body as string);
      }
      if (method === 'PUT' && tail === '/content') {
        if (ifMatch && ifMatch !== `"{${e.etag}},1"`) return this.err(412, 'resourceModified');
        this.tick();
        return this.json(this.item(this.putFile(e.path, new Uint8Array((init.body as ArrayBuffer) ?? 0))));
      }
      return this.err(404, 'itemNotFound');
    }

    // root or root:/path:/tail
    const m = /^\/root(?::\/(.*?):)?(\/.*)?$/.exec(rest);
    if (!m) return this.err(404, 'itemNotFound');
    const path = m[1] ?? '';
    const tail = m[2] ?? '';
    const e = path ? this.entries.get(path.toLowerCase()) : undefined;

    if (method === 'GET' && tail === '') {
      if (!path) return this.json({ id: 'root', name: 'root', folder: {} });
      return e ? this.json(this.item(e)) : this.err(404, 'itemNotFound');
    }
    if (method === 'GET' && tail === '/children') {
      if (path && !e?.folder) return this.err(404, 'itemNotFound');
      const kids = this.children(path);
      const from = Number(u.searchParams.get('skip') ?? '0');
      const page = kids.slice(from, from + this.pageSize);
      const more = from + this.pageSize < kids.length;
      const next = new URL(url);
      next.searchParams.set('skip', String(from + this.pageSize));
      return this.json({ value: page.map((k) => this.item(k)), ...(more ? { '@odata.nextLink': next.toString() } : {}) });
    }
    if (method === 'GET' && tail === '/content') return e && !e.folder ? new Response(e.bytes.slice(), { status: 200 }) : this.err(404, 'itemNotFound');
    if (method === 'POST' && tail === '/children') {
      const body = JSON.parse(String(init.body)) as { name: string; '@microsoft.graph.conflictBehavior'?: string };
      const full = path ? `${path}/${body.name}` : body.name;
      if (this.entries.has(full.toLowerCase())) return this.err(409, 'nameAlreadyExists');
      this.ensureFolders(`${full}/x`);
      return this.json(this.item(this.entries.get(full.toLowerCase()) as Entry), 201);
    }
    if (method === 'POST' && tail === '/createUploadSession') {
      const ifMatch = headers.get('if-match') ?? undefined;
      const body = JSON.parse(String(init.body)) as { item?: Record<string, string> };
      const behavior = body.item?.['@microsoft.graph.conflictBehavior'] ?? 'fail';
      if (e && behavior === 'fail') return this.err(409, 'nameAlreadyExists');
      if (e && ifMatch && ifMatch !== `"{${e.etag}},1"`) return this.err(412, 'resourceModified');
      if (!e) {
        const parent = path.split('/').slice(0, -1).join('/');
        if (parent && !this.entries.get(parent.toLowerCase())?.folder) return this.err(404, 'itemNotFound'); // the folder must exist first
      }
      return this.openSession({ path, behavior, ifMatch, chunks: [], received: 0 }, String(init.body));
    }
    if (method === 'PUT' && tail === '/content') {
      const behavior = u.searchParams.get('@microsoft.graph.conflictBehavior') ?? 'replace';
      if (e && behavior === 'fail') return this.err(409, 'nameAlreadyExists');
      this.tick();
      return this.json(this.item(this.putFile(path, new Uint8Array(0))), 201);
    }
    return this.err(404, 'itemNotFound');
  };

  private openSession(s: Omit<Session, 'ifMatch'> & { ifMatch?: string }, _body: string): Response {
    const id = String(this.seq++);
    this.sessions.set(id, s);
    return this.json({ uploadUrl: `${UPLOAD}${id}`, expirationDateTime: '2099-01-01T00:00:00Z' });
  }

  private async uploadFragment(url: string, method: string, headers: Headers, body: Uint8Array | undefined): Promise<Response> {
    if (headers.has('authorization')) this.authOnUpload = true;
    const s = this.sessions.get(url.slice(UPLOAD.length));
    if (!s || method !== 'PUT') return this.err(404, 'itemNotFound');
    const range = headers.get('content-range') ?? '';
    this.ranges.push(range);
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    if (!m) return this.err(400, 'invalidRange');
    const [from, to, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const bytes = body ?? new Uint8Array(0);
    if (from !== s.received || to - from + 1 !== bytes.length) return this.err(416, 'invalidRange');
    const last = to + 1 === total;
    if (!last && bytes.length % (320 * 1024) !== 0) return this.err(400, 'invalidRange'); // Microsoft: fragments are multiples of 320 KiB
    s.chunks.push(bytes);
    s.received += bytes.length;
    if (!last) return this.json({ nextExpectedRanges: [`${s.received}-`] }, 202);
    const all = new Uint8Array(total);
    let at = 0;
    for (const c of s.chunks) {
      all.set(c, at);
      at += c.length;
    }
    const existing = this.entries.get(s.path.toLowerCase());
    if (s.behavior === 'fail' && existing) return this.err(409, 'nameAlreadyExists');
    if (existing && s.ifMatch && s.ifMatch !== `"{${existing.etag}},1"`) return this.err(412, 'resourceModified'); // changed during the upload
    this.tick();
    return this.json(this.item(this.putFile(s.path, all)), existing ? 200 : 201);
  }
}
