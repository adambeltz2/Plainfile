/**
 * Diagram blocks in a note. A diagram is a fenced code block whose language is `mermaid`:
 *
 *     ```mermaid
 *     graph TD; A-->B
 *     ```
 *
 * This is only the finding of those blocks. Drawing them is `web/mermaid.ts`, which can be removed on its own.
 */
export interface DiagramBlock {
  /** 1-based line of the opening fence and of the closing fence. */
  open: number;
  close: number;
  source: string;
}

const OPEN = /^\s*(```|~~~)\s*mermaid\b/i;
const FENCE = /^\s*(```|~~~)/;

export const isMermaidOpen = (line: string): boolean => OPEN.test(line);

export function mermaidBlocks(text: string): DiagramBlock[] {
  const lines = text.split(/\r?\n/);
  const out: DiagramBlock[] = [];
  let cur: { open: number; fence: string; src: string[] } | undefined;
  let other = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (cur) {
      if (FENCE.test(l) && l.trim().startsWith(cur.fence)) {
        out.push({ open: cur.open, close: i + 1, source: cur.src.join('\n') });
        cur = undefined;
      } else cur.src.push(l);
    } else if (other) {
      if (FENCE.test(l)) other = false;
    } else if (OPEN.test(l)) cur = { open: i + 1, fence: l.trim().slice(0, 3), src: [] };
    else if (FENCE.test(l)) other = true;
  }
  return out;
}
