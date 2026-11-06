import { getSchema, type Extensions } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { Attachment } from "../extensions/attachment.js";
import { EditorBlocks } from "../extensions/editor-blocks.js";
import { EditorRichContent } from "../extensions/editor-rich-content.js";
import { MarkdownShortcuts } from "../extensions/markdown-shortcuts.js";
import { StructuredBlock } from "../extensions/structured-block.js";
import { UnknownBlock, UnknownInline } from "../extensions/unknown-content.js";

export function createEditorExtensions(): Extensions {
  return [
    MarkdownShortcuts,
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      link: false,
      codeBlock: false,
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
    ...EditorBlocks,
    ...EditorRichContent,
    StructuredBlock,
    UnknownBlock,
    UnknownInline,
  ];
}

export function createEditorSchema() {
  return getSchema(createEditorExtensions());
}
