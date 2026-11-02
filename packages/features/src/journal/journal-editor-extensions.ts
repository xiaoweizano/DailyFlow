import { Attachment, createEditorExtensions } from "@dailyflow/editor";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { AttachmentNodeView } from "./attachment-node-view.js";

const AttachmentWithNodeView = Attachment.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView);
  },
});

export function createJournalEditorExtensions() {
  const extensions = createEditorExtensions();
  const attachmentIndex = extensions.findIndex((extension) => extension.name === "attachment");
  if (attachmentIndex === -1) {
    return [...extensions, AttachmentWithNodeView];
  }

  return extensions.map((extension, index) =>
    index === attachmentIndex ? AttachmentWithNodeView : extension,
  );
}
