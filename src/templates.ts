import { parse as parseYaml } from 'yaml';
import type { VaultIndex } from './index';
import { listProjects } from './projects';
import { ExistsError, type VaultStorage } from './storage';

/**
 * Templates are markdown files. The frontmatter's `plainfile:` block holds the
 * template's own settings and is removed from the file it creates:
 *
 *   ---
 *   plainfile:
 *     name: Meeting
 *     folder: projects/{{project}}
 *     filename: "{{date}} {{title}}"
 *   title: {{title}}
 *   type: meeting
 *   ---
 *   ## Agenda
 *   - {{cursor}}
 *
 * Variables: {{date}}, {{date+7d}}, {{cursor}} and any {{name}}, which becomes a prompt.
 */
export const TEMPLATE_DIR = '.plainfile/templates';

export interface TemplatePrompt {
  id: string;
  label: string;
  default: string;
}

export interface Template {
  name: string;
  description: string;
  folder: string;
  filename: string;
  prompts: TemplatePrompt[];
  /** Frontmatter lines for the new file, without the --- fences. May be empty. */
  fm: string;
  body: string;
  /** "built-in" or the path of the template file. */
  source: string;
  /** Not shown in the New menu. Used from a project's own buttons. */
  hidden?: boolean;
}

export const BUILT_IN: Template[] = [
  {
    name: 'Note',
    description: 'A blank note with a title.',
    folder: 'inbox',
    filename: '{{title}}',
    prompts: [{ id: 'title', label: 'Title', default: '' }],
    fm: 'title: {{title}}',
    body: '\n{{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Task',
    description: 'One file per task, with status and due date. Shows up in Today.',
    folder: 'tasks',
    filename: '{{title}}',
    prompts: [
      { id: 'title', label: 'Title', default: '' },
      { id: 'due', label: 'Due', default: '{{date+7d}}' },
    ],
    fm: 'title: {{title}}\nstatus: todo\ndue: {{due}}\ncreated: {{date}}\ntags: []\npeople: []',
    body: '\n{{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Project',
    description: 'A project folder with an index note. Tasks and notes can then be filed into it.',
    folder: 'projects/{{title|slug}}',
    filename: 'index',
    prompts: [
      { id: 'title', label: 'Project name', default: '' },
      { id: 'goal', label: 'Goal (optional)', default: '' },
    ],
    fm: 'title: {{title}}\ntype: project\nactive: true\nsortOrder: {{sortOrder}}\ncreated: {{date}}\ntags: []',
    body: '\n## Goal\n{{goal}}\n\n## Notes\n- \n\n## Tasks\n- [ ] {{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Project task',
    description: 'A task file inside a project.',
    hidden: true,
    folder: '{{projectDir}}/tasks',
    filename: '{{title}}',
    prompts: [
      { id: 'title', label: 'Title', default: '' },
      { id: 'due', label: 'Due', default: '{{date+7d}}' },
    ],
    fm: 'title: {{title}}\nstatus: todo\ndue: {{due}}\ncreated: {{date}}\nproject: {{projectName}}\ntags: []\npeople: []',
    body: '\n{{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Project note',
    description: 'A note inside a project.',
    hidden: true,
    folder: '{{projectDir}}',
    filename: '{{title}}',
    prompts: [{ id: 'title', label: 'Title', default: '' }],
    fm: 'title: {{title}}\ncreated: {{date}}\nproject: {{projectName}}\ntags: []',
    body: '\n{{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Meeting',
    description: 'Agenda, decisions and action items.',
    folder: 'meetings',
    filename: '{{date}} {{title}}',
    prompts: [
      { id: 'title', label: 'Title', default: 'Weekly sync' },
      { id: 'attendees', label: 'Attendees', default: '' },
    ],
    fm: 'title: {{title}}\ntype: meeting\ndate: {{date}}\nattendees: [{{attendees}}]\ntags: [meeting]',
    body: '\n## Agenda\n- \n\n## Decisions\n\n## Action items\n- [ ] {{cursor}}\n',
    source: 'built-in',
  },
  {
    name: 'Daily journal',
    description: 'Tasks, notes and an end-of-day check.',
    folder: 'journal',
    filename: '{{date}}',
    prompts: [],
    fm: 'title: {{date}}\ntype: journal\ndate: {{date}}',
    body: '\n## Tasks\n- [ ] {{cursor}}\n\n## Notes\n\n## End of day\n',
    source: 'built-in',
  },
  {
    name: 'Person',
    description: 'Contact notes. Link to it from other notes with [[name]].',
    folder: 'people',
    filename: '{{title}}',
    prompts: [
      { id: 'title', label: 'Name', default: '' },
      { id: 'company', label: 'Company', default: '' },
    ],
    fm: 'title: {{title}}\ntype: person\ncompany: {{company}}\ntags: [people]',
    body: '\n## Contact\n- Email: \n\n## Notes\n{{cursor}}\n',
    source: 'built-in',
  },
];

const VAR = /\{\{\s*(\w+)(?:\+(\d+)d)?(?:\|(\w+))?\s*\}\}/g;
const BUILT_IN_VARS = new Set(['date', 'cursor', 'sortOrder', 'projectDir', 'projectName']);

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Kitchen Remodel" becomes "kitchen-remodel". */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Values the app fills in itself, which a template can use without asking: {{sortOrder}} is the next project number. */
const extrasCache = new WeakMap<VaultIndex, { version: number; extras: Record<string, string> }>();
export function templateExtras(index: VaultIndex): Record<string, string> {
  const hit = extrasCache.get(index);
  if (hit?.version === index.version) return hit.extras;
  const orders = listProjects(index).map((p) => p.sortOrder ?? 0);
  const extras = { sortOrder: String((orders.length ? Math.max(...orders) : 0) + 1) };
  extrasCache.set(index, { version: index.version, extras });
  return extras;
}

