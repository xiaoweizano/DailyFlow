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
import { useAppText } from "../preferences/use-app-text.js";
import { knowledgeKindOptions } from "./knowledge-labels.js";
import { knowledgeErrorMessage } from "./knowledge-services.js";

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
  const text = useAppText();
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
    const fallback = text(
      "保存到知识库失败，请重试",
      "Failed to save to the knowledge base. Try again.",
    );
    try {
      const result = await services.knowledge.promote({
        journalId: journal.id,
        ...(sourceBlockId === undefined || sourceBlockId === null ? {} : { sourceBlockId }),
        kind,
        title: title.trim(),
      });
      if (!result.ok) {
        setError(knowledgeErrorMessage(result.error, fallback));
        return;
      }
      onPromoted?.(result.value);
      onOpenChange(false);
    } catch (caught) {
      setError(knowledgeErrorMessage(caught, fallback));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="knowledge-promotion-description"
        className="h-[min(72vh,620px)] max-w-[720px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0"
        scroll="none"
        size="immersive"
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{text("保存为知识", "Save as knowledge")}</DialogTitle>
          <DialogDescription id="knowledge-promotion-description">
            {text(
              "保留原日志和结构化块来源，生成可独立维护的知识条目。",
              "Keep the source journal and structured block while creating independently maintainable knowledge.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 content-start gap-4 overflow-y-auto p-6">
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
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          {sourceBlockId === undefined || sourceBlockId === null ? (
            <p className="border border-border bg-surface-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {text(
                "将整篇日志保存为独立知识快照。",
                "Save the complete journal as an independent knowledge snapshot.",
              )}
            </p>
          ) : (
            <p className="break-all border border-border bg-surface-muted/60 px-3 py-2 font-mono text-[10px] text-muted-foreground">
              {text(`来源块 ${sourceBlockId}`, `Source block ${sourceBlockId}`)}
            </p>
          )}
          {error === null ? null : (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-0 border-t border-border px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {text("取消", "Cancel")}
          </Button>
          <Button disabled={saving || title.trim() === ""} onClick={() => void handlePromote()}>
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
