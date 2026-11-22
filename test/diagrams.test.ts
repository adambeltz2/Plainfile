import { describe, expect, it } from 'vitest';
import { isMermaidOpen, mermaidBlocks } from '../src/diagrams';

describe('mermaid blocks', () => {
  it('finds diagram blocks and leaves other code blocks alone', () => {
    const doc = '# T\n```mermaid\ngraph TD\n  A-->B\n```\ntext\n```js\nconst a = 1;\n```\n~~~mermaid\nsequenceDiagram\n~~~\n```mermaid\nnever closed\n';
    expect(mermaidBlocks(doc)).toEqual([
      { open: 2, close: 5, source: 'graph TD\n  A-->B' },
      { open: 10, close: 12, source: 'sequenceDiagram' },
    ]);
  });
  it('does not treat a mermaid fence inside another code block as a diagram', () => {
    expect(mermaidBlocks('```md\n```mermaid\nx\n```\n')).toEqual([]);
  });
  it('recognises the opening line', () => {
    expect(isMermaidOpen('```mermaid')).toBe(true);
    expect(isMermaidOpen('  ``` Mermaid')).toBe(true);
    expect(isMermaidOpen('```js')).toBe(false);
  });
});
