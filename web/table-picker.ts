import type { EditorView } from '@codemirror/view';
import { sizedTable } from '../src/tables';
import { requestTableFocus } from './table-widget';

/**
 * The size picker for `/table`: a hover grid, or Columns and Rows boxes. A header row is always included, since a
 * markdown table needs one. Insert writes the table where the slash command was and puts the caret in its first
 * heading cell; Cancel takes the typed command away.
 */
const GRID = 8;
let open: HTMLElement | undefined;

export function closeTablePicker(): void {
  open?.remove();
  open = undefined;
}

export function openTablePicker(view: EditorView, from: number, to: number): void {
  closeTablePicker();
  const box = document.createElement('div');
  box.className = 'tpick';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Insert a table');
  let cols = 3;
  let rows = 3;

  const title = document.createElement('div');
  title.className = 'tpick-t';
  title.textContent = 'Insert table';
  const grid = document.createElement('div');
  grid.className = 'tpick-grid';
  grid.setAttribute('aria-hidden', 'true');
  const cells: HTMLElement[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const el = document.createElement('i');
      el.dataset.c = String(c + 1);
      el.dataset.r = String(r + 1);
      cells.push(el);
      grid.appendChild(el);
    }
  }
  const label = document.createElement('div');
  label.className = 'tpick-l';
  const mk = (name: string, value: number, max: number): [HTMLElement, HTMLInputElement] => {
    const wrap = document.createElement('label');
    wrap.textContent = `${name} `;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(max);
    input.value = String(value);
    input.className = 'inp';
    wrap.appendChild(input);
    return [wrap, input];
  };
  const [colLabel, colIn] = mk('Columns', cols, 12);
  const [rowLabel, rowIn] = mk('Rows', rows, 50);
  const fields = document.createElement('div');
  fields.className = 'tpick-f';
  fields.append(colLabel, rowLabel);
  const actions = document.createElement('div');
  actions.className = 'tpick-a';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'btn primary';
  ok.textContent = 'Insert';
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'btn';
  no.textContent = 'Cancel';
  actions.append(ok, no);
  box.append(title, grid, label, fields, actions);

  const paint = (): void => {
    for (const el of cells) el.classList.toggle('on', Number(el.dataset.c) <= cols && Number(el.dataset.r) <= rows);
    label.innerHTML = `<b>${cols} × ${rows}</b> <span>columns × rows, with a header row</span>`;
  };
  const clamp = (v: string, max: number): number => Math.max(1, Math.min(max, Math.round(Number(v)) || 1));
  const read = (): void => {
    cols = clamp(colIn.value, 12);
    rows = clamp(rowIn.value, 50);
    paint();
  };
  grid.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('i');
    if (!el) return;
    cols = Number(el.dataset.c);
    rows = Number(el.dataset.r);
    colIn.value = String(cols);
    rowIn.value = String(rows);
    paint();
  });
  grid.addEventListener('click', () => insert());
  colIn.addEventListener('input', read);
  rowIn.addEventListener('input', read);

  const finish = (): void => {
    closeTablePicker();
    view.focus();
  };
  const cancel = (): void => {
    view.dispatch({ changes: { from, to, insert: '' }, userEvent: 'delete' }); // the typed /table goes
    finish();
  };
  const insert = (): void => {
    read();
    const doc = view.state.doc;
    const line = doc.lineAt(from);
    const text = `${sizedTable(cols, rows).join('\n')}\n`; // the empty line after it is where the caret rests, outside the table
    requestTableFocus(line.number - 1, -1, 0, 'all');
    view.dispatch({
      changes: { from: line.from, to, insert: text },
      selection: { anchor: line.from + text.length },
      userEvent: 'input.complete',
    });
    closeTablePicker();
  };
  ok.addEventListener('click', insert);
  no.addEventListener('click', cancel);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      insert();
    }
  });
  // Clicking away cancels, like closing any small popover.
  const away = (e: MouseEvent): void => {
    if (open && !open.contains(e.target as Node)) {
      document.removeEventListener('mousedown', away, true);
      cancel();
    }
  };

  paint();
  document.body.appendChild(box);
  open = box;
  const at = view.coordsAtPos(from);
  const size = box.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(at?.left ?? 16, window.innerWidth - size.width - 8))}px`;
  // Below the line it was typed on, or above it when there is no room below.
  const below = (at?.bottom ?? 80) + 6;
  const top = below + size.height + 8 <= window.innerHeight ? below : (at?.top ?? 80) - size.height - 6;
  box.style.top = `${Math.max(8, Math.min(top, window.innerHeight - size.height - 8))}px`;
  window.setTimeout(() => document.addEventListener('mousedown', away, true), 0);
  colIn.focus();
  colIn.select();
}