/** Replace {{date}}, {{date+Nd}} and prompt values. {{cursor}} is left for the caller. */
function expand(s: string, values: Record<string, string>, today: string): string {
  return s.replace(VAR, (m, name: string, plus?: string, mod?: string) => {
    if (name === 'date') return plus ? addDays(today, Number(plus)) : today;
    if (name === 'cursor') return m;
    const v = values[name] ?? '';
    return mod === 'slug' ? slug(v) : v;
  });
}

/** The prompt default, with date variables already worked out. */
export function promptDefault(p: TemplatePrompt, today: string): string {
  return expand(p.default, {}, today);
}

/** Read a template file. Returns null if it has no `plainfile:` settings. */
export function parseTemplateFile(path: string, text: string): Template | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  let settings: Record<string, unknown> | undefined;
  try {
    const parsed = parseYaml(lines.slice(1, end).join('\n')) as Record<string, unknown> | null;
    settings = parsed?.plainfile as Record<string, unknown> | undefined;
  } catch {
    return null;
  }
  if (!settings || typeof settings !== 'object') return null;

  const fmLines: string[] = [];
  let skipping = false;
  for (const l of lines.slice(1, end)) {
    if (/^plainfile\s*:/.test(l)) {
      skipping = true;
      continue;
    }
    if (skipping && (/^\s/.test(l) || l === '')) continue;
    skipping = false;
    fmLines.push(l);
  }
  const fm = fmLines.join('\n').replace(/\s+$/, '');
  const body = lines.slice(end + 1).join('\n');
  const name = String(settings.name ?? path.split('/').pop()?.replace(/\.md$/i, '') ?? 'Template');
  const folder = String(settings.folder ?? 'inbox');
  const filename = String(settings.filename ?? '{{title}}');

  const declared = Array.isArray(settings.prompts) ? settings.prompts : undefined;
  let prompts: TemplatePrompt[];
  if (declared) {
    prompts = declared.map((p) =>
      typeof p === 'string'
        ? { id: p, label: p.charAt(0).toUpperCase() + p.slice(1), default: '' }
        : {
            id: String((p as Record<string, unknown>).id),
            label: String((p as Record<string, unknown>).label ?? (p as Record<string, unknown>).id),
            default: String((p as Record<string, unknown>).default ?? ''),
          },
    );
  } else {
    const ids: string[] = [];
    for (const m of `${folder}\n${filename}\n${fm}\n${body}`.matchAll(VAR)) {
      const id = m[1] as string;
      if (!BUILT_IN_VARS.has(id) && !ids.includes(id)) ids.push(id);
    }
    prompts = ids.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), default: '' }));
  }
  return {
    name,
    description: String(settings.description ?? ''),
    folder,
    filename,
    prompts,
    fm,
    body,
    source: path,
  };
}

/** Built-in templates, with any template files in `.plainfile/templates/` added or replacing a built-in of the same name. */
export async function loadTemplates(storage: VaultStorage): Promise<Template[]> {
  const found: Template[] = [];
  for (const f of await storage.listDir(TEMPLATE_DIR)) {
    if (!/\.md$/i.test(f.path)) continue;
    const t = parseTemplateFile(f.path, await storage.read(f.path));
    if (t) found.push(t);
  }
  const names = new Set(found.map((t) => t.name.toLowerCase()));
  return [...BUILT_IN.filter((t) => !names.has(t.name.toLowerCase())), ...found];
}

export interface Rendered {
  path: string;
  content: string;
  /** Character offset where the cursor should start, if the template has {{cursor}}. */
  cursor?: number;
}

function clean(name: string): string {
  return name.replace(/[\\/:?*"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/** What a template would create, without writing anything. Used for the live preview. */
export function renderTemplate(t: Template, values: Record<string, string>, today: string): Rendered {
  const folder = expand(t.folder, values, today).replace(/^\/+|\/+$/g, '');
  const name = clean(expand(t.filename, values, today)) || 'untitled';
  const fm = expand(t.fm, values, today);
  const raw = (fm.trim() ? `---\n${fm}\n---\n` : '') + expand(t.body, values, today);
  const at = raw.indexOf('{{cursor}}');
  const content = raw.replace(/\{\{cursor\}\}/g, '');
  return { path: `${folder ? `${folder}/` : ''}${name}.md`, content, cursor: at >= 0 ? at : undefined };
}

/** Create the file. If the name is taken, " 2", " 3" and so on are added. Nothing is ever overwritten. */
export async function createFromTemplate(
  storage: VaultStorage,
  index: VaultIndex,
  t: Template,
  values: Record<string, string>,
  today: string,
): Promise<Rendered> {
  const r = renderTemplate(t, { ...templateExtras(index), ...values }, today);
  const base = r.path.replace(/\.md$/i, '');
  for (let n = 1; n < 1000; n++) {
    const path = n === 1 ? r.path : `${base} ${n}.md`;
    try {
      await storage.create(path, r.content);
      await index.refreshFile(path);
      return { ...r, path };
    } catch (e) {
      if (!(e instanceof ExistsError)) throw e;
    }
  }
  throw new Error(`Could not find a free file name for ${r.path}`);
}
