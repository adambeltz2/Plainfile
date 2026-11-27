import type { TrashItem } from '../src/delete';
import type { LineChange } from '../src/diff';
import type { Version } from '../src/history';
import type { EditorHandle } from './editor';

/** Where to put the cursor when a note opens. */
export interface At {
  line?: number;
  offset?: number;
  /** A word to select once the note is open, such as the one a search matched. */
  find?: string;
}

function loadPanes(): { list: boolean; details: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem('plainfile.panes') ?? 'null') as { list?: boolean; details?: boolean } | null;
    return { list: v?.list !== false, details: v?.details !== false };
  } catch {
    return { list: true, details: true };
  }
}

export const notes = {
  path: undefined as string | undefined,
  mtime: 0,
  saved: '',
  handle: undefined as EditorHandle | undefined,
  timer: 0,
  sideTimer: 0,
  saving: false,
  conflict: false,
  missing: false,
  status: '',
  diff: undefined as LineChange | undefined,
  xray: false,
  /** Asking where the folder is on this computer, so a note's full path can be copied. */
  pathPrompt: false,
  /** In focus mode, the side panel that is showing over the note, if any. */
  peek: undefined as undefined | 'list' | 'details',
  yaml: false,
  filter: '',
  pending: {} as At,
  /** The delete confirmation that is showing: move to trash, or the second step for permanent. */
  /** Which side panels show on a wide screen. Remembered in this browser. */
  panes: loadPanes(),
  confirmDelete: undefined as undefined | 'trash' | 'permanent',
  /** A clicked link to a note that does not exist yet, waiting for Create or Cancel. */
  missingLink: undefined as undefined | { path: string; title: string; content: string },
  /** A delete is in progress, so the buttons say so and cannot be pressed twice. */
  deleting: false,
  lastDeleted: undefined as undefined | { title: string; path: string; trashPath?: string },
  trash: [] as TrashItem[],
  trashOpen: false,
  purgeArm: undefined as string | undefined,
  versions: [] as Version[],
  historyOpen: false,
  /** The Contents list in the side panel: open unless folded away. */
  tocOpen: true,
  lastSnapshotAt: undefined as number | undefined,
  compare: undefined as undefined | { path: string; text: string },
  /** Focus mode: the editor alone, centred, with everything else hidden. */
  focus: false,
  wantFocus: false,
  /** How many notes the list shows. A huge folder would otherwise mean thousands of buttons. */
  listLimit: 300,
};

/** The short status next to the note (Saved, Unsaved changes, ...), kept in step with the page. */
export function setStatus(text: string): void {
  notes.status = text;
  const el = document.getElementById('note-status');
  if (el) el.textContent = text;
}
