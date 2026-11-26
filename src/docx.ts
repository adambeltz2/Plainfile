import { parseBlocks, type Block, type Inline, type ListItem, type RenderOptions } from './render';

/**
 * A Word document (.docx) written without any library. A .docx is a zip of a few XML files; this writes the zip
 * "stored" (uncompressed), which Word, Pages, Google Docs and LibreOffice all open. The content comes from the same
 * block reader as the HTML copy, so the two always agree.
 */
const enc = new TextEncoder();

/* ---------- pictures ---------- */

interface Picture {
  rid: string;
  name: string;
  ext: 'png' | 'jpeg' | 'gif';
  bytes: Uint8Array;
}
/** The pictures of the document being written, collected while its paragraphs are made. Reset by `toDocx`. */
let pictures: Picture[] = [];
let pictureData: ReadonlyMap<string, string> | undefined;

const decodeDataUri = (uri: string): { mime: string; bytes: Uint8Array } | undefined => {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
  if (!m) return undefined;
  try {
    const bin = atob(m[2] as string);
    return { mime: m[1] as string, bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
  } catch {
    return undefined;
  }
};

/** Pixel size of a PNG, JPEG or GIF from its header, or undefined if it cannot be read. */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | undefined {
  const u32 = (i: number): number => (((bytes[i] ?? 0) << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0)) >>> 0;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length > 24) return { w: u32(16), h: u32(20) };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes.length > 10)
    return { w: (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8), h: (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1] ?? 0;
      const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { h: ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0), w: ((bytes[i + 7] ?? 0) << 8) | (bytes[i + 8] ?? 0) };
      i += 2 + len;
    }
  }
  return undefined;
}

/** A picture as an inline drawing, or undefined if the image is not one Word can show (then the caller writes its description). */
function pictureRun(src: string, alt: string): string | undefined {
  const uri = pictureData?.get(src);
  const img = uri ? decodeDataUri(uri) : undefined;
  if (!img) return undefined;
  const ext = img.mime === 'image/png' ? 'png' : img.mime === 'image/jpeg' ? 'jpeg' : img.mime === 'image/gif' ? 'gif' : undefined;
  if (!ext) return undefined;
  const size = imageSize(img.bytes) ?? { w: 800, h: 600 };
  // Word counts in EMU (9,525 to a pixel at 96 dpi); a picture is scaled down to fit the 6-inch text width.
  const maxW = 5_486_400;
  let cx = Math.max(1, size.w) * 9525;
  let cy = Math.max(1, size.h) * 9525;
  if (cx > maxW) {
    cy = Math.round((cy * maxW) / cx);
    cx = maxW;
  }
  const n = pictures.length + 1;
  const pic: Picture = { rid: `rIdImg${n}`, name: `image${n}.${ext === 'jpeg' ? 'jpg' : ext}`, ext, bytes: img.bytes };
  pictures.push(pic);
  const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${x(alt)}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${a}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${n}" name="${pic.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${pic.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip with every file stored as it is. */
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0),
    ]);
    parts.push(local, name, f.data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(crc),
        ...u32(f.data.length),
        ...u32(f.data.length),
        ...u16(name.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
      ]),
      name,
    );
    offset += local.length + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const x = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

interface Style {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
}

function run(text: string, st: Style): string {
  if (!text) return '';
  const pr = `${st.b ? '<w:b/>' : ''}${st.i ? '<w:i/>' : ''}${st.s ? '<w:strike/>' : ''}${st.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : ''}`;
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${text.split('\n').map(x).join('</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r>`;
}

function runs(inl: Inline[], st: Style = {}): string {
  return inl
    .map((n): string => {
      switch (n.t) {
        case 'text':
          return run(n.s, st);
        case 'b':
          return runs(n.c, { ...st, b: true });
        case 'i':
          return runs(n.c, { ...st, i: true });
        case 's':
          return runs(n.c, { ...st, s: true });
        case 'code':
          return run(n.s, { ...st, code: true });
        case 'link':
          return `${runs(n.c, st)}${run(` (${n.href})`, st)}`;
        case 'img':
          return pictureRun(n.src, n.alt) ?? run(n.alt ? `[image: ${n.alt}]` : '', st);
      }
    })
    .join('');
}

const para = (inner: string, style?: string, indent?: { left: number; hanging?: number }): string =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${indent ? `<w:ind w:left="${indent.left}"${indent.hanging ? ` w:hanging="${indent.hanging}"` : ''}/>` : ''}</w:pPr>${inner}</w:p>`;

function listXml(items: ListItem[], ordered: boolean, depth: number): string {
  return items
    .map((it, n) => {
      const mark = it.task ? (it.task === 'x' ? '☑ ' : '☐ ') : ordered ? `${n + 1}. ` : '• ';
      const kids = it.children.map((c) => (c.k === 'list' ? listXml(c.items, c.ordered, depth + 1) : blockXml(c, depth + 1))).join('');
      return para(run(mark, {}) + runs(it.c), undefined, { left: 360 + depth * 360, hanging: 270 }) + kids;
    })
    .join('');
}

function blockXml(b: Block, depth = 0): string {
  switch (b.k) {
    case 'h':
      return para(runs(b.c), `Heading${Math.min(b.level, 4)}`);
    case 'p':
      return para(runs(b.c));
    case 'hr':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr></w:pPr></w:p>';
    case 'code':
      return b.s
        .split('\n')
        .map((l) => para(run(l, { code: true }), undefined, { left: 360 }))
        .join('');
    case 'quote':
      return b.c.map((c) => blockXml(c, depth + 1).replace('<w:pPr>', '<w:pPr><w:ind w:left="720"/>')).join('');
    case 'list':
      return listXml(b.items, b.ordered, depth);
    case 'table': {
      const cell = (inl: Inline[], head: boolean): string =>
        `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(runs(inl, head ? { b: true } : {}))}</w:tc>`;
      const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map((e) => `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`)
        .join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tr>${b.head.map((c) => cell(c, true)).join('')}</w:tr>${b.rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`;
    }
  }
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function styles(): string {
  const h = (id: string, n: number, size: number): string =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${h('Heading1', 1, 36)}${h('Heading2', 2, 30)}${h('Heading3', 3, 26)}${h('Heading4', 4, 24)}</w:styles>`;
}

/** A .docx for the markdown, as bytes. */
export function toDocx(md: string, o: RenderOptions = {}, title = ''): Uint8Array {
  pictures = [];
  pictureData = o.images;
  const body = parseBlocks(md, o)
    .map((b) => blockXml(b))
    .join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body || '<w:p/>'}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...new Set(pictures.map((p) => p.ext))].map((e) => `<Default Extension="${e === 'jpeg' ? 'jpg' : e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
      ),
    },
    {
      name: 'docProps/core.xml',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(title)}</dc:title><dc:creator>tendfile</dc:creator></cp:coreProperties>`,
      ),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${pictures.map((p) => `<Relationship Id="${p.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${p.name}"/>`).join('')}</Relationships>`,
      ),
    },
    { name: 'word/styles.xml', data: enc.encode(styles()) },
    { name: 'word/document.xml', data: enc.encode(doc) },
    ...pictures.map((p) => ({ name: `word/media/${p.name}`, data: p.bytes })),
  ];
  return zip(files);
}
