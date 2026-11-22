import { changelogByVersion } from '../src/changelog';
import { toHtml } from '../src/render';

const REPO = 'https://github.com/adambeltz2/Simple-Productivity';

/** What is new: every version, newest first, without dates. The full file with dates is on GitHub. */
export function html(): string {
  return (
    '<div class="home changelog"><h2 class="title">What is new</h2>' +
    `<p class="meta">Plainfile v${__APP_VERSION__}. Changes by version. <a href="${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">Full change log on GitHub</a></p>` +
    '<p class="small muted">Inspired by <a href="https://silverbullet.md/" target="_blank" rel="noopener noreferrer">SilverBullet</a> and <a href="https://obsidian.md/" target="_blank" rel="noopener noreferrer">Obsidian</a>, with a different approach: plain files, tasks and projects as first-class views, nothing to install.</p>' +
    `<div class="prose">${toHtml(changelogByVersion(__CHANGELOG__))}</div></div>`
  );
}
