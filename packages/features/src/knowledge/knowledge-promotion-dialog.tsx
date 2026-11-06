import type { EntityId, Journal, KnowledgeItem, KnowledgeKind } from "@dailyflow/domain";
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

import { useAppServices } from "../app-services-hooks.js";

export interface KnowledgePromotionDialogProps {
  readonly open: boolean;
  readonly journal: Journal;
  readonly sourceBlockId?: EntityId | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPromoted?: (item: KnowledgeItem) => void;
}

export function KnowledgePromotionDialog({
  open,
  journal,
  sourceBlockId,
  onOpenChange,
  onPromoted,
}: KnowledgePromotionDialogProps): React.JSX.Element {
  const services = useAppServices();
  const [kind, setKind] = useState<KnowledgeKind>("note");
  const [title, setTitle] = useState(journal.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind("note");
      setTitle(journal.title);
      setError(null);
    }
  }, [journal.title, open]);

  async function handlePromote(): Promise<void> {
    if (title.trim() === "") {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await services.knowledge.promote({
        journalId: journal.id,
        ...(sourceBlockId === undefined || sourceBlockId === null ? {} : { sourceBlockId }),
        kind,
        title: title.trim(),
      });
      if (!result.ok) {
        setError("保存到知识库失败，请重试");
        return;
      }
      onPromoted?.(result.value);
      onOpenChange(false);
    } catch {
      setError("保存到知识库失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="knowledge-promotion-description">
        <DialogHeader>
          <DialogTitle>保存为知识</DialogTitle>
          <DialogDescription id="knowledge-promotion-description">
            保留原日志和结构化块来源，生成可独立维护的知识条目。
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
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          {sourceBlockId === undefined || sourceBlockId === null ? (
            <p className="border border-border bg-surface-muted/60 px-3 py-2 text-xs text-muted-foreground">
              将整篇日志保存为独立知识快照。
            </p>
          ) : (
            <p className="break-all border border-border bg-surface-muted/60 px-3 py-2 font-mono text-[10px] text-muted-foreground">
              来源块 {sourceBlockId}
            </p>
          )}
          {error === null ? null : (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={saving || title.trim() === ""} onClick={() => void handlePromote()}>
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
