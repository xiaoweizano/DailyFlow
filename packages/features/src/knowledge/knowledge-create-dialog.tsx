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
        setError("保存到知识库失败，请重试");
        return;
      }

      onCreated?.(result.value);
      onOpenChange(false);
      navigate(`/knowledge/${result.value.id}`);
    } catch {
      setError("保存到知识库失败，请重试");
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
          <DialogTitle>新建知识</DialogTitle>
          <DialogDescription id="knowledge-create-description">
            独立创建可复用知识，正文从 Markdown 转换为 DailyFlow 文档后保存。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-medium text-foreground">知识类型</p>
            <SegmentedControl
              label="知识类型"
              value={kind}
              onChange={setKind}
              options={[
                { label: "问题", value: "issue" },
                { label: "方案", value: "solution" },
                { label: "决策", value: "decision" },
                { label: "笔记", value: "note" },
                { label: "参考", value: "reference" },
              ]}
            />
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            知识标题
            <Input
              value={title}
              maxLength={200}
              placeholder="例如：回滚发布的标准检查清单"
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            摘要
            <textarea
              value={summary}
              maxLength={1000}
              rows={2}
              placeholder="可选；留空时使用正文摘要"
              className="min-h-16 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15"
              onChange={(event) => setSummary(event.currentTarget.value)}
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            Markdown 正文
            <textarea
              value={markdown}
              rows={12}
              placeholder={"## 背景\n\n记录问题、过程与结论。\n\n- 要点一\n- 要点二"}
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
            取消
          </Button>
          <Button disabled={saving || !canSave} onClick={() => void handleCreate()}>
            {saving ? (
              <RotateCw aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            保存到知识库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
