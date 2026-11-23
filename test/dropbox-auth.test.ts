import { describe, expect, it } from 'vitest';
import { authorizeUrl, challengeFor, exchangeCode, randomString, TokenSource } from '../src/dropbox-auth';

function tokenServer(replies: object[]): { f: typeof fetch; bodies: URLSearchParams[] } {
  const bodies: URLSearchParams[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    bodies.push(new URLSearchParams(String(init.body)));
    const r = replies.shift() as { status?: number } & object;
    return new Response(JSON.stringify(r), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, bodies };
}

describe('PKCE', () => {
  it('matches the RFC 7636 example', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('makes url-safe random strings that differ each time', () => {
    const a = randomString();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomString()).not.toBe(a);
  });
  it('builds the authorize url with offline access and the challenge', () => {
    const u = new URL(authorizeUrl({ appKey: 'KEY', redirectUri: 'https://x.test/app/', challenge: 'CH', state: 'ST' }));
    expect(u.origin + u.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: 'KEY',
      response_type: 'code',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      redirect_uri: 'https://x.test/app/',
      state: 'ST',
    });
  });
});

describe('tokens', () => {
  it('exchanges a code with the verifier and no secret', async () => {
    const { f, bodies } = tokenServer([{ access_token: 'A', refresh_token: 'R', expires_in: 100 }]);
    const t = await exchangeCode({ appKey: 'KEY', code: 'CODE', verifier: 'VER', redirectUri: 'https://x.test/' }, f, 1000);
    expect(t).toEqual({ access: 'A', refresh: 'R', expiresAt: 101_000 });
    expect(Object.fromEntries(bodies[0]!)).toEqual({
      grant_type: 'authorization_code',
      code: 'CODE',
      client_id: 'KEY',
      code_verifier: 'VER',
      redirect_uri: 'https://x.test/',
    });
  });
  it('explains a refused sign-in', async () => {
    const { f } = tokenServer([{ status: 400, error: 'invalid_grant', error_description: 'code has expired' }]);
    await expect(exchangeCode({ appKey: 'K', code: 'C', verifier: 'V', redirectUri: 'u' }, f)).rejects.toThrow('code has expired');
  });
  it('reuses a live token, refreshes an expired one once for many callers, and saves the new one', async () => {
    const { f, bodies } = tokenServer([{ access_token: 'A2', expires_in: 100 }]);
    let now = 0;
    const saved: string[] = [];
    const src = new TokenSource(
      'KEY',
      { access: 'A1', refresh: 'R', expiresAt: 500_000 },
      (t) => saved.push(t.access),
      f,
      () => now,
    );
    expect(await src.getToken()).toBe('A1');
    now = 480_000; // inside the one-minute margin
    const [a, b] = await Promise.all([src.getToken(), src.getToken()]);
    expect([a, b]).toEqual(['A2', 'A2']);
    expect(bodies).toHaveLength(1);
    expect(Object.fromEntries(bodies[0]!)).toEqual({ grant_type: 'refresh_token', refresh_token: 'R', client_id: 'KEY' });
    expect(saved).toEqual(['A2']);
  });
});
