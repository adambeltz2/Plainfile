/** Injected at build time by scripts/build.mjs from the sample-vault/ folder. */
declare const __SAMPLE_VAULT__: Record<string, string>;
/** The version in package.json, injected at build time. */
declare const __APP_VERSION__: string;

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  /** Test hook: open any FileSystemDirectoryHandle as the vault. */
  __plainfile?: { openHandle(h: FileSystemDirectoryHandle, name?: string): Promise<void> };
}
