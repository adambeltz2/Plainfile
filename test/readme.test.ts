import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The README is short; the feature list lives in docs/FEATURES.md. Together they must still cover every screen and operator.
const readme = readFileSync('README.md', 'utf8') + readFileSync('docs/FEATURES.md', 'utf8');
const main = readFileSync('web/main.ts', 'utf8');

describe('README stays in step with the app', () => {
  it('mentions every screen in the header navigation', () => {
    const labels = [...main.matchAll(/\{ id: '\w+', label: '([^']+)' \}/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThanOrEqual(7);
    for (const l of labels) expect(readme.toLowerCase(), `README should mention the ${l} screen`).toContain(l.toLowerCase());
  });
  it('shows a screenshot for every header screen that has one, and every referenced image exists', () => {
    const imgs = [...readme.matchAll(/docs\/screenshots\/([\w-]+\.png)/g)].map((m) => m[1]!);
    expect(imgs.length).toBeGreaterThan(5);
    for (const i of imgs) expect(existsSync(`docs/screenshots/${i}`), `${i} is missing`).toBe(true);
  });
  it('lists every search operator the guide documents', () => {
    for (const op of ['modified:', 'created:', 'tag:', 'folder:', 'type:', 'due:']) expect(readme).toContain(op);
  });
});
