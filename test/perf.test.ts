import { describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { search, todayView } from '../src/query';
import { hubTasks } from '../src/hub';
import { ALL_PROJECTS } from '../src/projects';

/**
 * Performance budgets on a synthetic 5,000-note vault (the size the project promises to stay cheap at). The limits
 * are generous so a slow machine does not fail them; they exist to catch a change that makes something several
 * times slower, such as work that used to happen once per change happening once per note.
 */
const N = 5000;
const TODAY = '2026-11-23';

function vault(): MemoryStorage {
  const files: Record<string, string> = {};
  for (let i = 0; i < N; i++) {
    const folder = `area-${i % 25}/topic-${i % 7}`;
    files[`${folder}/Note ${i}.md`] =
      `---\ntitle: Note ${i}\ntags: [t${i % 40}, common]\nproject: p${i % 10}\n---\n# Note ${i}\nSome words about subject ${i % 97} and [[Note ${(i + 1) % N}]].\n- [ ] Task ${i} due:2026-11-${String(1 + (i % 28)).padStart(2, '0')} @person${i % 12}\n- [x] Done ${i}\n`;
  }
  for (let p = 0; p < 10; p++) files[`projects/p${p}/index.md`] = `---\ntitle: P${p}\ntype: project\nactive: true\n---\n- [ ] Project task ${p}\n`;
  return new MemoryStorage(files);
}

const timed = async <T>(label: string, fn: () => T | Promise<T>): Promise<{ value: T; ms: number }> => {
  const t0 = performance.now();
  const value = await fn();
  const ms = performance.now() - t0;
  process.stdout.write(`perf: ${label} ${Math.round(ms)} ms\n`);
  return { value, ms };
};

describe(`a ${N}-note vault`, () => {
  it('opens, searches and lists tasks within budget', async () => {
    const store = vault();
    const index = new VaultIndex(store);
    const scan = await timed('scan', () => index.scan());
    expect(index.notes.size).toBe(N + 10);
    expect(scan.ms).toBeLessThan(15_000);

    const tasks = await timed('tasks() first call', () => index.tasks());
    expect(tasks.value.length).toBe(N * 2 + 10);
    const again = await timed('tasks() cached', () => index.tasks());
    expect(again.value).toBe(tasks.value);
    expect(again.ms).toBeLessThan(5);

    const find = await timed('getTask x200', () => {
      for (let i = 0; i < 200; i++) index.getTask(`area-${i % 25}/topic-${i % 7}/Note ${i}.md:8`);
    });
    expect(find.ms).toBeLessThan(2_000);

    const s = await timed('search "subject 42"', () => search(index, 'subject 42', TODAY));
    expect(s.value.length).toBeGreaterThan(0);
    expect(s.ms).toBeLessThan(2_000);

    const view = await timed('today view', () => todayView(index.tasks(), TODAY));
    expect(view.value.overdue.length).toBeGreaterThan(0);
    expect(view.ms).toBeLessThan(2_000);

    const all = await timed('all tasks across projects', () => hubTasks(index, ALL_PROJECTS));
    expect(all.value.length).toBeGreaterThan(N);
    expect(all.ms).toBeLessThan(5_000);

    const quick = await timed('health badge (no suggestions)', () => checkHealth(index, { suggestions: false }));
    expect(quick.value.unresolved.length).toBe(0);
    expect(quick.ms).toBeLessThan(5_000);
  }, 120_000);
});
