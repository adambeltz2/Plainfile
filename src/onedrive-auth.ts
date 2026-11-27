import { tokenRequest, type TokenEndpoint, type Tokens } from './dropbox-auth';

/**
 * Signing in to OneDrive (Microsoft Graph) from a static page: OAuth 2 authorization code with PKCE, so no
 * secret and no server are needed. The app is registered as a "Single-page application", which is what lets the
 * browser call the token address. Personal Microsoft accounts and work or school accounts both sign in
 * (the `common` address). Only `fetch` and Web Crypto are used, so it can be tested with a fake.
 *
 * Microsoft ends the sign-in of a browser app after 24 hours: the refresh token stops working and the person
 * signs in again (usually with one click, without typing a password).
 */
export { challengeFor, randomString, TokenSource, type Tokens } from './dropbox-auth';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
/** `offline_access` is what returns a refresh token. Files.ReadWrite is the person's own OneDrive, not other people's. */
export const SCOPE = 'Files.ReadWrite offline_access';

export const ONEDRIVE_TOKENS: TokenEndpoint = { url: `${AUTHORITY}/token`, extra: { scope: SCOPE }, label: 'OneDrive', ttl: 3600 };

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    response_mode: 'query',
    scope: SCOPE,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
  });
  return `${AUTHORITY}/authorize?${q}`;
}

export async function exchangeCode(
  p: { clientId: string; code: string; verifier: string; redirectUri: string },
  f: typeof fetch = (...a) => fetch(...a),
  now = Date.now(),
): Promise<Tokens> {
  const j = await tokenRequest(
    { grant_type: 'authorization_code', code: p.code, client_id: p.clientId, code_verifier: p.verifier, redirect_uri: p.redirectUri },
    f,
    ONEDRIVE_TOKENS,
  );
  if (!j.refresh_token) throw new Error('OneDrive did not return a refresh token. Check that the app has the offline_access permission.');
  return { access: j.access_token as string, refresh: j.refresh_token, expiresAt: now + (j.expires_in ?? 3600) * 1000 };
}

/** True when Microsoft says the saved sign-in can no longer be used (a browser app's lasts a day), so the person must sign in again. */
export const signInExpired = (e: unknown): boolean =>
  /invalid_grant|AADSTS70008|AADSTS700084|AADSTS50173|refresh token/i.test(e instanceof Error ? e.message : String(e));
