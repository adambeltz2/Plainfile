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
  entryPoints: [join(root, 'web/main.ts')],
  outfile: join(root, 'dist/app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  define: { __SAMPLE_VAULT__: JSON.stringify(readTree(sampleRoot)), __APP_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
});

for (const f of ['index.html', 'app.css', 'manifest.json']) copyFileSync(join(root, 'web', f), join(root, 'dist', f));
cpSync(join(root, 'web', 'icons'), join(root, 'dist', 'icons'), { recursive: true });

// The service worker's cache name carries the app version, so each release replaces the old cache.
writeFileSync(join(root, 'dist', 'sw.js'), readFileSync(join(root, 'web', 'sw.js'), 'utf8').replace('__VERSION__', version));
