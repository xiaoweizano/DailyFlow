import { parseEntityId, type EntityId } from "@dailyflow/domain";
import { jsonToPlainText, type TiptapJsonNode } from "@dailyflow/editor";
import { ArrowLeft, ExternalLink, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAppServices } from "../app-services-hooks.js";
import type { KnowledgeDetail } from "./knowledge-services.js";

const kindLabels = {
  note: "笔记",
  issue: "问题",
  solution: "方案",
  decision: "决策",
  reference: "参考",
} as const;

export function KnowledgeDetailPage(): React.JSX.Element {
  const services = useAppServices();
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
      setError("知识条目编号无效");
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
          setError(result === null ? "知识条目不存在" : null);
        }
      })
      .catch(() => {
        if (active) {
          setDetail(null);
          setError("知识条目加载失败");
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
  }, [id, services.knowledge]);

  if (loading) {
    return (
      <div role="status" className="flex min-h-72 items-center justify-center gap-2 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
        正在加载知识条目
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="p-6">
        <div role="alert" className="border border-danger/25 bg-danger/5 px-4 py-3 text-sm">
          {error ?? "知识条目不存在"}
        </div>
        <Link
          to="/knowledge"
          className="mt-4 inline-flex h-9 items-center justify-center gap-2 border border-transparent px-3.5 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回知识库
        </Link>
      </div>
    );
  }

  const { item, sourceJournalDate } = detail;
  const plainText = jsonToPlainText(item.content.doc as TiptapJsonNode);

  return (
    <article className="mx-auto min-h-full w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <Link
        to="/knowledge"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        返回知识库
      </Link>

      <header className="mt-5 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary">
            {kindLabels[item.kind]}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">r{item.revision}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            更新于 {item.updatedAt.slice(0, 10)}
          </span>
        </div>
        <h1 className="mt-3 break-words text-2xl font-semibold text-foreground">{item.title}</h1>
        {item.summary ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
        ) : null}
      </header>

      <div className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
        {plainText || "该知识条目没有正文。"}
      </div>

      {sourceJournalDate === null ? null : (
        <aside className="mt-8 border-t border-border pt-5">
          <p className="text-xs font-semibold text-foreground">来源</p>
          <Link
            to={`/journal/${sourceJournalDate}`}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            原始日志 · {sourceJournalDate}
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
          {item.sourceBlockId === null ? null : (
            <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
              来源块 {item.sourceBlockId}
            </p>
          )}
        </aside>
      )}
    </article>
  );
}
