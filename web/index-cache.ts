import { PARSER_VERSION, type IndexCache } from '../src/index';
import type { Note } from '../src/parse';

/**
 * The saved index in the browser's IndexedDB: parsed notes per folder, so reopening a big folder (or a
 * Dropbox one) reads only what changed. Best effort throughout: if storage is blocked, nothing is saved and
 * everything still works, just without the speed-up.
 */
const DB = 'plainfile-index';
const STORE = 'notes';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const key = (vault: string, path: string): string => `${vault}\u0000${path}`;

export function browserCache(vault: string): IndexCache {
  return {
    async load(): Promise<Note[]> {
      try {
        const db = await open();
        return await new Promise<Note[]>((resolve, reject) => {
          const out: Note[] = [];
          const range = IDBKeyRange.bound(`${vault}\u0000`, `${vault}\u0001`);
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor(range);
          req.onsuccess = () => {
            const c = req.result;
            if (!c) return resolve(out);
            const v = c.value as { parser: number; note: Note };
            if (v.parser === PARSER_VERSION) out.push(v.note);
            c.continue();
          };
          req.onerror = () => reject(req.error);
        });
      } catch {
        return [];
      }
    },
    async put(notes: Note[]): Promise<void> {
      try {
        const db = await open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const s = tx.objectStore(STORE);
          for (const n of notes) s.put({ parser: PARSER_VERSION, note: n }, key(vault, n.path));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        /* the cache is optional */
      }
    },
    async remove(paths: string[]): Promise<void> {
      try {
        const db = await open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          for (const p of paths) tx.objectStore(STORE).delete(key(vault, p));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        /* the cache is optional */
      }
    },
  };
}
