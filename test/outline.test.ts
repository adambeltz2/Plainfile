import { describe, expect, it } from 'vitest';
import { outline } from '../src/outline';

describe('the outline of a note', () => {
  it('lists the headings with their line and level', () => {
    expect(outline('# Title\n\nText\n## One\n### Deep\n## Two\n')).toEqual([
      { line: 1, level: 1, title: 'Title' },
      { line: 4, level: 2, title: 'One' },
      { line: 5, level: 3, title: 'Deep' },
      { line: 6, level: 2, title: 'Two' },
    ]);
  });
  it('counts lines from the top of the file, frontmatter included', () => {
    expect(outline('---\ntitle: x\n---\n## First\n')).toEqual([{ line: 4, level: 2, title: 'First' }]);
  });
  it('skips code fences, comments and frontmatter', () => {
    const md = '---\n# not a heading\n---\n```\n# code\n```\n<!--\n# hidden\n-->\n# Real\n';
    expect(outline(md).map((h) => h.title)).toEqual(['Real']);
  });
  it('is plain words: marks removed, closing hashes dropped, hashtags and bare # ignored', () => {
    const md = '## **Bold** and [[Note|alias]] and [site](http://x.y) `code` ##\n#tag\n#\n##   \n####### seven\n';
    expect(outline(md).map((h) => h.title)).toEqual(['Bold and alias and site code']);
  });
  it('reads CRLF files', () => {
    expect(outline('# A\r\n## B\r\n').map((h) => h.title)).toEqual(['A', 'B']);
  });
});
