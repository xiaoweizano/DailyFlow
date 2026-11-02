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
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { IconButton } from "@dailyflow/ui";

export interface EditorToolbarProps {
  readonly editor: Editor;
}

export function EditorToolbar({ editor }: EditorToolbarProps): React.JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label="编辑工具栏"
      className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5"
    >
      <IconButton
        label="撤销"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label="重做"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label="一级标题"
        variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 aria-hidden="true" />
      </IconButton>
      <IconButton
        label="二级标题"
        variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 aria-hidden="true" />
      </IconButton>
      <IconButton
        label="粗体"
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden="true" />
      </IconButton>
      <IconButton
        label="斜体"
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden="true" />
      </IconButton>
      <IconButton
        label="删除线"
        variant={editor.isActive("strike") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough aria-hidden="true" />
      </IconButton>
      <IconButton
        label="项目列表"
        variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" />
      </IconButton>
      <IconButton
        label="编号列表"
        variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden="true" />
      </IconButton>
      <IconButton
        label="任务列表"
        variant={editor.isActive("taskList") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks aria-hidden="true" />
      </IconButton>
      <IconButton
        label="引用"
        variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote aria-hidden="true" />
      </IconButton>
      <IconButton
        label="代码块"
        variant={editor.isActive("codeBlock") ? "secondary" : "ghost"}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 aria-hidden="true" />
      </IconButton>
    </div>
  );
}
