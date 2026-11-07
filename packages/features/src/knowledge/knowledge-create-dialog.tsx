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
    try {
      const result = await services.knowledge.create({
        kind,
        title: normalizedTitle,
        ...(summary.trim() === "" ? {} : { summary: summary.trim() }),
        contentSchemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
        contentJson: markdownToJson(markdown) as TiptapJsonNode,
      });
      if (!result.ok) {
        setError(
          text("保存到知识库失败，请重试", "Failed to save to the knowledge base. Try again."),
        );
        return;
      }

      onCreated?.(result.value);
      onOpenChange(false);
      navigate(`/knowledge/${result.value.id}`);
    } catch {
      setError(
        text("保存到知识库失败，请重试", "Failed to save to the knowledge base. Try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  const canSave = title.trim() !== "" && markdown.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="knowledge-create-description"
        className="w-[min(94vw,720px)]"
      >
        <DialogHeader>
          <DialogTitle>{text("新建知识", "New knowledge")}</DialogTitle>
          <DialogDescription id="knowledge-create-description">
            {text(
              "独立创建可复用知识，正文从 Markdown 转换为 DailyFlow 文档后保存。",
              "Create reusable knowledge directly. Markdown is converted into a DailyFlow document before saving.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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
              rows={2}
              placeholder={text(
                "可选；留空时使用正文摘要",
                "Optional; the body is summarized when left empty",
              )}
              className="min-h-16 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
              onChange={(event) => setSummary(event.currentTarget.value)}
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            {text("Markdown 正文", "Markdown body")}
            <textarea
              value={markdown}
              rows={12}
              placeholder={text(
                "## 背景\n\n记录问题、过程与结论。\n\n- 要点一\n- 要点二",
                "## Background\n\nRecord the problem, process, and conclusion.\n\n- First point\n- Second point",
              )}
              className="min-h-56 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-3 font-mono text-sm leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
              onChange={(event) => setMarkdown(event.currentTarget.value)}
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

        <DialogFooter>
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
