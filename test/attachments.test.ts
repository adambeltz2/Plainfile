import { describe, expect, it } from 'vitest';
import { ATTACHMENTS_DIR, isDiagram, mimeFor, pastedName, safeName, saveImage } from '../src/attachments';
import { VaultIndex } from '../src/index';
import { MemoryStorage } from '../src/memory-storage';

const NOW = new Date(2026, 10, 21, 14, 35, 12);

describe('isDiagram', () => {
  it('recognises a draw.io picture by its name', () => {
    for (const ok of ['flow.drawio.svg', 'a/b/Flow.DRAWIO.PNG', 'x.drawio.svg#page', 'my%20flow.drawio.svg?v=2']) expect(isDiagram(ok), ok).toBe(true);
    for (const no of ['flow.svg', 'flow.drawio', 'drawio.svg', 'flow.drawio.svg.bak', 'photo.png']) expect(isDiagram(no), no).toBe(false);
  });
});

describe('attachments', () => {
  it('names a pasted image from the time, with no spaces or colons', () => {
    expect(pastedName('image/png', NOW)).toBe('pasted-2026-11-21-143512.png');
    expect(pastedName('image/jpeg', NOW)).toBe('pasted-2026-11-21-143512.jpg');
    expect(pastedName('application/x-weird', NOW)).toBe('pasted-2026-11-21-143512.png');
  });
  it("keeps a dropped file's own name when it has one worth keeping", () => {
    expect(safeName('My Screenshot (3).PNG')).toBe('My-Screenshot-3.PNG');
    expect(safeName('image.png')).toBe('');
    expect(safeName('')).toBe('');
    expect(mimeFor('a/b/pic.JPG')).toBe('image/jpeg');
    expect(mimeFor('x.unknown')).toBe('application/octet-stream');
  });
  it('saves into _attachments and gives a link relative to the note, without overwriting', async () => {
    const store = new MemoryStorage({ 'projects/site/Note.md': 'x', 'Top.md': 'y' });
    const index = new VaultIndex(store);
    await index.scan();
    const bytes = new Uint8Array([1, 2, 3]);
    const a = await saveImage(store, index, 'projects/site/Note.md', bytes, 'image/png', NOW);
    expect(a).toEqual({ path: `${ATTACHMENTS_DIR}/pasted-2026-11-21-143512.png`, markdown: '![](../../_attachments/pasted-2026-11-21-143512.png)' });
    const b = await saveImage(store, index, 'Top.md', new Uint8Array([9]), 'image/png', NOW);
    expect(b).toEqual({ path: `${ATTACHMENTS_DIR}/pasted-2026-11-21-143512-2.png`, markdown: '![](_attachments/pasted-2026-11-21-143512-2.png)' });
    expect([...(await store.readBinary(a.path))]).toEqual([1, 2, 3]);
    expect(index.files.has(a.path)).toBe(true);
    expect(index.notes.has(a.path)).toBe(false); // an image is a file, not a note
  });
  it('the saved image counts as used once a note links to it, and resolves from that note', async () => {
    const store = new MemoryStorage({ 'a/n.md': 'text' });
    const index = new VaultIndex(store);
    await index.scan();
    const img = await saveImage(store, index, 'a/n.md', new Uint8Array([1]), 'image/png', NOW);
    await store.external('a/n.md', `text\n${img.markdown}\n`);
    await index.scan();
    expect(index.resolveEmbed(index.notes.get('a/n.md')!, '../_attachments/pasted-2026-11-21-143512.png')).toBe(img.path);
  });
});
