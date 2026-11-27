import { authorizeUrl, challengeFor, exchangeCode, ONEDRIVE_TOKENS, randomString, signInExpired, TokenSource, type Tokens } from '../src/onedrive-auth';
import { OneDriveStorage } from '../src/onedrive-storage';
import { errorMessage, loadVault, render, state } from './store';
import { esc } from './util';

/**
 * OneDrive on the first screen: personal and work or school accounts, in any browser (phones and Safari included),
 * because the files are reached over Microsoft's web API. Sign-in tokens are kept only in this browser's storage.
 * Nothing goes through any server of ours.
 */
interface Saved {
  clientId: string;
  root: string;
  tokens: Tokens;
}

const KEY = 'plainfile:onedrive';
const PENDING = 'plainfile:onedrive-pending';

export const onedrive = { open: false, clientId: '', root: '', busy: false };

function load(): Saved | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    return v?.tokens?.refresh ? v : undefined;
  } catch {
    return undefined;
  }
}

function store(s: Saved | undefined): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* blocked storage: the user signs in again next time */
  }
}

/**
 * The Application (client) ID everyone signs in with by default. It is public by design (it is sent to the browser and
 * shown in every sign-in address), and sign-in uses PKCE, so there is no secret to protect. Left empty until the
 * project's own app is registered (docs/ONEDRIVE.md), and the OneDrive card stays hidden until then. A copy of tendfile
 * gets its own by setting ONEDRIVE_CLIENT_ID at build time. Someone can also paste an ID under "Use my own OneDrive app".
 */
const DEFAULT_CLIENT_ID = '';
const builtInId = (): string => (typeof __ONEDRIVE_CLIENT_ID__ === 'string' && __ONEDRIVE_CLIENT_ID__ ? __ONEDRIVE_CLIENT_ID__ : DEFAULT_CLIENT_ID);
const redirectUri = (): string => location.origin + location.pathname;
const rootLabel = (r: string): string => (r ? r.replace(/^\/+|\/+$/g, '') : 'the whole OneDrive');

/** The OneDrive card shows once this build has an app ID of its own (or someone is already signed in). Until then there is nothing for most people to press. */
export function html(): string {
  const saved = load();
  if (!saved && !builtInId()) return '';
  let h = '<div class="cloud"><h2>OneDrive</h2>';
  if (saved) {
    h +=
      `<p class="muted small" style="margin:0 0 8px">Signed in. Folder: <span class="mono">${esc(rootLabel(saved.root))}</span></p>` +
      '<div class="row"><button class="btn primary" data-act="onedrive-open">Open OneDrive</button><button class="btn" data-act="onedrive-signout">Sign out</button></div>';
  } else if (!onedrive.open) {
    h +=
      '<p class="muted small" style="margin:0 0 8px">Works in any browser, including iPhone and Safari, with a personal or a work or school account. Files stay in your OneDrive.</p><button class="btn" data-act="onedrive-form">Connect OneDrive</button>';
  } else {
    h +=
      `<div class="fld"><label for="od-root">Folder (optional)</label><input id="od-root" class="inp" autocomplete="off" spellcheck="false" placeholder="Documents/Notes, or leave empty" value="${esc(onedrive.root)}"></div>` +
      `<p class="muted small" style="margin:0 0 8px">Microsoft ends a sign-in in a browser after a day, so you will be asked to sign in again (usually one click).</p>` +
      `<div class="row"><button class="btn primary" data-act="onedrive-connect"${onedrive.busy ? ' disabled' : ''}>${onedrive.busy ? 'Going to Microsoft…' : 'Connect'}</button><button class="btn" data-act="onedrive-cancel">Cancel</button></div>` +
      `<details style="margin-top:8px"${onedrive.clientId ? ' open' : ''}><summary class="small">Use my own OneDrive app</summary><p class="small muted" style="margin:6px 0">Optional. tendfile signs in with its own OneDrive app, which is shared by everyone who uses it. Use yours instead if you prefer.</p>` +
      `<div class="fld"><label for="od-id">Application (client) ID</label><input id="od-id" class="inp" autocomplete="off" spellcheck="false" placeholder="from your app registration in the Microsoft Entra admin center" value="${esc(onedrive.clientId)}"></div>` +
      `<ol class="small"><li>Open <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer">App registrations</a> in the Microsoft Entra admin center and choose <b>New registration</b>.</li>` +
      '<li>For <b>Supported account types</b> choose the option that includes personal Microsoft accounts.</li>' +
      `<li>Under <b>Redirect URI</b> pick <b>Single-page application (SPA)</b> and enter <code>${esc(redirectUri())}</code></li>` +
      '<li>On <b>API permissions</b> add the Microsoft Graph delegated permissions <code>Files.ReadWrite</code> and <code>offline_access</code>.</li></ol></details>';
  }
  return `${h}</div>`;
}

