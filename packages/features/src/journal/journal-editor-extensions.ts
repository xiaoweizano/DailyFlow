import { Attachment, createEditorExtensions, MermaidBlock } from "@dailyflow/editor";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AttachmentNodeView } from "./attachment-node-view.js";
import { MermaidNodeView } from "./mermaid-node-view.js";

const AttachmentWithNodeView = Attachment.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView);
  },
});

const MermaidBlockWithNodeView = MermaidBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});

export function createJournalEditorExtensions() {
  const extensions = createEditorExtensions();
  const replacements = new Map([
    ["attachment", AttachmentWithNodeView],
    ["mermaidBlock", MermaidBlockWithNodeView],
  ]);

  return extensions.map((extension) => replacements.get(extension.name) ?? extension);
}
