import { WidgetType } from '@codemirror/view';
import { drawMermaid } from './mermaid';

/** The drawn diagram, shown under its code block. Part of the optional Mermaid feature (see web/mermaid.ts). */
export class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(o: MermaidWidget): boolean {
    return o.source === this.source;
  }
  toDOM(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'cm-mermaid';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', 'Diagram');
    box.textContent = this.source.trim() ? 'Drawing the diagram…' : 'Empty diagram';
    if (this.source.trim()) {
      void drawMermaid(this.source).then((r) => {
        if ('svg' in r) box.innerHTML = r.svg;
        else {
          box.classList.add('cm-mermaid-err');
          box.textContent = `Diagram not drawn: ${r.error}`;
        }
      });
    }
    return box;
  }
  ignoreEvent(): boolean {
    return true;
  }
}
