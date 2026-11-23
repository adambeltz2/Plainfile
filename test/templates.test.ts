import { describe, expect, it } from 'vitest';
import { INBOX_FILE, addTask, addTaskNote, cleanTaskText, taskFileName } from '../src/capture';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';
import { ConflictError } from '../src/storage';
import {
  BUILT_IN,
  clock,
  createFromTemplate,
  freePath,
  numberTitle,
  loadTemplates,
  parseTemplateFile,
  promptDefault,
  renderTemplate,
  slug,
  templateExtras,
} from '../src/templates';

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
    const r = renderTemplate(byName('Meeting'), { title: 'Kickoff', attendees: 'dana, sam', project: 'site' }, TODAY);
    expect(r.path).toBe('meetings/2026-11-21 Kickoff.md');
    expect(r.content).toContain('title: Kickoff\ntype: meeting\ndate: 2026-11-21\nproject: site\npeople: [dana, sam]\ntags: [meeting]');
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
    expect(all.map((t) => t.name)).toEqual([
      'Note',
      'Task',
      'Project',
      'Project task',
      'Project note',
      'Quick note',
      'Daily journal',
      'Person',
      'Weekly review',
      'Meeting',
    ]);
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

describe('task files', () => {
  it('start with a created date and empty tags and people to fill in', async () => {
    const { store, index } = await setup();
    const r = await createFromTemplate(store, index, byName('Task'), { title: 'Write launch email', due: '2026-11-24' }, TODAY);
    expect(r.content).toBe('---\ntitle: Write launch email\nstatus: todo\ndue: 2026-11-24\ncreated: 2026-11-21\ntags: []\npeople: []\n---\n\n\n');
    expect(index.tasks()[0]).toMatchObject({ title: 'Write launch email', created: '2026-11-21', who: [] });
  });

  it('read people from the frontmatter as @names, like an inline task', async () => {
    const { index } = await setup({ 'tasks/a.md': '---\nstatus: todo\npeople: [Dana, "Sam Lee"]\ncreated: 2026-11-20\n---\n' });
    expect(index.tasks()[0]).toMatchObject({ who: ['@dana', '@sam-lee'], created: '2026-11-20' });
  });
});

describe('projects', () => {
  it('slug makes folder-friendly names', () => {
    expect(slug('Kitchen Remodel!')).toBe('kitchen-remodel');
    expect(slug('  Café & Bar 2026 ')).toBe('café-bar-2026');
  });

  it('a new project is a folder with an index note numbered after the last one', async () => {
    const { store, index } = await setup({ 'projects/a/index.md': '---\ntype: project\nactive: true\nsortOrder: 4\n---\n' });
    expect(templateExtras(index)).toEqual({ sortOrder: '5' });
    const r = await createFromTemplate(store, index, byName('Project'), { title: 'Kitchen Remodel', goal: 'New cabinets' }, TODAY);
    expect(r.path).toBe('projects/kitchen-remodel/index.md');
    expect(r.content).toBe(
      '---\ntitle: Kitchen Remodel\ntype: project\nactive: true\nsortOrder: 5\ncreated: 2026-11-21\ntags: []\n---\n\n## Goal\nNew cabinets\n\n## Notes\n- \n\n## Tasks\n- [ ] \n',
    );
  });

  it('the first project is number 1', async () => {
    const { index } = await setup();
    expect(templateExtras(index)).toEqual({ sortOrder: '1' });
  });

  it('project tasks and notes are filed inside the project and say which project they belong to', async () => {
    const { store, index } = await setup();
    const vals = { projectDir: 'projects/kitchen-remodel', projectName: 'kitchen-remodel' };
    const task = await createFromTemplate(store, index, byName('Project task'), { ...vals, title: 'Order cabinets', due: '2026-11-28' }, TODAY);
    expect(task.path).toBe('projects/kitchen-remodel/tasks/Order cabinets.md');
    expect(task.content).toContain('project: kitchen-remodel\ntags: []\npeople: []');
    const note = await createFromTemplate(store, index, byName('Project note'), { ...vals, title: 'Quote from Dana' }, TODAY);
    expect(note.path).toBe('projects/kitchen-remodel/Quote from Dana.md');
    expect(note.content).toContain('created: 2026-11-21\nproject: kitchen-remodel');
    // A project at the top level files into tasks/ with no leading slash.
    expect(renderTemplate(byName('Project task'), { projectDir: '', projectName: 'x', title: 'T', due: '' }, TODAY).path).toBe('tasks/T.md');
  });
});

