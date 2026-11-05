import { buildDocumentOutline, type TiptapJsonNode } from "@dailyflow/editor";
import type { Editor } from "@tiptap/react";
import { ListTree } from "lucide-react";
import { useEffect, useState } from "react";

function readOutline(editor: Editor) {
  return buildDocumentOutline(editor.getJSON() as TiptapJsonNode);
}

export interface EditorOutlineProps {
  readonly editor: Editor;
}

export function EditorOutline({ editor }: EditorOutlineProps): React.JSX.Element {
  const [items, setItems] = useState(() => readOutline(editor));

  useEffect(() => {
    const refresh = (): void => {
      setItems(readOutline(editor));
    };
    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor]);

  return (
    <aside
      aria-label="文档大纲"
      className="df-editor-outline flex min-h-0 min-w-0 flex-col border-border bg-surface-raised max-[899px]:border-t lg:w-56 lg:border-l"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <ListTree aria-hidden="true" className="size-4 text-primary" />
        <h2 className="text-xs font-semibold text-foreground">文档大纲</h2>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="p-3 text-xs leading-5 text-muted-foreground">
          使用 Markdown 标题后，大纲会显示在这里。
        </p>
      ) : (
        <nav aria-label="大纲标题" className="min-h-0 overflow-y-auto p-2">
          <ol className="space-y-0.5">
            {items.map((item) => (
              <li key={`${item.position}:${item.text}`}>
                <button
                  type="button"
                  className="df-editor-outline-item"
                  style={{ paddingInlineStart: `${(item.level - 1) * 12 + 8}px` }}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .setTextSelection(item.position + 1)
                      .scrollIntoView()
                      .run();
                  }}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </aside>
  );
}
