/** Injected at build time by scripts/build.mjs from the sample-vault/ folder. */
declare const __SAMPLE_VAULT__: Record<string, string>;
/** The version in package.json, injected at build time. */
declare const __APP_VERSION__: string;
/** CHANGELOG.md, injected at build time for the What is new screen. */
declare const __CHANGELOG__: string;
/** The Dropbox app key (public by design with PKCE), from the DROPBOX_APP_KEY environment variable at build time. May be empty. */
declare const __DROPBOX_APP_KEY__: string;
/** The OneDrive Application (client) ID (public by design with PKCE), from the ONEDRIVE_CLIENT_ID environment variable at build time. May be empty. */
declare const __ONEDRIVE_CLIENT_ID__: string;

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  /** Test hook: open any FileSystemDirectoryHandle as the vault. */
  __plainfile?: {
    openHandle(h: FileSystemDirectoryHandle, name?: string): Promise<void>;
    /** Test hook: where to load Mermaid from, without the integrity check. */ mermaidUrl?: string;
  };
}
