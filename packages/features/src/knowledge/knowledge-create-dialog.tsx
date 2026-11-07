import type { KnowledgeItem, KnowledgeKind } from "@dailyflow/domain";
import {
  CURRENT_EDITOR_SCHEMA_VERSION,
  markdownToJson,
  type TiptapJsonNode,
} from "@dailyflow/editor";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SegmentedControl,
} from "@dailyflow/ui";
import { Check, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { useAppText } from "../preferences/use-app-text.js";
import { knowledgeKindOptions } from "./knowledge-labels.js";
import { knowledgeErrorMessage } from "./knowledge-services.js";

export interface KnowledgeCreateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (item: KnowledgeItem) => void;
}

export function KnowledgeCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: KnowledgeCreateDialogProps): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const navigate = useNavigate();
  const [kind, setKind] = useState<KnowledgeKind>("note");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setKind("note");
    setTitle("");
    setSummary("");
    setMarkdown("");
    setError(null);
  }, [open]);

  async function handleCreate(): Promise<void> {
    const normalizedTitle = title.trim();
    if (normalizedTitle === "" || markdown.trim() === "") {
      return;
    }

    setSaving(true);
    setError(null);
    const fallback = text(
      "保存到知识库失败，请重试",
      "Failed to save to the knowledge base. Try again.",
    );
    try {
      const result = await services.knowledge.create({
        kind,
        title: normalizedTitle,
        ...(summary.trim() === "" ? {} : { summary: summary.trim() }),
        contentSchemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
        contentJson: markdownToJson(markdown) as TiptapJsonNode,
      });
      if (!result.ok) {
        setError(knowledgeErrorMessage(result.error, fallback));
        return;
      }

      onCreated?.(result.value);
      onOpenChange(false);
      navigate(`/knowledge/${result.value.id}`);
    } catch (caught) {
      setError(knowledgeErrorMessage(caught, fallback));
    } finally {
      setSaving(false);
    }
  }

  const canSave = title.trim() !== "" && markdown.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="knowledge-create-description"
        className="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0"
        scroll="none"
        size="immersive"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{text("新建知识", "New knowledge")}</DialogTitle>
          <DialogDescription id="knowledge-create-description">
            {text(
              "独立创建可复用知识，正文从 Markdown 转换为 DailyFlow 文档后保存。",
              "Create reusable knowledge directly. Markdown is converted into a DailyFlow document before saving.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-4 overflow-hidden border-b border-border p-5 md:border-b-0 md:border-r">
            <div className="grid gap-2">
              <p className="text-xs font-medium text-foreground">
                {text("知识类型", "Knowledge type")}
              </p>
              <SegmentedControl
                label={text("知识类型", "Knowledge type")}
                value={kind}
                onChange={setKind}
                options={knowledgeKindOptions(text)}
              />
            </div>

            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("知识标题", "Knowledge title")}
              <Input
                value={title}
                maxLength={200}
                placeholder={text(
                  "例如：回滚发布的标准检查清单",
                  "For example: Standard release rollback checklist",
                )}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              {text("摘要", "Summary")}
              <textarea
                value={summary}
                maxLength={1000}
                rows={3}
                placeholder={text(
                  "可选；留空时使用正文摘要",
                  "Optional; the body is summarized when left empty",
                )}
                className="min-h-20 w-full resize-none rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
                onChange={(event) => setSummary(event.currentTarget.value)}
              />
            </label>

            {error === null ? null : (
              <p
                role="alert"
                className="border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger"
              >
                {error}
              </p>
            )}
          </div>

          <label className="flex min-h-0 flex-col gap-2 p-5 text-xs font-medium text-foreground">
            <span>{text("Markdown 正文", "Markdown body")}</span>
            <textarea
              value={markdown}
              placeholder={text(
                "## 背景\n\n记录问题、过程与结论。\n\n- 要点一\n- 要点二",
                "## Background\n\nRecord the problem, process, and conclusion.\n\n- First point\n- Second point",
              )}
              className="min-h-0 flex-1 resize-none overflow-y-auto rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-3 font-mono text-sm leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
              onChange={(event) => setMarkdown(event.currentTarget.value)}
            />
          </label>
        </div>

        <DialogFooter className="mt-0 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {text("取消", "Cancel")}
          </Button>
          <Button disabled={saving || !canSave} onClick={() => void handleCreate()}>
            {saving ? (
              <RotateCw aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            {text("保存到知识库", "Save to knowledge base")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
