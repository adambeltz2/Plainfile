import { describe, expect, it } from 'vitest';
import { crc32, toDocx, zip } from '../src/docx';

/** Read a stored zip back, the way Word would: through the central directory. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extra = dv.getUint16(p + 30, true);
    const comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    const lnLen = dv.getUint16(local + 26, true);
    const lxLen = dv.getUint16(local + 28, true);
    const data = bytes.slice(local + 30 + lnLen + lxLen, local + 30 + lnLen + lxLen + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** A small check that XML tags nest properly, since there is no XML parser in the test environment. */
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2] as string);
  }
  return stack.length === 0;
}

describe('docx', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('zip stores files that read back byte for byte', () => {
    const files = [
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'dir/b.bin', data: new Uint8Array([0, 255, 128, 1]) },
    ];
    const back = unzip(zip(files));
    expect([...back.keys()]).toEqual(['a.txt', 'dir/b.bin']);
    expect(new TextDecoder().decode(back.get('a.txt'))).toBe('hello');
    expect([...back.get('dir/b.bin')!]).toEqual([0, 255, 128, 1]);
  });

  it('makes a Word document with the parts Word needs, headings, formatting, lists and a table', () => {
    const md =
      '---\ntitle: X\n---\n# Heading **one**\n\nText with *italic* & <tags>.\n\n- [ ] Task A\n- bullet\n\n1. First\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    const files = unzip(toDocx(md, {}, 'My <doc>'));
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'word/_rels/document.xml.rels',
      'word/document.xml',
      'word/styles.xml',
    ]);
    const doc = new TextDecoder().decode(files.get('word/document.xml'));
    expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
    expect(doc).toContain('Heading ');
    expect(doc).toContain('<w:b/>');
    expect(doc).toContain('<w:i/>');
    expect(doc).toContain('&amp; &lt;tags&gt;');
    expect(doc).toContain('☐ ');
    expect(doc).toContain('• ');
    expect(doc).toContain('1. ');
    expect(doc).toContain('<w:tbl>');
    expect(doc).not.toContain('title: X');
    expect(new TextDecoder().decode(files.get('docProps/core.xml'))).toContain('My &lt;doc&gt;');
    // Every part is well formed: each tag that opens is closed in order.
    for (const name of ['word/document.xml', 'word/styles.xml', '[Content_Types].xml', 'docProps/core.xml'])
      expect(balanced(new TextDecoder().decode(files.get(name))), name).toBe(true);
  });

  it('an empty note still makes a valid document', () => {
    const files = unzip(toDocx(''));
    expect(new TextDecoder().decode(files.get('word/document.xml'))).toContain('<w:body><w:p/>');
  });
});
