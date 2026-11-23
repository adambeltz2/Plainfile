import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changelogByVersion } from '../src/changelog';

describe('changelogByVersion', () => {
  it('lists versions without dates and drops the introduction', () => {
    const out = changelogByVersion('# Changelog\n\nIntro text.\n\n## [0.2.0] - 2026-11-22\n\n### Added\n- B\n\n## [0.1.0] - 2026-11-01\n- A\n');
    expect(out).toBe('## 0.2.0\n\n### Added\n- B\n\n## 0.1.0\n- A\n');
  });
  it('leaves no date in the real change log', () => {
    const out = changelogByVersion(readFileSync('CHANGELOG.md', 'utf8'));
    expect(out).not.toMatch(/^## .*\d{4}-\d{2}-\d{2}/m);
    expect(out.startsWith('## ')).toBe(true);
  });
  it('has an entry for the version being shipped', () => {
    const v = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
    expect(changelogByVersion(readFileSync('CHANGELOG.md', 'utf8'))).toContain(`## ${v}\n`);
  });
});

import { changelogSection } from '../src/changelog';
describe('changelogSection', () => {
  it('returns one version, trimmed, and nothing for an unknown one', () => {
    const md = '# C\n\n## [0.2.0] - 2026-11-22\n\n### Added\n- B\n\n## [0.1.0] - 2026-11-01\n- A\n';
    expect(changelogSection(md, '0.2.0')).toBe('### Added\n- B');
    expect(changelogSection(md, '0.1.0')).toBe('- A');
    expect(changelogSection(md, '9.9.9')).toBe('');
  });
  it('exists for the version being shipped, with dates kept', () => {
    const v = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
    expect(changelogSection(readFileSync('CHANGELOG.md', 'utf8'), v).length).toBeGreaterThan(10);
  });
});
