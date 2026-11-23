import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let root = '';
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

const run = (...args: string[]) => spawnSync('npx', ['tsx', 'src/cli.ts', ...args, '--vault', root], { encoding: 'utf8' });

describe('plainfile check', () => {
  it('prints JSON, and --strict fails only when something is broken', () => {
    root = mkdtempSync(join(tmpdir(), 'plainfile-cli-'));
    mkdirSync(join(root, 'n'));
    writeFileSync(join(root, 'a.md'), 'See [[b]].\n');
    writeFileSync(join(root, 'b.md'), 'Fine.\n');
    const ok = run('check', '--json', '--strict');
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ broken: 0, unresolved: [] });

    writeFileSync(join(root, 'a.md'), 'See [[nope]].\n');
    const plain = run('check', '--json');
    expect(plain.status).toBe(0); // without --strict it only reports
    expect(JSON.parse(plain.stdout).unresolved).toHaveLength(1);
    const strict = run('check', '--strict', '--json');
    expect(strict.status).toBe(1);
    expect(JSON.parse(strict.stdout).broken).toBe(1);
  }, 30000);
});
