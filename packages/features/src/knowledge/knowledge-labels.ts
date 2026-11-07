import type { KnowledgeKind } from "@dailyflow/domain";

import type { AppText } from "../preferences/use-app-text.js";

const labels: Record<KnowledgeKind, readonly [zhCN: string, enUS: string]> = {
  note: ["笔记", "Note"],
  issue: ["问题", "Issue"],
  solution: ["方案", "Solution"],
  decision: ["决策", "Decision"],
  reference: ["参考", "Reference"],
};

export function knowledgeKindLabel(kind: KnowledgeKind, text: AppText): string {
  const [zhCN, enUS] = labels[kind];
  return text(zhCN, enUS);
}

export function knowledgeKindOptions(text: AppText): ReadonlyArray<{
  readonly label: string;
  readonly value: KnowledgeKind;
}> {
  return (Object.keys(labels) as KnowledgeKind[]).map((kind) => ({
    label: knowledgeKindLabel(kind, text),
    value: kind,
  }));
}
