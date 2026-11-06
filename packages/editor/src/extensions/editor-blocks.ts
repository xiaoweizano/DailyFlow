import { Extension, Node, type Extensions } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { tableEditing } from "@tiptap/pm/tables";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import type { TiptapJsonNode } from "../schema/editor-types.js";

const blockDragPluginKey = new PluginKey<DecorationSet>("dailyflowBlockDragHandles");

interface CellAttributes {
  readonly colspan: number;
  readonly rowspan: number;
  readonly colwidth: readonly number[] | null;
}

function parseIntegerAttribute(element: HTMLElement, name: string, fallback: number): number {
  const value = Number(element.getAttribute(name) ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseColumnWidths(element: HTMLElement): readonly number[] | null {
  const value = element.getAttribute("data-colwidth");
  if (value === null || value.trim() === "") {
    return null;
  }

  const widths = value
    .split(",")
    .map((width) => Number(width.trim()))
    .filter((width) => Number.isInteger(width) && width > 0);
  return widths.length === 0 ? null : widths;
}

function cellAttributes() {
  return {
    colspan: {
      default: 1,
      parseHTML: (element: HTMLElement) => parseIntegerAttribute(element, "colspan", 1),
      renderHTML: (attributes: CellAttributes) =>
        attributes.colspan === 1 ? {} : { colspan: attributes.colspan },
    },
    rowspan: {
      default: 1,
      parseHTML: (element: HTMLElement) => parseIntegerAttribute(element, "rowspan", 1),
      renderHTML: (attributes: CellAttributes) =>
        attributes.rowspan === 1 ? {} : { rowspan: attributes.rowspan },
    },
    colwidth: {
      default: null,
      parseHTML: (element: HTMLElement) => parseColumnWidths(element),
      renderHTML: (attributes: CellAttributes) =>
        attributes.colwidth === null || attributes.colwidth.length === 0
          ? {}
          : { "data-colwidth": attributes.colwidth.join(",") },
    },
  };
}

export const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,

  parseHTML() {
    return [{ tag: "table" }];
  },

  renderHTML() {
    return ["table", ["tbody", 0]];
  },

  extendNodeSchema(extension) {
    return extension.name === "table" ? { tableRole: "table" } : {};
  },

  addProseMirrorPlugins() {
    return [tableEditing()];
  },
});

export const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",

  parseHTML() {
    return [{ tag: "tr" }];
  },

  renderHTML() {
    return ["tr", 0];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableRow" ? { tableRole: "row" } : {};
  },
});

export const TableCell = Node.create({
  name: "tableCell",
  content: "block+",
  isolating: true,

  addAttributes() {
    return cellAttributes();
  },

  parseHTML() {
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["td", HTMLAttributes, 0];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableCell" ? { tableRole: "cell" } : {};
  },
});

export const TableHeader = Node.create({
  name: "tableHeader",
  content: "block+",
  isolating: true,

  addAttributes() {
    return cellAttributes();
  },

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["th", HTMLAttributes, 0];
  },

  extendNodeSchema(extension) {
    return extension.name === "tableHeader" ? { tableRole: "header_cell" } : {};
  },
});

function blockAt(
  view: EditorView,
  position: number,
): { readonly from: number; readonly to: number } | null {
  const resolved = view.state.doc.resolve(position);
  if (resolved.depth < 1) {
    const node = view.state.doc.nodeAt(position);
    return node === null ? null : { from: position, to: position + node.nodeSize };
  }

  const from = resolved.before(1);
  const node = view.state.doc.nodeAt(from);
  return node === null ? null : { from, to: from + node.nodeSize };
}

function createDragHandle(position: number, label: string): HTMLElement {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "df-block-drag-handle";
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.dataset.blockPosition = String(position);
  handle.setAttribute("aria-label", `拖动${label}块`);
  handle.title = "拖动块";
  handle.textContent = "⠿";
  return handle;
}

export const BlockDragHandles = Extension.create({
  name: "dailyflowBlockDragHandles",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockDragPluginKey,
        state: {
          init: (_, state) => {
            const decorations: Decoration[] = [];
            state.doc.forEach((node, offset) => {
              decorations.push(
                Decoration.widget(offset, createDragHandle(offset, node.type.name), {
                  key: `block-drag-${offset}-${node.type.name}`,
                  side: -1,
                }),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
          apply: (transaction, current, _oldState, newState) => {
            if (!transaction.docChanged) {
              return current.map(transaction.mapping, transaction.doc);
            }

            const decorations: Decoration[] = [];
            newState.doc.forEach((node, offset) => {
              decorations.push(
                Decoration.widget(offset, createDragHandle(offset, node.type.name), {
                  key: `block-drag-${offset}-${node.type.name}`,
                  side: -1,
                }),
              );
            });
            return DecorationSet.create(newState.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return blockDragPluginKey.getState(state);
          },
          handleDOMEvents: {
            dragstart(view, event) {
              const target = event.target;
              if (!(target instanceof HTMLElement)) {
                return false;
              }

              const handle = target.closest<HTMLElement>("[data-block-position]");
              if (handle === null || event.dataTransfer === null) {
                return false;
              }

              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                "application/x-dailyflow-block",
                handle.dataset.blockPosition ?? "",
              );
              event.dataTransfer.setData("text/plain", "");
              return true;
            },
            dragover(_view, event) {
              if (event.dataTransfer?.types.includes("application/x-dailyflow-block") === true) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
              return false;
            },
            drop(view, event) {
              const rawPosition = event.dataTransfer?.getData("application/x-dailyflow-block");
              if (rawPosition === undefined || rawPosition === "") {
                return false;
              }

              const sourcePosition = Number(rawPosition);
              const sourceNode = view.state.doc.nodeAt(sourcePosition);
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (
                !Number.isInteger(sourcePosition) ||
                sourceNode === null ||
                coordinates === null
              ) {
                return false;
              }

              const target = blockAt(view, coordinates.pos);
              if (target === null) {
                return false;
              }

              const targetDom = view.nodeDOM(target.from);
              let destination = target.from;
              if (targetDom instanceof HTMLElement) {
                const bounds = targetDom.getBoundingClientRect();
                if (event.clientY > bounds.top + bounds.height / 2) {
                  destination = target.to;
                }
              }

              if (
                destination >= sourcePosition &&
                destination <= sourcePosition + sourceNode.nodeSize
              ) {
                return true;
              }

              event.preventDefault();
              const transaction = view.state.tr.delete(
                sourcePosition,
                sourcePosition + sourceNode.nodeSize,
              );
              transaction.insert(transaction.mapping.map(destination, -1), sourceNode);
              view.dispatch(transaction.scrollIntoView());
              return true;
            },
          },
        },
      }),
    ];
  },
});

export function createDefaultTableJson(rows = 3, columns = 3): TiptapJsonNode {
  const tableRows: TiptapJsonNode[] = [];
  for (let row = 0; row < rows; row += 1) {
    const cells: TiptapJsonNode[] = [];
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        type: row === 0 ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph" }],
      });
    }
    tableRows.push({ type: "tableRow", content: cells });
  }

  return { type: "table", content: tableRows };
}

export const EditorBlocks: Extensions = [Table, TableRow, TableHeader, TableCell, BlockDragHandles];
