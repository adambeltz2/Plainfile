// Prints the CHANGELOG.md notes for the version in package.json, for a GitHub release.
import { readFileSync } from 'node:fs';
import { changelogSection } from '../src/changelog';

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const notes = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (!notes) {
  console.error(`CHANGELOG.md has no entry for ${version}`);
  process.exit(1);
}
console.log(`${notes}\n\nSee the [full change log](https://github.com/adambeltz2/Simple-Productivity/blob/main/CHANGELOG.md).`);
