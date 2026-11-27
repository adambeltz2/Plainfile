// Bundles the web app into dist/ as plain static files. No server, no framework.
import { build } from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sampleRoot = join(root, 'sample-vault');

function readTree(dir, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) readTree(p, out);
    else out[relative(sampleRoot, p).split('\\').join('/')] = readFileSync(p, 'utf8');
  }
  return out;
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(join(root, 'dist'), { recursive: true });

await build({
  // The note editor (CodeMirror, most of the size) is its own chunk, loaded the first time a note is opened.
  entryPoints: { app: join(root, 'web/main.ts') },
  outdir: join(root, 'dist'),
  splitting: true,
  chunkNames: 'chunk-[hash]',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !process.env.NO_MINIFY, // set NO_MINIFY=1 to keep function names for profiling
  sourcemap: !!process.env.SOURCEMAP, // set SOURCEMAP=1 for profiling; they are not published
  define: {
    __SAMPLE_VAULT__: JSON.stringify(readTree(sampleRoot)),
    __APP_VERSION__: JSON.stringify(version),
    __CHANGELOG__: JSON.stringify(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')),
    __DROPBOX_APP_KEY__: JSON.stringify(process.env.DROPBOX_APP_KEY ?? ''),
    __ONEDRIVE_CLIENT_ID__: JSON.stringify(process.env.ONEDRIVE_CLIENT_ID ?? ''),
  },
  logLevel: 'info',
});

for (const f of ['index.html', 'app.css', 'manifest.json']) copyFileSync(join(root, 'web', f), join(root, 'dist', f));
cpSync(join(root, 'web', 'icons'), join(root, 'dist', 'icons'), { recursive: true });

// The service worker's cache name carries the app version, so each release replaces the old cache.
// The split-off chunks are part of the shell too, so the editor still opens offline.
const chunks = readdirSync(join(root, 'dist'))
  .filter((f) => /^chunk-.*\.js$/.test(f))
  .map((f) => `./${f}`);
writeFileSync(
  join(root, 'dist', 'sw.js'),
  readFileSync(join(root, 'web', 'sw.js'), 'utf8')
    .replace('__VERSION__', version)
    .replace('__CHUNKS__', JSON.stringify(chunks)),
);
