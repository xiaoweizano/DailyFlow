import { Node } from "@tiptap/core";

function parseOriginalNode(value: string | null): string {
  if (value === null) {
    return "";
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { type?: unknown }).type === "string"
      ? value
      : "";
  } catch {
    return "";
  }
}

const originalNodeAttribute = {
  originalNode: {
    default: "",
    parseHTML: (element: HTMLElement) =>
      parseOriginalNode(element.getAttribute("data-original-node")),
    renderHTML: (attributes: Record<string, unknown>) => ({
      "data-original-node":
        typeof attributes.originalNode === "string" ? attributes.originalNode : "",
    }),
  },
};

export const UnknownBlock = Node.create({
  name: "unknownBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return originalNodeAttribute;
  },

  parseHTML() {
    return [{ tag: 'div[data-type="dailyflow-unknown-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "dailyflow-unknown-block",
        class: "dailyflow-unknown-block",
        ...HTMLAttributes,
      },
      "此内容由较新版本的 DailyFlow 创建，将原样保留。",
    ];
  },
});

export const UnknownInline = Node.create({
  name: "unknownInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return originalNodeAttribute;
  },

  parseHTML() {
    return [{ tag: 'span[data-type="dailyflow-unknown-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-type": "dailyflow-unknown-inline",
        class: "dailyflow-unknown-inline",
        title: "此内容由较新版本的 DailyFlow 创建，将原样保留。",
        ...HTMLAttributes,
      },
      "未知内容",
    ];
  },
});
