/**
 * A friendly screen for the unexpected. If something throws and is not handled, a bar appears with what happened, a
 * Copy details button to paste into a bug report, and a Reload button. Nothing is sent anywhere and nothing is
 * collected: the details stay on the page until you copy them.
 */
let shown = false;

function details(message: string, stack: string): string {
  return [
    `Plainfile v${__APP_VERSION__}`,
    `Page: ${location.origin}${location.pathname}`,
    `Browser: ${navigator.userAgent}`,
    `Screen: ${window.innerWidth}x${window.innerHeight}`,
    `When: ${new Date().toISOString()}`,
    '',
    message,
    stack,
    '',
    'This may contain file names from your folder; read it before sharing.',
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}

/** Errors that are not ours (browser extensions, a layout observer notice) are ignored. */
function ours(source: string | undefined, stack: string, message: string): boolean {
  if (/ResizeObserver loop/i.test(message)) return false;
  if (/^(chrome|moz|safari)-extension:/i.test(source ?? '') || /(chrome|moz|safari)-extension:/i.test(stack)) return false;
  return true;
}

function show(message: string, stack: string): void {
  if (shown) return;
  shown = true;
  const bar = document.createElement('div');
  bar.id = 'fatal-bar';
  bar.setAttribute('role', 'alert');
  const text = details(message, stack);
  const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  bar.innerHTML =
    '<b>Something went wrong.</b> Your files are not affected: nothing is written unless a save finished. ' +
    '<button class="btn small" data-fatal="copy">Copy details</button> <button class="btn small" data-fatal="reload">Reload</button> <button class="btn small" data-fatal="dismiss">Dismiss</button>' +
    `<details><summary class="small">Details</summary><textarea readonly rows="8" aria-label="Details to copy">${esc(text)}</textarea></details>`;
  bar.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-fatal]')?.dataset.fatal;
    if (act === 'reload') location.reload();
    else if (act === 'dismiss') {
      bar.remove();
      shown = false;
    } else if (act === 'copy') {
      const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch {
        bar.querySelector('details')?.setAttribute('open', '');
        btn.textContent = 'Select the text below and copy it';
      }
    }
  });
  document.body.prepend(bar);
}

export function installDiagnostics(): void {
  window.addEventListener('error', (e) => {
    const stack = e.error instanceof Error ? (e.error.stack ?? '') : '';
    if (ours(e.filename, stack, e.message)) show(e.message || 'Unknown error', stack || `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    const message = r instanceof Error ? r.message : String(r);
    const stack = r instanceof Error ? (r.stack ?? '') : '';
    if (ours(undefined, stack, message)) show(message, stack);
  });
}
