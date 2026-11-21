import { parseNote, type InlineTask, type LinkRef, type Note } from './parse';
import { mapPool, throwIfAborted } from './pool';
import { isMarkdown, type FileEntry, type ListProgress, type VaultStorage } from './storage';

/** One row in a task list, whether it came from a checkbox line or from a task file. */
export interface TaskItem {
  /** "path:line". For file tasks the line is the `status:` line. */
  id: string;
  kind: 'inline' | 'file';
  path: string;
  line: number;
  title: string;
  done: boolean;
  due?: string;
  /** When the task was added, if it says so. */
  created?: string;
  who: string[];
  tags: string[];
  status?: string;
}

export interface Resolution {
  path?: string;
  ambiguous?: string[];
}

/** What a scan is doing, for a progress bar. */
export type ScanProgress =
  | ({ phase: 'listing' } & ListProgress)
  | { phase: 'reading'; done: number; total: number };

export interface ScanOptions {
  onProgress?: (p: ScanProgress) => void;
  /** Cancel a scan. The index may be left partly updated, so discard it (a first load does). */
  signal?: AbortSignal;
}

export interface ScanResult {
  added: string[];
  changed: string[];
  removed: string[];
  /** Files that vanished while an identical file appeared. Detected by content hash. */
  renamed: { from: string; to: string }[];
  unchanged: number;
  ms: number;
}

