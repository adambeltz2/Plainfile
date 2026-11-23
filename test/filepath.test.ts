import { describe, expect, it } from 'vitest';
import { dropboxPath, fullPath } from '../src/filepath';

describe('fullPath', () => {
  it('joins a Windows folder with backslashes, however the folder was typed', () => {
    expect(fullPath('C:\\Users\\Adam\\Notes', 'projects/site/Plan.md')).toBe('C:\\Users\\Adam\\Notes\\projects\\site\\Plan.md');
    expect(fullPath('C:\\Users\\Adam\\Notes\\', 'a.md')).toBe('C:\\Users\\Adam\\Notes\\a.md');
    expect(fullPath('C:/Users/Adam/Notes', 'a/b.md')).toBe('C:\\Users\\Adam\\Notes\\a\\b.md');
    expect(fullPath('\\\\server\\share\\notes', 'a.md')).toBe('\\\\server\\share\\notes\\a.md');
  });
  it('joins a Mac or Linux folder with slashes', () => {
    expect(fullPath('/Users/adam/Notes', 'projects/site/Plan.md')).toBe('/Users/adam/Notes/projects/site/Plan.md');
    expect(fullPath('/home/adam/My Notes/', 'a.md')).toBe('/home/adam/My Notes/a.md');
    expect(fullPath('~/Notes', 'a.md')).toBe('~/Notes/a.md');
  });
});

describe('dropboxPath', () => {
  it('is the folder that was opened plus the note path, from the Dropbox root', () => {
    expect(dropboxPath('/Notes', 'a/b.md')).toBe('/Notes/a/b.md');
    expect(dropboxPath('Work/Notes/', 'a.md')).toBe('/Work/Notes/a.md');
    expect(dropboxPath('', 'a.md')).toBe('/a.md');
  });
});
