import type { AnalyticsPeriod } from "@dailyflow/application";
import { createEditorExtensions } from "@dailyflow/editor";
import type { ContentDocument, JsonObject } from "@dailyflow/domain";
import { Button, Input, SaveStatus, type SaveState } from "@dailyflow/ui";
import type { AppError } from "@dailyflow/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import { Bot, Save } from "lucide-react";
import { useRef, useState } from "react";

import { useAppServices } from "../app-services-hooks.js";
import { EditorToolbar } from "../journal/editor-toolbar.js";

export interface ReportEditorProps {
  readonly period: AnalyticsPeriod;
  readonly initialTitle: string;
  readonly initialContent: ContentDocument;
  readonly projectionVersion: number;
  readonly initialStats: JsonObject;
  readonly expectedRevision: number | null;
  readonly onClose: () => void;
}

type ReportSaveState = "idle" | "saving" | "saved" | "error";

function reportErrorMessage(error: AppError): string {
  if (error.code === "CONFLICT") {
    return "报告已在其他位置更新，请重新打开后再保存";
  }
  if (error.code === "VALIDATION_ERROR") {
    return Object.values(error.fields ?? {})[0] ?? "报告内容未通过校验";
  }
  return "报告保存失败，请稍后重试";
}

export function ReportEditor({
  period,
  initialTitle,
  initialContent,
  projectionVersion,
  initialStats,
  expectedRevision,
  onClose,
}: ReportEditorProps): React.JSX.Element {
  const services = useAppServices();
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<ReportSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentRef = useRef<JsonObject>(initialContent.doc);
  const revisionRef = useRef<number | null>(expectedRevision);

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: initialContent.doc,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "报告正文",
        "aria-multiline": "true",
        class: "df-journal-prosemirror",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      contentRef.current = activeEditor.getJSON() as JsonObject;
      setSaveState("idle");
      setErrorMessage(null);
    },
  });

  async function save(): Promise<void> {
    if (title.trim() === "" || saveState === "saving") {
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);
    const result = await services.analytics.saveReport({
      periodType: period.periodType,
      periodStart: period.start,
      periodEnd: period.end,
      timezone: period.timezone,
      title: title.trim(),
      content: {
        schemaVersion: initialContent.schemaVersion,
        doc: contentRef.current,
      },
      projectionVersion,
      stats: initialStats,
      expectedRevision: revisionRef.current,
    });

    if (!result.ok) {
      setSaveState("error");
      setErrorMessage(reportErrorMessage(result.error));
      return;
    }

    revisionRef.current = result.value.revision;
    setSaveState("saved");
  }

  const saveStatus: SaveState =
    saveState === "error" ? "error" : saveState === "saved" ? "saved" : saveState;

  return (
    <section aria-labelledby="report-editor-title" className="border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Local report</p>
          <h2 id="report-editor-title" className="mt-1 text-base font-semibold text-foreground">
            周期报告
          </h2>
        </div>
        <SaveStatus status={saveStatus} />
        <Button variant="ghost" size="sm" onClick={onClose}>
          关闭报告
        </Button>
        <Button
          variant="secondary"
          size="sm"
          title="AI 辅助写作：未配置"
          aria-label="AI 辅助写作：未配置"
          disabled
        >
          <Bot aria-hidden="true" className="size-4" />
          AI 辅助
        </Button>
        <Button size="sm" disabled={saveState === "saving"} onClick={() => void save()}>
          <Save aria-hidden="true" className="size-4" />
          保存报告
        </Button>
      </header>

      {errorMessage === null ? null : (
        <p
          role="alert"
          className="border-b border-danger/25 bg-danger/5 px-4 py-2 text-sm text-danger"
        >
          {errorMessage}
        </p>
      )}
      {saveState === "saved" ? (
        <p role="status" className="border-b border-success/25 bg-success/5 px-4 py-2 text-sm">
          报告已保存
        </p>
      ) : null}

      <div className="border-b border-border px-4 py-3">
        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          报告标题
          <Input
            aria-label="报告标题"
            value={title}
            maxLength={500}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
              setSaveState("idle");
              setErrorMessage(null);
            }}
          />
        </label>
      </div>

      {editor === null ? (
        <p className="p-6 text-sm text-muted-foreground">正在初始化报告编辑器</p>
      ) : (
        <>
          <EditorToolbar editor={editor} />
          <div className="min-h-[28rem]">
            <EditorContent editor={editor} className="min-h-[28rem]" />
          </div>
        </>
      )}
    </section>
  );
}
