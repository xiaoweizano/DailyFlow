import { Node } from "@tiptap/core";

function parseJsonAttribute(value: string | null, fallback: unknown): unknown {
  if (value === null) {
    return fallback;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

export const StructuredBlock = Node.create({
  name: "structuredBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => ({ "data-id": attributes.id }),
      },
      blockType: {
        default: "note",
        parseHTML: (element) => element.getAttribute("data-block-type"),
        renderHTML: (attributes) => ({ "data-block-type": attributes.blockType }),
      },
      schemaVersion: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("data-schema-version") ?? 1),
        renderHTML: (attributes) => ({ "data-schema-version": attributes.schemaVersion }),
      },
      data: {
        default: {},
        parseHTML: (element) =>
          parseJsonAttribute(element.getAttribute("data-structured-data"), {}),
        renderHTML: (attributes) => ({
          "data-structured-data": JSON.stringify(attributes.data ?? {}),
        }),
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-collapsed") === "true",
        renderHTML: (attributes) => ({
          "data-collapsed": attributes.collapsed === true ? "true" : "false",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="structuredBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const blockId = HTMLAttributes["data-id"];
    return [
      "div",
      {
        "data-type": "structuredBlock",
        class: "dailyflow-structured-block",
        ...HTMLAttributes,
        ...(blockId === undefined || blockId === null ? {} : { id: `block-${String(blockId)}` }),
      },
    ];
  },
});
