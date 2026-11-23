/**
 * The change log as the app shows it: by version, newest first, with no dates. The file `CHANGELOG.md` keeps its
 * dates for GitHub; this takes them out of the headings (`## [0.46.0] - 2026-11-22` becomes `## 0.46.0`) and
 * drops the introduction, so the list reads as a history of versions.
 */
/** The notes for one version, as in `CHANGELOG.md` (dates kept), for a GitHub release. Empty if the version is not there. */
export function changelogSection(md: string, version: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  if (end < 0) end = lines.length;
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

export function changelogByVersion(md: string): string {
  const first = md.search(/^## \[/m);
  const body = first < 0 ? md : md.slice(first);
  return body.replace(/^## \[([^\]]+)\](?:[ \t]+-[ \t]+\d{4}-\d{2}-\d{2})?[ \t]*$/gm, '## $1');
}
