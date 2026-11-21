import { authorizeUrl, challengeFor, exchangeCode, randomString, TokenSource, type Tokens } from '../src/dropbox-auth';
import { DropboxStorage } from '../src/dropbox-storage';
import { errorMessage, loadVault, render, state } from './store';
import { esc } from './util';

/**
 * Cloud storage on the first screen. Dropbox works in every browser, including phones and Safari, because
 * the files are reached over Dropbox's web API instead of a local folder. Sign-in tokens are kept only in
 * this browser's storage. Nothing goes through any server of ours.
 */
interface Saved {
  appKey: string;
  root: string;
  tokens: Tokens;
}

const KEY = 'plainfile:dropbox';
const PENDING = 'plainfile:dropbox-pending';

export const cloud = { open: false, appKey: '', root: '', busy: false };

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
 * The app key everyone signs in with by default. A Dropbox app key is public by design (it is sent to the
 * browser and shown in every sign-in address), and sign-in uses PKCE, so there is no secret to protect.
 * A copy of Plainfile can use its own app by setting DROPBOX_APP_KEY at build time, or by pasting a key
 * under "Use my own Dropbox app".
 */
const DEFAULT_APP_KEY = 'vfcwmj0eu2kdiud';
const builtInKey = (): string => (typeof __DROPBOX_APP_KEY__ === 'string' && __DROPBOX_APP_KEY__ ? __DROPBOX_APP_KEY__ : DEFAULT_APP_KEY);
const redirectUri = (): string => location.origin + location.pathname;
const rootLabel = (r: string): string => (r ? `/${r.replace(/^\/+|\/+$/g, '')}` : 'whole Dropbox or app folder');

export function html(): string {
  const saved = load();
  let h = '<div class="cloud"><h2>Dropbox</h2>';
  if (saved) {
    h += `<p class="muted small" style="margin:0 0 8px">Signed in. Folder: <span class="mono">${esc(rootLabel(saved.root))}</span></p>` +
      '<div class="row"><button class="btn primary" data-act="dropbox-open">Open Dropbox</button><button class="btn" data-act="dropbox-signout">Sign out</button></div>';
  } else if (!cloud.open) {
    h += '<p class="muted small" style="margin:0 0 8px">Works in any browser, including iPhone and Safari. Files stay in your Dropbox.</p><button class="btn" data-act="dropbox-form">Connect Dropbox</button>';
  } else {
    h +=
      `<div class="fld"><label for="db-root">Folder (optional)</label><input id="db-root" class="inp" autocomplete="off" spellcheck="false" placeholder="/Notes, or leave empty" value="${esc(cloud.root)}"></div>` +
      `<div class="row"><button class="btn primary" data-act="dropbox-connect"${cloud.busy ? ' disabled' : ''}>${cloud.busy ? 'Going to Dropbox…' : 'Connect'}</button><button class="btn" data-act="dropbox-cancel">Cancel</button></div>` +
      `<details style="margin-top:8px"${cloud.appKey ? ' open' : ''}><summary class="small">Use my own Dropbox app</summary><p class="small muted" style="margin:6px 0">Optional. Plainfile signs in with its own Dropbox app unless you give a key here.</p>` +
      `<div class="fld"><label for="db-key">Dropbox app key</label><input id="db-key" class="inp" autocomplete="off" spellcheck="false" placeholder="from your app at dropbox.com/developers/apps" value="${esc(cloud.appKey)}"></div>` +
      `<ol class="small"><li>Open <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer">dropbox.com/developers/apps</a> and choose <b>Create app</b>, <b>Scoped access</b>, then <b>App folder</b> or <b>Full Dropbox</b>.</li>` +
      '<li>On <b>Permissions</b> tick <code>files.metadata.read</code>, <code>files.metadata.write</code>, <code>files.content.read</code> and <code>files.content.write</code>, then Submit.</li>' +
      `<li>On <b>Settings</b>, add this under <b>Redirect URIs</b>: <code>${esc(redirectUri())}</code></li></ol></details>`;
  }
  return `${h}</div>`;
}

export async function startConnect(): Promise<void> {
  const appKey = (cloud.appKey.trim() || builtInKey()).trim();
  if (!appKey) {
    state.error = 'There is no Dropbox app key. Paste one under "Use my own Dropbox app".';
    return render();
  }
  cloud.busy = true;
  render();
  const verifier = randomString(48);
  const st = randomString(16);
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state: st, appKey, root: cloud.root.trim() }));
  } catch {
    cloud.busy = false;
    state.error = 'This browser is blocking the storage sign-in needs.';
    return render();
  }
  location.assign(authorizeUrl({ appKey, redirectUri: redirectUri(), challenge: await challengeFor(verifier), state: st }));
}

async function open(saved: Saved): Promise<void> {
  const src = new TokenSource(saved.appKey, saved.tokens, (tokens) => store({ ...saved, tokens }));
  const root = saved.root.replace(/^\/+|\/+$/g, '');
  await loadVault(new DropboxStorage({ getToken: src.getToken, root }), root ? `Dropbox: ${root}` : 'Dropbox', false);
}

/** Call once at start: finishes a sign-in if Dropbox has just sent the user back. Returns true if it took over. */
export async function finishConnect(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.get('error')) return false;
  const clean = (): void => history.replaceState(null, '', redirectUri());
  let pending: { verifier: string; state: string; appKey: string; root: string } | undefined;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') ?? undefined;
    sessionStorage.removeItem(PENDING);
  } catch {
    pending = undefined;
  }
  clean();
  if (q.get('error')) {
    state.error = `Dropbox sign-in was not completed (${q.get('error_description') ?? q.get('error')}).`;
    render();
    return true;
  }
  if (!pending || pending.state !== q.get('state')) {
    state.error = 'That Dropbox sign-in did not match this browser session. Please try again.';
    render();
    return true;
  }
  try {
    const tokens = await exchangeCode({ appKey: pending.appKey, code: q.get('code') as string, verifier: pending.verifier, redirectUri: redirectUri() });
    const saved = { appKey: pending.appKey, root: pending.root, tokens };
    store(saved);
    await open(saved);
  } catch (e) {
    state.error = `Could not finish signing in to Dropbox. ${errorMessage(e)}`;
    render();
  }
  return true;
}

export async function click(target: HTMLElement): Promise<boolean> {
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  switch (act) {
    case 'dropbox-form':
      cloud.open = true;
      render();
      return true;
    case 'dropbox-cancel':
      cloud.open = false;
      cloud.busy = false;
      render();
      return true;
    case 'dropbox-connect':
      await startConnect();
      return true;
    case 'dropbox-open': {
      const saved = load();
      if (saved) await open(saved);
      return true;
    }
    case 'dropbox-signout':
      store(undefined);
      render();
      return true;
  }
  return false;
}

export function input(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  if (t.id === 'db-key') cloud.appKey = t.value;
  else if (t.id === 'db-root') cloud.root = t.value;
  else return false;
  return true;
}
