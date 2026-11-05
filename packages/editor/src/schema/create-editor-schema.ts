import { getSchema, type Extensions } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { Attachment } from "../extensions/attachment.js";
import { MarkdownShortcuts } from "../extensions/markdown-shortcuts.js";
import { StructuredBlock } from "../extensions/structured-block.js";

export function createEditorExtensions(): Extensions {
  return [
    MarkdownShortcuts,
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: false,
    }),
    Link.configure({
      autolink: true,
      linkOnPaste: false,
      openOnClick: false,
      protocols: ["http", "https", "mailto"],
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Attachment,
    StructuredBlock,
  ];
}

export function createEditorSchema() {
  return getSchema(createEditorExtensions());
}
