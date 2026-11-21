import { describe, expect, it } from 'vitest';
import { INBOX_FILE, addTask, cleanTaskText } from '../src/capture';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';
import { BUILT_IN, createFromTemplate, loadTemplates, parseTemplateFile, promptDefault, renderTemplate } from '../src/templates';

const TODAY = '2026-11-21';
const byName = (n: string) => BUILT_IN.find((t) => t.name === n)!;

async function setup(files: Record<string, string> = {}) {
  const store = new MemoryStorage(files);
  const index = new VaultIndex(store);
  await index.scan();
  return { store, index };
}

describe('renderTemplate', () => {
  it('fills prompts and date variables and works out the path', () => {
    const r = renderTemplate(byName('Meeting'), { title: 'Kickoff', attendees: 'dana, sam' }, TODAY);
    expect(r.path).toBe('meetings/2026-11-21 Kickoff.md');
    expect(r.content).toContain('title: Kickoff\ntype: meeting\ndate: 2026-11-21\nattendees: [dana, sam]');
    expect(r.content).toContain('- [ ] ');
  });

  it('places the cursor where {{cursor}} was and removes the marker', () => {
    const r = renderTemplate(byName('Meeting'), { title: 'x', attendees: '' }, TODAY);
    expect(r.content).not.toContain('{{');
    expect(r.cursor).toBeDefined();
    expect(r.content.slice((r.cursor as number) - 6, r.cursor)).toBe('- [ ] ');
  });

  it('computes date offsets for prompt defaults', () => {
    const due = byName('Task').prompts.find((p) => p.id === 'due')!;
    expect(promptDefault(due, TODAY)).toBe('2026-11-28');
  });

  it('removes characters that are not allowed in file names', () => {
    const r = renderTemplate(byName('Note'), { title: 'a/b: c?' }, TODAY);
    expect(r.path).toBe('inbox/a-b- c-.md');
  });

  it('a task template creates a file the parser treats as a task', async () => {
    const { store, index } = await setup();
    await createFromTemplate(store, index, byName('Task'), { title: 'Write launch email', due: '2026-11-24' }, TODAY);
    expect(index.tasks()).toMatchObject([{ kind: 'file', title: 'Write launch email', due: '2026-11-24', status: 'todo' }]);
  });
});

describe('createFromTemplate', () => {
  it('never overwrites: a taken name gets a number', async () => {
    const { store, index } = await setup({ 'inbox/Idea.md': 'mine' });
    const r = await createFromTemplate(store, index, byName('Note'), { title: 'Idea' }, TODAY);
    expect(r.path).toBe('inbox/Idea 2.md');
    expect(await store.read('inbox/Idea.md')).toBe('mine');
    const r3 = await createFromTemplate(store, index, byName('Note'), { title: 'Idea' }, TODAY);
    expect(r3.path).toBe('inbox/Idea 3.md');
  });
});

describe('template files', () => {
  const file = `---\nplainfile:\n  name: Weekly review\n  folder: reviews\n  filename: "{{date}} review"\n  description: Look back\ntitle: Review {{date}}\ntags: [review]\n---\n## Wins\n{{cursor}}\n## Next week {{focus}}\n`;

  it('reads settings, strips them from the new file and finds prompts', () => {
    const t = parseTemplateFile('.plainfile/templates/review.md', file)!;
    expect(t).toMatchObject({ name: 'Weekly review', folder: 'reviews', description: 'Look back' });
    expect(t.fm).toBe('title: Review {{date}}\ntags: [review]');
    expect(t.prompts.map((p) => p.id)).toEqual(['focus']);
    const r = renderTemplate(t, { focus: 'launch' }, TODAY);
    expect(r.path).toBe('reviews/2026-11-21 review.md');
    expect(r.content).not.toContain('plainfile');
    expect(r.content).toContain('## Next week launch');
  });

  it('ignores a markdown file without plainfile settings', () => {
    expect(parseTemplateFile('t.md', '---\ntitle: x\n---\nbody')).toBeNull();
    expect(parseTemplateFile('t.md', 'no frontmatter')).toBeNull();
  });

  it('loads user templates from the hidden folder and lets them replace a built-in', async () => {
    const own = file.replace('Weekly review', 'Meeting');
    const { store } = await setup({ '.plainfile/templates/review.md': file, '.plainfile/templates/meeting.md': own });
    const all = await loadTemplates(store);
    expect(all.map((t) => t.name)).toEqual(['Note', 'Task', 'Daily journal', 'Person', 'Weekly review', 'Meeting']);
    expect(all.find((t) => t.name === 'Meeting')!.source).toBe('.plainfile/templates/meeting.md');
  });
});

describe('addTask', () => {
  it('creates the Inbox on first use', async () => {
    const { store, index } = await setup();
    const r = await addTask(store, index, { text: 'Call Dana', due: '2026-11-24' });
    expect(r).toMatchObject({ path: INBOX_FILE, line: 3, after: '- [ ] Call Dana due:2026-11-24' });
    expect(await store.read(INBOX_FILE)).toBe('# Inbox\n\n- [ ] Call Dana due:2026-11-24\n');
    expect(index.tasks()).toMatchObject([{ title: 'Call Dana', due: '2026-11-24' }]);
  });

  it('appends without touching what is there, keeping CRLF and fixing a missing final newline', async () => {
    const before = '# Inbox\r\n\r\n- [ ] Old one';
    const { store, index } = await setup({ [INBOX_FILE]: before });
    const r = await addTask(store, index, { text: 'New one' });
    expect(await store.read(INBOX_FILE)).toBe(`${before}\r\n- [ ] New one\r\n`);
    expect(r.line).toBe(4);
  });

  it('does not add a second due date when the text already has one', async () => {
    const { store, index } = await setup();
    const r = await addTask(store, index, { text: 'Pay rent due:2026-12-01', due: '2026-11-24' });
    expect(r.after).toBe('- [ ] Pay rent due:2026-12-01');
  });

  it('refuses to overwrite an Inbox edited elsewhere in the meantime', async () => {
    const { store, index } = await setup({ [INBOX_FILE]: '# Inbox\n' });
    const real = store.write.bind(store);
    store.write = async (p, c, m) => {
      store.external(p, '# Inbox\nsync edit\n');
      return real(p, c, m);
    };
    await expect(addTask(store, index, { text: 'x' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects empty text and strips list and checkbox markup', async () => {
    const { store, index } = await setup();
    await expect(addTask(store, index, { text: '   ' })).rejects.toThrow('Type something');
    expect(cleanTaskText('- [ ] Buy milk\nand eggs')).toBe('Buy milk and eggs');
  });
});
