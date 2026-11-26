import { render } from './store';

/**
 * An Install button in the footer, for browsers that offer to install the app (Chrome, Edge and others fire
 * `beforeinstallprompt`). It only shows while the browser is willing and the app is not already installed.
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | undefined;

const installed = (): boolean => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function listenForInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallEvent;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    render();
  });
}

/** The footer button, or nothing. */
export function installButton(): string {
  return deferred && !installed() ? '<button class="link" data-act="install" title="Install tendfile as an app on this device">Install</button>' : '';
}

export async function install(): Promise<void> {
  const e = deferred;
  if (!e) return;
  deferred = undefined; // a prompt can be used once
  await e.prompt();
  await e.userChoice.catch(() => undefined);
  render();
}
