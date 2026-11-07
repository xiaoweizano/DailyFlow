import { ATTACHMENT_ALLOWED_MIME_TYPES } from "@dailyflow/application";
import { IconButton } from "@dailyflow/ui";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Paperclip,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { useRef } from "react";

import { useAppText } from "../preferences/use-app-text.js";

export interface EditorToolbarProps {
  readonly editor: Editor;
  readonly attachmentBusy?: boolean;
  readonly onAttach?: (file: File) => void;
}

export function EditorToolbar({
  editor,
  attachmentBusy = false,
  onAttach,
}: EditorToolbarProps): React.JSX.Element {
  const text = useAppText();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      role="toolbar"
      aria-label={text("编辑工具栏", "Editor toolbar")}
      className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5"
    >
      <IconButton
        label={text("撤销", "Undo")}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("重做", "Redo")}
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("一级标题", "Heading 1")}
        variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("二级标题", "Heading 2")}
        variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("粗体", "Bold")}
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("斜体", "Italic")}
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("删除线", "Strikethrough")}
        variant={editor.isActive("strike") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("项目列表", "Bullet list")}
        variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("编号列表", "Numbered list")}
        variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("任务列表", "Task list")}
        variant={editor.isActive("taskList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("引用", "Quote")}
        variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote aria-hidden="true" />
      </IconButton>
      <IconButton
        label={text("代码块", "Code block")}
        variant={editor.isActive("codeBlock") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 aria-hidden="true" />
      </IconButton>
      {onAttach === undefined ? null : (
        <>
          <IconButton
            label={text("添加附件", "Add attachment")}
            disabled={attachmentBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip aria-hidden="true" />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            aria-label={text("选择附件", "Choose attachment")}
            accept={ATTACHMENT_ALLOWED_MIME_TYPES.join(",")}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file !== undefined) {
                onAttach(file);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
