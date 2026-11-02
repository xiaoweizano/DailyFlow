import { Node } from "@tiptap/core";

export const Attachment = Node.create({
  name: "attachment",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes) => ({ "data-attachment-id": attributes.attachmentId }),
      },
      displayName: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-display-name") ?? "",
        renderHTML: (attributes) => ({ "data-display-name": attributes.displayName }),
      },
      mimeType: {
        default: "application/octet-stream",
        parseHTML: (element) => element.getAttribute("data-mime-type"),
        renderHTML: (attributes) => ({ "data-mime-type": attributes.mimeType }),
      },
      byteSize: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-byte-size") ?? 0),
        renderHTML: (attributes) => ({ "data-byte-size": attributes.byteSize }),
      },
      isInline: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-is-inline") === "true",
        renderHTML: (attributes) => ({
          "data-is-inline": attributes.isInline === true ? "true" : "false",
        }),
      },
      altText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-alt-text"),
        renderHTML: (attributes) =>
          attributes.altText === null || attributes.altText === undefined
            ? {}
            : { "data-alt-text": attributes.altText },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-type": "attachment",
        class: "dailyflow-attachment",
        ...HTMLAttributes,
      },
    ];
  },
});