export async function startConnect(): Promise<void> {
  const clientId = (onedrive.clientId.trim() || builtInId()).trim();
  if (!clientId) {
    state.error = 'There is no OneDrive app ID. Paste one under "Use my own OneDrive app".';
    return render();
  }
  onedrive.busy = true;
  render();
  const verifier = randomString(48);
  const st = randomString(16);
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state: st, clientId, root: onedrive.root.trim() }));
  } catch {
    onedrive.busy = false;
    state.error = 'This browser is blocking the storage sign-in needs.';
    return render();
  }
  location.assign(authorizeUrl({ clientId, redirectUri: redirectUri(), challenge: await challengeFor(verifier), state: st }));
}

async function open(saved: Saved): Promise<void> {
  const src = new TokenSource(saved.clientId, saved.tokens, (tokens) => store({ ...saved, tokens }), undefined, undefined, ONEDRIVE_TOKENS);
  const getToken = async (refresh?: boolean): Promise<string> => {
    try {
      return await src.getToken(refresh);
    } catch (e) {
      if (!signInExpired(e)) throw e;
      // Microsoft ends a browser sign-in after a day. Forget it, so the card offers Connect again.
      store(undefined);
      throw new Error('Your OneDrive sign-in has expired (Microsoft ends it after a day in a browser). Choose Connect OneDrive to sign in again.');
    }
  };
  const root = saved.root.replace(/^\/+|\/+$/g, '');
  await loadVault(new OneDriveStorage({ getToken, root }), root ? `OneDrive: ${root}` : 'OneDrive', false);
  if (!state.index) render(); // back on the first screen: show Connect if the sign-in was forgotten
}

/** Call once at start, before Dropbox's: finishes a OneDrive sign-in if Microsoft has just sent the user back. Returns true if it took over. */
export async function finishConnect(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.get('error')) return false;
  let pending: { verifier: string; state: string; clientId: string; root: string } | undefined;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') ?? undefined;
  } catch {
    pending = undefined;
  }
  if (!pending) return false; // not ours: leave it for another sign-in to claim
  try {
    sessionStorage.removeItem(PENDING);
  } catch {
    /* nothing to forget */
  }
  history.replaceState(null, '', redirectUri());
  if (q.get('error')) {
    state.error = `OneDrive sign-in was not completed (${q.get('error_description') ?? q.get('error')}).`;
    render();
    return true;
  }
  if (pending.state !== q.get('state')) {
    state.error = 'That OneDrive sign-in did not match this browser session. Please try again.';
    render();
    return true;
  }
  try {
    const tokens = await exchangeCode({ clientId: pending.clientId, code: q.get('code') as string, verifier: pending.verifier, redirectUri: redirectUri() });
    const saved = { clientId: pending.clientId, root: pending.root, tokens };
    store(saved);
    await open(saved);
  } catch (e) {
    state.error = `Could not finish signing in to OneDrive. ${errorMessage(e)}`;
    render();
  }
  return true;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  switch (act) {
    case 'onedrive-form':
      onedrive.open = true;
      render();
      return true;
    case 'onedrive-cancel':
      onedrive.open = false;
      onedrive.busy = false;
      render();
      return true;
    case 'onedrive-connect':
      await startConnect();
      return true;
    case 'onedrive-open': {
      const saved = load();
      if (saved) await open(saved);
      return true;
    }
    case 'onedrive-signout':
      store(undefined);
      render();
      return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'od-id') onedrive.clientId = t.value;
  else if (t.id === 'od-root') onedrive.root = t.value;
  else return false;
  return true;
}