describe('quick add details', () => {
  it('writes the created date, and tags and people if given, without repeating ones already typed', async () => {
    const { store, index } = await setup();
    const r = await addTask(store, index, {
      text: 'Call Dana @dana',
      due: '2026-11-24',
      created: TODAY,
      tags: ['#launch', 'home'],
      people: ['@dana', 'Sam Lee'],
    });
    expect(r.after).toBe('- [ ] Call Dana @dana @Sam-Lee #launch #home due:2026-11-24 created:2026-11-21');
    expect(index.tasks()[0]).toMatchObject({
      title: 'Call Dana',
      due: '2026-11-24',
      created: '2026-11-21',
      who: ['@dana', '@sam-lee'],
      tags: ['launch', 'home'],
    });
  });

  it('leaves out anything not given', async () => {
    const { store, index } = await setup();
    expect((await addTask(store, index, { text: 'Plain', created: TODAY })).after).toBe('- [ ] Plain created:2026-11-21');
  });
});

describe('addTaskNote', () => {
  async function setup(files: Record<string, string> = {}) {
    const store = new MemoryStorage(files);
    const index = new VaultIndex(store);
    await index.scan();
    return { store, index };
  }

  it('makes the task its own note with status, dates, people and tags, and indexes it as a task', async () => {
    const { store, index } = await setup();
    const r = await addTaskNote(store, index, { title: 'Call Dana', due: '2026-11-24', created: '2026-11-21', tags: ['#launch'], people: ['@dana', 'sam'] });
    expect(r.path).toBe('tasks/Call Dana.md');
    expect(await store.read(r.path)).toBe(
      '---\ntitle: Call Dana\nstatus: todo\ndue: 2026-11-24\ncreated: 2026-11-21\ntags: [launch]\npeople: [dana, sam]\n---\n\n',
    );
    const t = index.getTask(r.taskId)!;
    expect(t).toMatchObject({ kind: 'file', title: 'Call Dana', due: '2026-11-24', done: false, status: 'todo' });
    expect(t.who).toEqual(expect.arrayContaining(['@dana']));
  });

  it('files a project task in the project folder with project:, leaves out an empty due, and never overwrites', async () => {
    const { store, index } = await setup();
    const input = { title: 'Order: cabinets?', created: '2026-11-21', project: { name: 'kitchen-remodel', dir: 'projects/kitchen-remodel' } };
    const a = await addTaskNote(store, index, input);
    const b = await addTaskNote(store, index, input);
    expect([a.path, b.path]).toEqual(['projects/kitchen-remodel/tasks/Order- cabinets.md', 'projects/kitchen-remodel/tasks/Order- cabinets 2.md']);
    expect(await store.read(a.path)).toBe(
      '---\ntitle: "Order: cabinets?"\nstatus: todo\ncreated: 2026-11-21\nproject: kitchen-remodel\ntags: []\npeople: []\n---\n\n',
    );
    expect(index.getTask(a.taskId)?.title).toBe('Order: cabinets?');
  });

  it('needs a title, and file names are made safe', async () => {
    const { store, index } = await setup();
    await expect(addTaskNote(store, index, { title: '   ', created: '2026-11-21' })).rejects.toThrow('Type something');
    expect(taskFileName('a/b:c*d?')).toBe('a-b-c-d');
    expect(taskFileName('...')).toBe('Task');
    expect(taskFileName('x'.repeat(200))).toHaveLength(80);
  });
});

