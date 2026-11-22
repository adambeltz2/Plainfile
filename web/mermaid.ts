/**
 * Mermaid diagrams, as an optional extra. A fenced ```mermaid block is drawn under its code in the editor.
 *
 * Mermaid is large, so it is not bundled: it is loaded from a CDN the first time a note has a diagram, pinned to
 * an exact version with a subresource integrity hash. Offline, or if it cannot load, the note just shows its code.
 *
 * To remove the feature: delete this file, `src/diagrams.ts`, and the lines in `web/editor.ts` marked MERMAID.
 */
export const MERMAID_VERSION = '11.4.1';
export const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;
export const MERMAID_SRI = 'sha384-rbtjAdnIQE/aQJGEgXrVUlMibdfTSa4PQju4HDhN3sR2PmaKFzhEafuePsl9H/9I';

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

let loading: Promise<MermaidApi> | undefined;

function load(): Promise<MermaidApi> {
  const w = window as unknown as { mermaid?: MermaidApi };
  if (w.mermaid) return Promise.resolve(w.mermaid);
  loading ??= new Promise<MermaidApi>((resolve, reject) => {
    const s = document.createElement('script');
    // A test can point this at a local stand-in, which cannot carry the real file's hash.
    const override = window.__plainfile?.mermaidUrl;
    s.src = override ?? MERMAID_URL;
    if (!override) {
      s.integrity = MERMAID_SRI;
      s.crossOrigin = 'anonymous';
    }
    s.onload = () => (w.mermaid ? resolve(w.mermaid) : reject(new Error('Mermaid did not start.')));
    s.onerror = () => {
      loading = undefined; // try again next time, for example once back online
      reject(new Error('Mermaid could not be loaded (offline?).'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const cache = new Map<string, string>();
let counter = 0;

/** The page colors, so a diagram is black and white like the rest of the app, in light and dark. */
function theme(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, d: string): string => css.getPropertyValue(n).trim() || d;
  const fg = v('--fg', '#000');
  const bg = v('--bg', '#fff');
  const soft = v('--soft', '#eee');
  return { background: bg, primaryColor: soft, primaryTextColor: fg, primaryBorderColor: fg, lineColor: fg, secondaryColor: soft, tertiaryColor: bg, textColor: fg, nodeBorder: fg, clusterBkg: bg, edgeLabelBackground: bg };
}

export type Drawn = { svg: string } | { error: string };

/** Draw one diagram to an SVG string. Never throws: a problem comes back as `{ error }`. */
export async function drawMermaid(source: string): Promise<Drawn> {
  const t = theme();
  const key = `${JSON.stringify(t)}\n${source}`;
  const hit = cache.get(key);
  if (hit) return { svg: hit };
  try {
    const m = await load();
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: t, fontFamily: 'inherit' });
    const { svg } = await m.render(`mmd-${++counter}`, source);
    if (cache.size > 50) cache.clear();
    cache.set(key, svg);
    return { svg };
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0] ?? 'Could not draw this diagram.' : 'Could not draw this diagram.' };
  }
}