/** A file left out of the index because it could not be read. The rest of the folder still opens. */
export interface SkippedFile {
  path: string;
  reason: string;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function joinPath(dir: string, rel: string): string {
  const parts = rel.startsWith('/') || !dir ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/**
 * The index is a cache. It is rebuilt from the files, never the other way round,
 * so it is always safe to throw away.
 */
export class VaultIndex {
  /** Increases every time the index changes, so derived results can be cached. */
  version = 0;
  notes = new Map<string, Note>();
  /** Every visible file, including attachments. */
  files = new Set<string>();

  private byName = new Map<string, string[]>();
  private byTitle = new Map<string, string[]>();
  private byAlias = new Map<string, string[]>();
  private pathsLower = new Map<string, string>();
  private backlinkMap = new Map<string, { from: string; line: number }[]>();

  constructor(private storage: VaultStorage) {}

  /** Files and folders that could not be read, from the latest scan. Skipped, never fatal. */
  get skipped(): SkippedFile[] {
    return [...this.listSkipped, ...[...this.readSkipped].map(([path, reason]) => ({ path, reason }))].sort((a, b) => a.path.localeCompare(b.path));
  }
  private listSkipped: SkippedFile[] = [];
  private readSkipped = new Map<string, string>();

  async scan(opts: ScanOptions = {}): Promise<ScanResult> {
    const t0 = Date.now();
    const { onProgress, signal } = opts;
    const listSkipped: SkippedFile[] = [];
    const entries = await this.storage.list({
      signal,
      onProgress: (p) => onProgress?.({ phase: 'listing', ...p }),
      onSkip: (path, reason) => listSkipped.push({ path, reason }),
    });
    this.listSkipped = listSkipped;
    throwIfAborted(signal);
    this.files = new Set(entries.map((e) => e.path));
    for (const p of [...this.readSkipped.keys()]) if (!this.files.has(p)) this.readSkipped.delete(p);

    const removedNotes: Note[] = [];
    for (const [p, n] of [...this.notes]) {
      if (!this.files.has(p)) {
        removedNotes.push(n);
        this.notes.delete(p);
      }
    }

    const todo: FileEntry[] = [];
    let unchanged = 0;
    for (const e of entries) {
      if (!isMarkdown(e.path)) continue;
      const cur = this.notes.get(e.path);
      if (cur && cur.mtime === e.mtime && cur.size === e.size) unchanged++;
      else todo.push(e);
    }

    const added: string[] = [];
    const changed: string[] = [];
    let done = 0;
    let last = 0;
    onProgress?.({ phase: 'reading', done, total: todo.length });
    await mapPool(
      todo,
      16,
      async (e) => {
        try {
          const text = await this.storage.read(e.path);
          (this.notes.has(e.path) ? changed : added).push(e.path);
          this.notes.set(e.path, parseNote(e.path, text, e));
          this.readSkipped.delete(e.path);
        } catch (err) {
          // A file we cannot read is left out (and listed), so one bad file never blocks the folder.
          if (err instanceof Error && err.name === 'AbortError') throw err;
          this.readSkipped.set(e.path, err instanceof Error ? err.message : String(err));
          this.notes.delete(e.path);
        }
        done++;
        const now = Date.now();
        if (onProgress && (done === todo.length || now - last > 80)) {
          last = now;
          onProgress({ phase: 'reading', done, total: todo.length });
        }
      },
      signal,
    );

    const renamed: ScanResult['renamed'] = [];
    const gone = [...removedNotes];
    for (const to of added) {
      const hash = this.notes.get(to)?.hash;
      const k = gone.findIndex((r) => r.hash === hash);
      if (k >= 0) renamed.push({ from: gone.splice(k, 1)[0]!.path, to });
    }

    this.rebuild();
    return {
      added: added.sort(),
      changed: changed.sort(),
      removed: removedNotes.map((n) => n.path).sort(),
      renamed,
      unchanged,
      ms: Date.now() - t0,
    };
  }

  /** Re-read one file after we wrote to it. */
  async refreshFile(path: string): Promise<void> {
    const e = await this.storage.stat(path);
    const text = await this.storage.read(path);
    this.notes.set(path, parseNote(path, text, e));
    this.files.add(path);
    this.rebuild();
  }

  private rebuild(): void {
    this.version++;
    this.byName.clear();
    this.byTitle.clear();
    this.byAlias.clear();
    this.pathsLower.clear();
    this.backlinkMap.clear();
    for (const n of this.notes.values()) {
      push(this.byName, n.name.toLowerCase(), n.path);
      push(this.byTitle, n.title.toLowerCase(), n.path);
      for (const a of n.aliases) push(this.byAlias, a.toLowerCase(), n.path);
    }
    for (const p of this.files) this.pathsLower.set(p.toLowerCase(), p);
    for (const n of this.notes.values()) {
      for (const l of n.links) {
        const r = this.resolveLink(n, l);
        if (r.path && r.path !== n.path) push(this.backlinkMap, r.path, { from: n.path, line: l.line });
      }
    }
  }

  resolveLink(source: Note, link: LinkRef): Resolution {
    if (link.kind === 'md') {
      const p = joinPath(dirname(source.path), link.target);
      const hit = this.notes.has(p) ? p : this.pathsLower.get(p.toLowerCase());
      return hit && this.notes.has(hit) ? { path: hit } : {};
    }
    const t = link.target.trim().replace(/\.md$/i, '').replace(/^\/+/, '');
    const key = t.toLowerCase();
    let cands: string[];
    if (key.includes('/')) {
      cands = [...this.notes.keys()].filter((p) => {
        const q = p.replace(/\.md$/i, '').toLowerCase();
        return q === key || q.endsWith('/' + key);
      });
    } else {
      cands = [...new Set([...(this.byName.get(key) ?? []), ...(this.byTitle.get(key) ?? []), ...(this.byAlias.get(key) ?? [])])];
    }
    if (cands.length <= 1) return cands[0] ? { path: cands[0] } : {};
    const same = cands.filter((p) => dirname(p) === dirname(source.path));
    if (same.length === 1) return { path: same[0] };
    return { ambiguous: cands.sort() };
  }

  /** Resolve an image or file reference to a real file, or undefined if it is missing. */
  resolveEmbed(source: Note, target: string): string | undefined {
    const rel = joinPath(dirname(source.path), target);
    if (this.files.has(rel)) return rel;
    const ci = this.pathsLower.get(rel.toLowerCase());
    if (ci) return ci;
    if (!target.includes('/')) {
      const lower = target.toLowerCase();
      for (const f of this.files) if (f.toLowerCase().endsWith('/' + lower) || f.toLowerCase() === lower) return f;
    }
    return undefined;
  }

  /** Back-links are never stored. They are worked out from the links currently in the files. */
  backlinks(path: string): { from: string; line: number }[] {
    return this.backlinkMap.get(path) ?? [];
  }

  tasks(): TaskItem[] {
    const out: TaskItem[] = [];
    for (const n of this.notes.values()) {
      for (const t of n.tasks) out.push(inlineItem(n, t));
      if (n.fileTask) {
        const f = n.fileTask;
        out.push({
          id: `${n.path}:${f.statusLine}`,
          kind: 'file',
          path: n.path,
          line: f.statusLine,
          title: n.title,
          done: f.done,
          due: f.due,
          created: f.created,
          who: peopleOf(n.frontmatter.people),
          tags: n.tags,
          status: f.status,
        });
      }
    }
    return out;
  }

  getTask(id: string): TaskItem | undefined {
    return this.tasks().find((t) => t.id === id);
  }
}

/** `people: [Dana, sam]` in a task file's frontmatter, as the `@dana` names an inline task uses. */
function peopleOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : [];
  return list.map((x) => String(x).trim().replace(/^@/, '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean).map((x) => `@${x}`);
}

function inlineItem(n: Note, t: InlineTask): TaskItem {
  return {
    id: `${n.path}:${t.line}`,
    kind: 'inline',
    path: n.path,
    line: t.line,
    title: t.title,
    done: t.state === 'x',
    due: t.due,
    created: t.created,
    who: t.who,
    tags: t.tags,
  };
}
