import { describe, expect, it } from 'vitest';
import { applyBulk, editFileText, editInlineLine, planBulk } from '../src/bulk';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { byPriority, extractPriority, normalizePriority, stripPriority } from '../src/priority';
import { todayView } from '../src/query';

describe('reading a priority', () => {
  it('takes a capital letter in parentheses at the start of the task', () => {
    expect(extractPriority('(A) Call Dana')).toBe('A');
    expect(extractPriority('(B)')).toBe('B');
    expect(extractPriority('(Z) last')).toBe('Z');
  });
  it('does not mistake prose for a priority', () => {
    expect(extractPriority('(a) first item of a legal list')).toBeUndefined();
    expect(extractPriority('Call Dana (A) later')).toBeUndefined();
    expect(extractPriority('(AB) two letters')).toBeUndefined();
    expect(extractPriority('(A)thing with no space')).toBeUndefined();
  });
  it('reads Obsidian Tasks emoji, and a leading letter wins over them', () => {
    expect(extractPriority('Pay rent ⏫ 📅 2026-12-01')).toBe('A');
    expect(extractPriority('Pay rent 🔼')).toBe('B');
    expect(extractPriority('Pay rent 🔽')).toBe('C');
    expect(extractPriority('(C) Pay rent ⏫')).toBe('C');
  });
  it('strips the marks from the title', () => {
    expect(stripPriority('(A) Call Dana')).toBe('Call Dana');
    expect(stripPriority('Pay rent ⏫ due:2026-12-01').replace(/\s+/g, ' ')).toBe('Pay rent due:2026-12-01');
  });
  it('reads a frontmatter value of any case, and nothing else', () => {
    expect(normalizePriority('a')).toBe('A');
    expect(normalizePriority(' B ')).toBe('B');
    expect(normalizePriority('high')).toBeUndefined();
    expect(normalizePriority(1)).toBeUndefined();
  });
  it('sorts A before B before no priority', () => {
    expect(['B', undefined, 'A', 'C'].sort(byPriority)).toEqual(['A', 'B', 'C', undefined]);
  });
});

describe('the index', () => {
  it('gives inline and task-note tasks a priority and keeps it out of the title', async () => {
    const store = new MemoryStorage({
      'a.md': '- [ ] (A) Send invoice due:2026-11-20\n- [ ] Plain\n- [ ] (B) Second\n',
      'tasks/Note task.md': '---\ntitle: Note task\nstatus: todo\npriority: b\n---\n',
    });
    const index = new VaultIndex(store);
    await index.scan();
    const by = Object.fromEntries(index.tasks().map((t) => [t.title, t.priority]));
    expect(by).toEqual({ 'Send invoice': 'A', Plain: undefined, Second: 'B', 'Note task': 'B' });
  });
  it('sorts the day by priority, then by date', async () => {
    const store = new MemoryStorage({
      'a.md':
        '- [ ] Zeta due:2026-11-23\n- [ ] (B) Beta due:2026-11-23\n- [ ] (A) Alpha due:2026-11-23\n- [ ] (C) Late one due:2026-11-20\n- [ ] (A) Later A due:2026-11-21\n',
    });
    const index = new VaultIndex(store);
    await index.scan();
    const v = todayView(index.tasks(), '2026-11-23');
    expect(v.overdue.map((t) => t.title)).toEqual(['Later A', 'Late one']);
    expect(v.today.map((t) => t.title)).toEqual(['Alpha', 'Beta', 'Zeta']);
  });
});

describe('writing a priority', () => {
  it('sets, changes and clears one on a checkbox line, touching nothing else', () => {
    expect(editInlineLine('- [ ] Call Dana @dana due:2026-11-24', { kind: 'priority', letter: 'A' })).toBe('- [ ] (A) Call Dana @dana due:2026-11-24');
    expect(editInlineLine('- [ ] (B) Call Dana', { kind: 'priority', letter: 'A' })).toBe('- [ ] (A) Call Dana');
    expect(editInlineLine('- [ ] (A) Call Dana', { kind: 'priority', letter: null })).toBe('- [ ] Call Dana');
    expect(editInlineLine('  * [x] (C) Nested\r', { kind: 'priority', letter: 'B' })).toBe('  * [x] (B) Nested\r');
    expect(editInlineLine('1. [ ] Numbered', { kind: 'priority', letter: 'A' })).toBe('1. [ ] (A) Numbered');
  });
  it('replaces an Obsidian emoji priority instead of leaving two', () => {
    expect(editInlineLine('- [ ] Pay rent ⏫ 📅 2026-12-01', { kind: 'priority', letter: 'B' })).toBe('- [ ] (B) Pay rent 📅 2026-12-01');
    expect(editInlineLine('- [ ] Pay rent 🔼', { kind: 'priority', letter: null })).toBe('- [ ] Pay rent');
  });
  it('leaves a line that is not a checkbox, or has no text, alone', () => {
    expect(editInlineLine('Plain line', { kind: 'priority', letter: 'A' })).toBeNull();
    expect(editInlineLine('- [ ]', { kind: 'priority', letter: 'A' })).toBeNull();
  });
  it('changes one frontmatter value in a task note', () => {
    const text = '---\ntitle: B\nstatus: todo\n---\nbody\n';
    expect(editFileText(text, { kind: 'priority', letter: 'A' })).toBe('---\ntitle: B\nstatus: todo\npriority: A\n---\nbody\n');
    expect(editFileText('---\ntitle: B\nstatus: todo\npriority: A\n---\nbody\n', { kind: 'priority', letter: null })).toBe(text);
  });
  it('writes through the guarded path with every other byte unchanged, and rejects a bad letter', async () => {
    const FILES = {
      'p/index.md': '---\ntitle: P\n---\n# P\r\n- [ ] One due:2026-11-20\r\n- [ ] Two @sam\n- [x] Three #launch\nPlain line\n',
      'p/tasks/a.md': '---\ntitle: A\nstatus: todo\ndue: 2026-11-25 # keep this comment\n---\nbody\n',
    };
    const store = new MemoryStorage(FILES);
    const index = new VaultIndex(store);
    await index.scan();
    const ids = ['One', 'A'].map((t) => index.tasks().find((x) => x.title === t)!.id);
    await expect(planBulk(store, index, ids, { kind: 'priority', letter: 'high' })).rejects.toThrow(/one capital letter/);
    const plan = await planBulk(store, index, ids, { kind: 'priority', letter: 'A' });
    await applyBulk(store, index, plan.edits);
    expect(await store.read('p/index.md')).toBe(FILES['p/index.md'].replace('- [ ] One', '- [ ] (A) One'));
    expect(await store.read('p/tasks/a.md')).toBe(FILES['p/tasks/a.md'].replace('# keep this comment\n', '# keep this comment\npriority: A\n'));
  });
});
