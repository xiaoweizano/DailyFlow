import { createDefaultTableJson, isAttachmentImage } from "@dailyflow/editor";
import { createUuidV7 } from "@dailyflow/shared";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  deleteTable,
} from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import {
  Code2,
  Box,
  Heading2,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Quote,
  Sigma,
  Table2,
  Trash2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppText, type AppText } from "../preferences/use-app-text.js";

interface SlashMatch {
  readonly from: number;
  readonly to: number;
  readonly query: string;
}

interface SlashItem {
  readonly id: string;
  readonly label: string;
  readonly labelEn: string;
  readonly keywords: readonly string[];
  readonly icon: LucideIcon;
  readonly run: (editor: Editor, match: SlashMatch, text: AppText) => void;
}

function readSlashMatch(editor: Editor): SlashMatch | null {
  const { from, empty } = editor.state.selection;
  if (!empty) {
    return null;
  }

  const textBefore = editor.state.doc.textBetween(editor.state.selection.$from.start(), from, "\n");
  const match = /(?:^|\s)\/([\w-]*)$/u.exec(textBefore);
  if (match === null) {
    return null;
  }

  const slashOffset = match[0].lastIndexOf("/");
  const slashPosition = textBefore.length - match[0].length + slashOffset;
  return {
    from: editor.state.selection.$from.start() + slashPosition,
    to: from,
    query: match[1] ?? "",
  };
}

function removeQuery(editor: Editor, match: SlashMatch): void {
  editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run();
}

const slashItems: readonly SlashItem[] = [
  {
    id: "heading",
    label: "二级标题",
    labelEn: "Heading 2",
    keywords: ["heading", "title", "h2"],
    icon: Heading2,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    id: "bullet-list",
    label: "无序列表",
    labelEn: "Bullet list",
    keywords: ["list", "bullet", "ul"],
    icon: List,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "ordered-list",
    label: "有序列表",
    labelEn: "Numbered list",
    keywords: ["list", "ordered", "ol"],
    icon: ListOrdered,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "task-list",
    label: "任务列表",
    labelEn: "Task list",
    keywords: ["task", "todo", "check"],
    icon: ListChecks,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "quote",
    label: "引用",
    labelEn: "Quote",
    keywords: ["quote", "blockquote"],
    icon: Quote,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "code",
    label: "代码块",
    labelEn: "Code block",
    keywords: ["code", "pre"],
    icon: Code2,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "table",
    label: "表格",
    labelEn: "Table",
    keywords: ["table", "grid"],
    icon: Table2,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor.chain().focus().insertContent(createDefaultTableJson(3, 3)).run();
    },
  },
  {
    id: "structured-block",
    label: "结构化块",
    labelEn: "Structured block",
    keywords: ["structured", "block", "issue", "solution", "结构化"],
    icon: Box,
    run: (editor, match, text) => {
      removeQuery(editor, match);
      editor
        .chain()
        .focus()
        .insertContent({
          type: "structuredBlock",
          attrs: {
            id: createUuidV7(),
            blockType: "note",
            schemaVersion: 1,
            data: { text: text("结构化内容", "Structured content") },
          },
        })
        .run();
    },
  },
  {
    id: "formula",
    label: "数学公式",
    labelEn: "Math formula",
    keywords: ["formula", "math", "latex", "katex"],
    icon: Sigma,
    run: (editor, match) => {
      removeQuery(editor, match);
      editor
        .chain()
        .focus()
        .insertContent({ type: "blockMath", attrs: { latex: "E = mc^2" } })
        .run();
    },
  },
  {
    id: "mermaid",
    label: "Mermaid 图表",
    labelEn: "Mermaid diagram",
    keywords: ["mermaid", "diagram", "flowchart"],
    icon: Workflow,
    run: (editor, match, text) => {
      removeQuery(editor, match);
      editor
        .chain()
        .focus()
        .insertContent({
          type: "mermaidBlock",
          attrs: {
            code: text("graph LR\n  A[开始] --> B[结束]", "graph LR\n  A[Start] --> B[End]"),
          },
        })
        .run();
    },
  },
  {
    id: "image",
    label: "图片",
    labelEn: "Image",
    keywords: ["image", "img", "photo", "picture"],
    icon: ImagePlus,
    run: (editor, match) => {
      removeQuery(editor, match);
    },
  },
];

function itemMatches(item: SlashItem, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const normalized = query.toLocaleLowerCase();
  return (
    item.label.toLocaleLowerCase().includes(normalized) ||
    item.labelEn.toLocaleLowerCase().includes(normalized) ||
    item.keywords.some((keyword) => keyword.includes(normalized))
  );
}