describe('Quick note', () => {
  it('is titled with the date and time, has a ready header, and puts the cursor in the body', () => {
    const t = BUILT_IN.find((x) => x.name === 'Quick note')!;
    expect(t.prompts).toEqual([]);
    const r = renderTemplate(t, { time: '14:35', timefile: '1435' }, '2026-11-21');
    expect(r.path).toBe('inbox/2026-11-21 1435.md');
    expect(r.content).toBe('---\ntitle: "2026-11-21 14:35"\ncreated: 2026-11-21\nproject:\ntags: []\npeople: []\n---\n\n\n');
    expect(r.cursor).toBe(r.content.length - 1);
    expect(clock(new Date(2026, 10, 21, 9, 5))).toBe('09:05');
    expect(clock(new Date(2026, 10, 21, 9, 5), true)).toBe('0905');
  });
  it('uses the real time when none is given, and never overwrites a note made in the same minute', async () => {
    const t = BUILT_IN.find((x) => x.name === 'Quick note')!;
    const store = new MemoryStorage({});
    const index = new VaultIndex(store);
    const a = await createFromTemplate(store, index, t, { time: '10:00', timefile: '1000' }, '2026-11-21');
    const b = await createFromTemplate(store, index, t, { time: '10:00', timefile: '1000' }, '2026-11-21');
    expect([a.path, b.path]).toEqual(['inbox/2026-11-21 1000.md', 'inbox/2026-11-21 1000 2.md']);
    expect(renderTemplate(t, {}, '2026-11-21').content).toMatch(/title: "2026-11-21 \d\d:\d\d"/);
  });
});

describe('the same title twice', () => {
  it('numberTitle adds the number to the title and keeps the cursor on the same spot', () => {
    const c = '---\ntitle: Gift Shopping\ncreated: 2026-11-21\n---\n\nbody\n';
    const r = numberTitle(c, c.indexOf('body'), 2);
    expect(r.content).toBe('---\ntitle: "Gift Shopping 2"\ncreated: 2026-11-21\n---\n\nbody\n');
    expect(r.content.slice(r.cursor)).toBe('body\n');
    expect(numberTitle('no frontmatter', 3, 2)).toEqual({ content: 'no frontmatter', cursor: 3 });
    expect(numberTitle('---\ncreated: x\n---\nb', undefined, 2).content).toBe('---\ncreated: x\n---\nb');
  });

  it('a second note with the same name is saved beside the first with the number in its file name and title', async () => {
    const t = BUILT_IN.find((x) => x.name === 'Note')!;
    const store = new MemoryStorage({});
    const index = new VaultIndex(store);
    const a = await createFromTemplate(store, index, t, { title: 'Gift Shopping' }, '2026-11-21');
    const b = await createFromTemplate(store, index, t, { title: 'Gift Shopping' }, '2026-11-21');
    expect([a.path, b.path]).toEqual(['inbox/Gift Shopping.md', 'inbox/Gift Shopping 2.md']);
    expect(await store.read(a.path)).toContain('title: Gift Shopping\n');
    expect(await store.read(b.path)).toContain('title: "Gift Shopping 2"\n');
    expect(index.notes.get(b.path)?.title).toBe('Gift Shopping 2');
  });

  it('freePath says what a new note would really be called', () => {
    expect(freePath(new Set(['inbox/a.md', 'inbox/A 2.md']), 'inbox/a.md')).toEqual({ path: 'inbox/a 3.md', taken: true });
    expect(freePath(new Set(), 'inbox/a.md')).toEqual({ path: 'inbox/a.md', taken: false });
  });

  it('a second task note with the same title is numbered in its title as well', async () => {
    const store = new MemoryStorage({});
    const index = new VaultIndex(store);
    const a = await addTaskNote(store, index, { title: 'Call Dana', created: '2026-11-21' });
    const b = await addTaskNote(store, index, { title: 'Call Dana', created: '2026-11-21' });
    expect(index.getTask(a.taskId)?.title).toBe('Call Dana');
    expect(index.getTask(b.taskId)?.title).toBe('Call Dana 2');
  });
});
