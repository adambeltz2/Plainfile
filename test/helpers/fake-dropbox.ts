/**
 * An in-memory Dropbox for tests: just enough of the HTTP API for DropboxStorage and the sign-in flow.
 * Times are whole seconds and revisions are hex, as in the real service, and list pages are small so
 * the cursor path is exercised.
 */
interface F {
  display: string;
  content: string;
  bytes?: Uint8Array;
  rev: number;
  modified: number;
}

export class FakeDropbox {
  files = new Map<string, F>(); // lower-case path -> file
  calls: string[] = [];
  pageSize = 3;
  tokens = new Set<string>(['good']);
  private seq = 1;
  private cursors = new Map<string, { rest: Meta[]; snap: number }>();
  /** Every change in order, so a saved cursor can ask for just what happened since. */
  private log: { seq: number; lower: string; display: string; meta?: Meta }[] = [];
  /** Make the next continue say the cursor is no longer valid, as Dropbox does after a long time. */
  resetNext = false;
  private clock = Date.UTC(2026, 10, 21, 4, 0, 0);
  /** Set to make the next request answer 429 once. */
  rateLimitOnce = false;

  /** Advance the fake clock, in seconds. */
  tick(s = 1): void {
    this.clock += s * 1000;
  }

  private meta(f: F): Meta {
    return { '.tag': 'file', name: f.display.split('/').pop() as string, path_lower: f.display.toLowerCase(), path_display: f.display, server_modified: new Date(f.modified).toISOString().replace('.000Z', 'Z'), rev: f.rev.toString(16).padStart(9, '0') + 'abc', size: f.bytes ? f.bytes.length : new TextEncoder().encode(f.content).length };
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  private err(summary: string, status = 409): Response {
    return this.json({ error_summary: summary, error: {} }, status);
  }

  private put(path: string, content: string, bytes?: Uint8Array): F {
    const f: F = { display: path.replace(/^\//, ''), content, bytes, rev: this.seq++, modified: this.clock };
    f.display = '/' + f.display;
    this.files.set(path.toLowerCase(), f);
    this.log.push({ seq: this.seq++, lower: path.toLowerCase(), display: f.display, meta: this.meta(f) });
    return f;
  }

  seed(files: Record<string, string>): void {
    for (const [p, t] of Object.entries(files)) this.put('/' + p, t);
  }

  fetch = async (url: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const u = String(url);
    const headers = new Headers(init.headers as HeadersInit);
    const path = u.replace(/^https:\/\/[^/]+\/2/, '');
    this.calls.push(path);
    if (this.rateLimitOnce) {
      this.rateLimitOnce = false;
      return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
    }
    const token = (headers.get('authorization') ?? '').replace('Bearer ', '');
    if (!this.tokens.has(token)) return this.json({ error_summary: 'expired_access_token/', error: {} }, 401);
    const body = typeof init.body === 'string' && headers.get('content-type') === 'application/json' ? JSON.parse(init.body) : undefined;
    const arg = headers.get('dropbox-api-arg') ? JSON.parse(headers.get('dropbox-api-arg') as string) : undefined;

    if (path === '/files/list_folder') {
      const root = (body.path as string).toLowerCase();
      const base = root === '' ? '/' : root + '/';
      const all = [...this.files.values()]
        .filter((f) => f.display.toLowerCase().startsWith(base))
        .filter((f) => body.recursive || !f.display.slice(base.length).includes('/'))
        .map((f) => this.meta(f));
      if (!all.length && !body.recursive && ![...this.files.keys()].some((k) => k.startsWith(base))) return this.err('path/not_found/');
      return this.page(all, this.seq);
    }
    if (path === '/files/list_folder/continue') {
      if (this.resetNext) {
        this.resetNext = false;
        return this.err('reset/');
      }
      const c = String(body.cursor);
      if (c.startsWith('L:')) {
        const since = Number(c.slice(2));
        const latest = new Map<string, (typeof this.log)[number]>();
        for (const e of this.log) if (e.seq >= since) latest.set(e.lower, e);
        const entries = [...latest.values()].map((e) => (e.meta ? e.meta : { '.tag': 'deleted' as const, name: e.display.split('/').pop() as string, path_lower: e.lower, path_display: e.display }));
        return this.json({ entries, cursor: `L:${this.seq}`, has_more: false });
      }
      const p = this.cursors.get(c) ?? { rest: [], snap: this.seq };
      return this.page(p.rest, p.snap);
    }
    if (path === '/files/get_metadata') {
      const f = this.files.get((body.path as string).toLowerCase());
      return f ? this.json(this.meta(f)) : this.err('path/not_found/..');
    }
    if (path === '/files/download') {
      const f = this.files.get((arg.path as string).toLowerCase());
      return f ? new Response((f.bytes ?? f.content) as BodyInit, { status: 200 }) : this.err('path/not_found/..');
    }
    if (path === '/files/upload') {
      const key = (arg.path as string).toLowerCase();
      const cur = this.files.get(key);
      const isBytes = init.body instanceof Uint8Array;
      const content = isBytes ? '' : String(init.body ?? '');
      if (arg.mode === 'add') {
        if (cur) return this.err('path/conflict/file/..');
      } else if (!cur || this.meta(cur).rev !== arg.mode.update) return this.err('path/conflict/file/..');
      return this.json(this.meta(this.put(arg.path, content, isBytes ? new Uint8Array(init.body as Uint8Array) : undefined)));
    }
    if (path === '/files/delete_v2') {
      const key = (body.path as string).toLowerCase();
      const cur = this.files.get(key);
      if (!cur) return this.err('path_lookup/not_found/..');
      if (body.parent_rev && this.meta(cur).rev !== body.parent_rev) return this.err('path_write/conflict/rev');
      this.files.delete(key);
      this.log.push({ seq: this.seq++, lower: key, display: cur.display });
      return this.json({ metadata: this.meta(cur) });
    }
    return this.err(`unknown/${path}`, 400);
  };

  private page(all: Meta[], snap: number): Response {
    const first = all.slice(0, this.pageSize);
    const rest = all.slice(this.pageSize);
    const last = rest.length === 0;
    const cursor = last ? `L:${snap}` : `c${this.seq++}`;
    if (!last) this.cursors.set(cursor, { rest, snap });
    // Folders are listed too, as the real service does.
    return this.json({ entries: [...first, { '.tag': 'folder', name: 'x', path_lower: '/x', path_display: '/x' }], cursor, has_more: !last });
  }
}

interface Meta {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower: string;
  path_display: string;
  server_modified?: string;
  rev?: string;
  size?: number;
}
