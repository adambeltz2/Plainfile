/**
 * Remembers the folder the user picked, so the next visit can offer to reopen it.
 * A FileSystemDirectoryHandle can be stored in IndexedDB. The browser still asks
 * for permission again on a new visit, so this only saves the choosing step.
 * Everything here is best effort: private windows and blocked storage just mean
 * the user picks the folder again.
 */
const DB = 'plainfile';
const STORE = 'handles';
const KEY = 'vault';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function saveHandle(h: FileSystemDirectoryHandle): Promise<void> {
  await run('readwrite', (s) => s.put(h, KEY));
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await run<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))) ?? undefined;
}

export async function forgetHandle(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY));
}

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
};

/** True if we can read and write the folder. Only call with `ask` from a click. */
export async function hasPermission(h: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const p = h as PermissionHandle;
  try {
    if ((await p.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return ask && (await p.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}
