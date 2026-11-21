/**
 * Signing in to Dropbox from a static page: OAuth 2 with PKCE, so no secret and no server are needed.
 * Only `fetch` and Web Crypto are used, so it can be tested with a fake.
 */
export interface Tokens {
  access: string;
  /** When the access token stops working, in ms since 1970. */
  expiresAt: number;
  /** Long-lived. Kept only in this browser. */
  refresh: string;
}

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomString(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function challengeFor(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export function authorizeUrl(p: { appKey: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.appKey,
    response_type: 'code',
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>, f: typeof fetch): Promise<TokenReply> {
  const res = await f('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenReply;
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? `Dropbox sign-in failed (${res.status})`);
  return json;
}

export async function exchangeCode(p: { appKey: string; code: string; verifier: string; redirectUri: string }, f: typeof fetch = (...a) => fetch(...a), now = Date.now()): Promise<Tokens> {
  const j = await tokenRequest({ grant_type: 'authorization_code', code: p.code, client_id: p.appKey, code_verifier: p.verifier, redirect_uri: p.redirectUri }, f);
  if (!j.refresh_token) throw new Error('Dropbox did not return a refresh token. Check the app was set up for offline access.');
  return { access: j.access_token as string, refresh: j.refresh_token, expiresAt: now + (j.expires_in ?? 14400) * 1000 };
}

/** Hands out a working access token, refreshing it when it has expired or when asked to. */
export class TokenSource {
  private pending: Promise<string> | undefined;

  constructor(
    private appKey: string,
    private tokens: Tokens,
    private onChange: (t: Tokens) => void = () => undefined,
    private f: typeof fetch = (...a) => fetch(...a),
    private clock: () => number = Date.now,
  ) {}

  getToken = (forceRefresh = false): Promise<string> => {
    if (!forceRefresh && this.tokens.expiresAt - 60_000 > this.clock()) return Promise.resolve(this.tokens.access);
    // Several requests at once share one refresh.
    this.pending ??= (async () => {
      try {
        const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh, client_id: this.appKey }, this.f);
        this.tokens = { access: j.access_token as string, refresh: j.refresh_token ?? this.tokens.refresh, expiresAt: this.clock() + (j.expires_in ?? 14400) * 1000 };
        this.onChange(this.tokens);
        return this.tokens.access;
      } finally {
        this.pending = undefined;
      }
    })();
    return this.pending;
  };
}
