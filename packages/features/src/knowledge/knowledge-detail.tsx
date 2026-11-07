import { parseEntityId, type EntityId } from "@dailyflow/domain";
import { jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import { useAppText } from "../preferences/use-app-text.js";
import { knowledgeKindLabel } from "./knowledge-labels.js";
import type { KnowledgeDetail } from "./knowledge-services.js";
import { KnowledgeSourceLink } from "./knowledge-source-link.js";

export function KnowledgeDetailPage(): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const { id } = useParams();
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    if (id === undefined) {
      setDetail(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    let entityId: EntityId;
    try {
      entityId = parseEntityId(id);
    } catch {
      setDetail(null);
      setError(text("知识条目编号无效", "Invalid knowledge item ID"));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void services.knowledge
      .get(entityId)
      .then((result) => {
        if (active) {
          setDetail(result);
          setError(result === null ? text("知识条目不存在", "Knowledge item not found") : null);
        }
      })
      .catch(() => {
        if (active) {
          setDetail(null);
          setError(text("知识条目加载失败", "Failed to load the knowledge item"));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, services.knowledge, text]);

  if (loading) {
    return (
      <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
        {text("正在加载知识条目", "Loading knowledge item")}
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="p-6">
        <div role="alert" className="border border-danger/25 bg-danger/5 px-4 py-3 text-sm">
          {error ?? text("知识条目不存在", "Knowledge item not found")}
        </div>
        <Link
          to="/knowledge"
          className="mt-4 inline-flex h-9 items-center justify-center gap-2 border border-transparent px-3.5 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {text("返回知识库", "Back to knowledge base")}
        </Link>
      </div>
    );
  }

  const { item, sourceJournalAvailable, sourceJournalDate } = detail;
  const plainText = jsonToPlainText(item.content.doc as TiptapJsonNode);

  return (
    <article className="mx-auto min-h-full w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <Link
        to="/knowledge"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        {text("返回知识库", "Back to knowledge base")}
      </Link>

      <header className="mt-5 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary">
            {knowledgeKindLabel(item.kind, text)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">r{item.revision}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {text(
              `更新于 ${item.updatedAt.slice(0, 10)}`,
              `Updated ${item.updatedAt.slice(0, 10)}`,
            )}
          </span>
        </div>
        <h1 className="mt-3 break-words text-2xl font-semibold text-foreground">{item.title}</h1>
        {item.summary ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
        ) : null}
      </header>

      <div className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
        {plainText || text("该知识条目没有正文。", "This knowledge item has no body.")}
      </div>

      {item.sourceJournalId === null ? null : (
        <KnowledgeSourceLink
          sourceJournalDate={sourceJournalDate}
          sourceJournalAvailable={sourceJournalAvailable}
          sourceBlockId={item.sourceBlockId}
        />
      )}
    </article>
  );
}
