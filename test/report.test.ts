import { describe, expect, it } from 'vitest';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { statusReport } from '../src/report';
import { toHtml } from '../src/render';

const TODAY = '2026-11-21';
const FILES: Record<string, string> = {
  'projects/site/index.md': '---\ntitle: Website relaunch\ntype: project\nactive: true\n---\n## Goal\nLaunch by Dec 8\n## Phase 1\n- [ ] Pick a host @sam due:2026-11-10\n- [x] Buy domain @dana\n## Phase 2\n- [ ] Write copy @dana due:2026-11-25\n- [ ] Loose end\n- Ask legal #followup\n',
  'projects/site/tasks/Legal.md': '---\ntitle: Legal sign-off\nstatus: waiting\ncreated: 2026-11-10\npeople: [pat]\n---\n',
  'projects/site/notes.md': '# Notes\ntext',
};

describe('status report', () => {
  it('is markdown with the numbers, phases, what is late, what is coming, who is waited on, and notes', async () => {
    const index = new VaultIndex(new MemoryStorage(FILES));
    await index.scan();
    const md = statusReport(index, 'projects/site/index.md', TODAY)!;
    expect(md.startsWith('# Website relaunch: status\n*Saturday 21 November*')).toBe(true);
    expect(md).toContain('**20% complete** · 1 of 5 tasks done · 4 open · 1 overdue');
    expect(md).toContain('Launch by Dec 8');
    expect(md).toContain('| Phase 1 | 1 | 2 | 50% |');
    expect(md).toContain('## Overdue\n\n- Pick a host (due Tue 10 Nov, Sam)');
    expect(md).toContain('- Write copy (Wed 25 Nov, Dana)');
    expect(md).toContain('## Waiting on\n\n- Legal sign-off (11 days, Pat)');
    expect(md).toContain('2 open tasks have no date.');
    expect(md).toContain('- Ask legal');
    expect(md).toContain('## Recent notes');
    expect(md).not.toMatch(/\n{3,}/);
    expect(md).not.toContain('@'); // people are named, not tagged, so the clean copy keeps them
  });

  it('turns into a clean document, and says so for a project that is not there', async () => {
    const index = new VaultIndex(new MemoryStorage(FILES));
    await index.scan();
    const html = toHtml(statusReport(index, 'projects/site/index.md', TODAY)!);
    expect(html).toContain('<h1>Website relaunch: status</h1>');
    expect(html).toContain('<table border="1"');
    expect(html).toContain('<h2>Overdue</h2>');
    expect(statusReport(index, 'nope.md', TODAY)).toBeUndefined();
  });
});
