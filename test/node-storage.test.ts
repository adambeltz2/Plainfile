import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeStorage } from '../src/node-storage';

let root = '';
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

describe('NodeStorage keeps to the vault folder', () => {
  it('refuses paths that climb out of it, for every operation', async () => {
    root = mkdtempSync(join(tmpdir(), 'plainfile-'));
    const s = new NodeStorage(root);
    await s.create('ok.md', 'fine');
    for (const bad of ['../escape.md', 'a/../../escape.md', '..']) {
      await expect(s.read(bad)).rejects.toThrow(/outside the vault/);
      await expect(s.create(bad, 'x')).rejects.toThrow(/outside the vault/);
      await expect(s.stat(bad)).rejects.toThrow(/outside the vault/);
    }
    expect(await s.read('ok.md')).toBe('fine');
    expect(await s.read('sub/../ok.md')).toBe('fine'); // staying inside is fine
  });
});
