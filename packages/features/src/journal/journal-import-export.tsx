import {
  CURRENT_EDITOR_SCHEMA_VERSION,
  editorDocumentToMarkdown,
  markdownToEditorDocument,
  type TiptapJsonNode,
} from "@dailyflow/editor";
import { Button } from "@dailyflow/ui";
import type { Editor } from "@tiptap/react";
import { FileDown, FileUp } from "lucide-react";
import { useRef, useState } from "react";
import "katex/dist/katex.min.css";

export interface JournalImportExportProps {
  readonly editor: Editor | null;
}

export function JournalImportExport({ editor }: JournalImportExportProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function importMarkdown(file: File): Promise<void> {
    if (editor === null) {
      return;
    }

    try {
      const markdown = await file.text();
      const document = markdownToEditorDocument(markdown);
      editor
        .chain()
        .setContent(document.doc, { emitUpdate: true })
        .setTextSelection(1)
        .focus()
        .run();
      setError(null);
    } catch {
      setError("Markdown 文件读取失败，请确认文件编码和内容。");
    }
  }

  function exportMarkdown(): void {
    if (editor === null) {
      return;
    }

    try {
      const markdown = editorDocumentToMarkdown({
        schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
        doc: editor.getJSON() as TiptapJsonNode,
      });
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dailyflow-journal.md";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setError(null);
    } catch {
      setError("Markdown 导出失败，请稍后重试。");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={editor === null}
        onClick={() => fileInputRef.current?.click()}
      >
        <FileUp aria-hidden="true" className="size-4" />
        导入 Markdown
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="导入 Markdown 文件"
        accept=".md,.markdown,text/markdown,text/plain"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file !== undefined) {
            void importMarkdown(file);
          }
        }}
      />
      <Button variant="ghost" size="sm" disabled={editor === null} onClick={exportMarkdown}>
        <FileDown aria-hidden="true" className="size-4" />
        导出 Markdown
      </Button>
      {error === null ? null : (
        <p role="alert" className="basis-full text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