export interface SlashCommandMenuProps {
  readonly editor: Editor;
  readonly onImageUpload: (file: File) => void;
}

export function SlashCommandMenu({
  editor,
  onImageUpload,
}: SlashCommandMenuProps): React.JSX.Element | null {
  const text = useAppText();
  const [slashMatch, setSlashMatch] = useState<SlashMatch | null>(() => readSlashMatch(editor));
  const [plusMatch, setPlusMatch] = useState<SlashMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState({ left: 32, top: 120 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const match = plusMatch ?? slashMatch;
  const items = match === null ? [] : slashItems.filter((item) => itemMatches(item, match.query));

  useEffect(() => {
    const refresh = (): void => {
      setSlashMatch(readSlashMatch(editor));
      try {
        const coordinates = editor.view.coordsAtPos(editor.state.selection.from);
        setCursorPosition({ left: coordinates.left, top: coordinates.top });
      } catch {
        // Keep the last stable position while the editor is being laid out.
      }
      setActiveIndex(0);
    };
    refresh();
    editor.on("selectionUpdate", refresh);
    editor.on("update", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("update", refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (match === null || items.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMatch(null);
        setPlusMatch(null);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
      } else if (event.key === "Enter") {
        const item = items[activeIndex];
        if (item !== undefined) {
          event.preventDefault();
          if (item.id === "image") {
            item.run(editor, match, text);
            fileInputRef.current?.click();
          } else {
            item.run(editor, match, text);
          }
          setSlashMatch(null);
          setPlusMatch(null);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeIndex, editor, items, match, text]);

  let position = { left: 16, top: 96 };
  if (match !== null) {
    try {
      const coordinates = editor.view.coordsAtPos(match.to);
      position = { left: coordinates.left, top: coordinates.bottom + 6 };
    } catch {
      // Fall back to a stable position when the editor is not laid out yet.
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={text("在光标处插入内容", "Insert content at cursor")}
        aria-expanded={plusMatch !== null}
        className="df-block-insert-button"
        style={{ left: cursorPosition.left - 34, top: cursorPosition.top }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const { from, empty } = editor.state.selection;
          if (!empty) {
            return;
          }
          setSlashMatch(null);
          setPlusMatch({ from, to: from, query: "" });
          setActiveIndex(0);
        }}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
      {match !== null && items.length > 0 ? (
        <div
          role="menu"
          aria-label={text("插入内容", "Insert content")}
          className="df-slash-menu"
          style={{ left: position.left, top: position.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="df-slash-menu-item"
                data-active={index === activeIndex ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  item.run(editor, match, text);
                  setSlashMatch(null);
                  setPlusMatch(null);
                  if (item.id === "image") {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{text(item.label, item.labelEn)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        aria-label={text("选择图片", "Choose image")}
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined && isAttachmentImage(file.type || "image/*")) {
            onImageUpload(file);
          }
        }}
      />
    </>
  );
}

type TableCommand = (state: EditorState, dispatch?: (transaction: Transaction) => void) => boolean;

function commandTableAction(editor: Editor, action: TableCommand): boolean {
  return editor
    .chain()
    .focus()
    .command(({ state, dispatch }) => action(state, dispatch))
    .run();
}

export interface TableEditingToolbarProps {
  readonly editor: Editor;
}

export function TableEditingToolbar({
  editor,
}: TableEditingToolbarProps): React.JSX.Element | null {
  const text = useAppText();
  const [, setVersion] = useState(0);

  useEffect(() => {
    const refresh = (): void => setVersion((value) => value + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("update", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("update", refresh);
    };
  }, [editor]);

  if (!editor.isActive("table")) {
    return null;
  }

  return (
    <div role="toolbar" aria-label={text("表格操作", "Table actions")} className="df-table-toolbar">
      <button type="button" onClick={() => commandTableAction(editor, addRowAfter)}>
        {text("增加行", "Add row")}
      </button>
      <button type="button" onClick={() => commandTableAction(editor, deleteRow)}>
        {text("删除行", "Delete row")}
      </button>
      <button type="button" onClick={() => commandTableAction(editor, addColumnAfter)}>
        {text("增加列", "Add column")}
      </button>
      <button type="button" onClick={() => commandTableAction(editor, deleteColumn)}>
        {text("删除列", "Delete column")}
      </button>
      <button type="button" onClick={() => commandTableAction(editor, deleteTable)}>
        <Trash2 aria-hidden className="size-3.5" />
        {text("删除表格", "Delete table")}
      </button>
    </div>
  );
}
