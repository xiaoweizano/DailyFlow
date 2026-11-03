import type { ContentDocument, JsonObject } from "@dailyflow/domain";

import type { AnalyticsSummary } from "../queries/analytics-query.js";

export interface ReportDraft {
  readonly title: string;
  readonly content: ContentDocument;
  readonly stats: JsonObject;
}

function periodLabel(summary: AnalyticsSummary): string {
  const suffix =
    summary.period.periodType === "week"
      ? "周报"
      : summary.period.periodType === "month"
        ? "月报"
        : "年度总结";
  return `${summary.period.start} 至 ${summary.period.end} ${suffix}`;
}

function paragraph(text: string): JsonObject {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

export function generateReportDraft(summary: AnalyticsSummary): ReportDraft {
  const title = periodLabel(summary);
  const tagText =
    summary.activeTags.length === 0
      ? "活跃标签：无"
      : `活跃标签：${summary.activeTags.map((tag) => `${tag.name} (${tag.count})`).join("、")}`;
  const content = [
    paragraph("统计周期：" + `${summary.period.start} 至 ${summary.period.end}`),
    paragraph(`时区：${summary.period.timezone}`),
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "工作概览" }],
    },
    paragraph(
      `记录 ${summary.journalDays} 天，共 ${summary.journalCount} 篇，约 ${summary.characterCount} 字。`,
    ),
    paragraph(`完成任务 ${summary.tasksCompleted} 个，新增知识条目 ${summary.knowledgeItems} 条。`),
    paragraph(`问题记录 ${summary.issuesCreated} 条，解决方案 ${summary.solutionsCreated} 条。`),
    paragraph(tagText),
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "回顾与下一步" }],
    },
    paragraph("补充本周的关键进展、阻塞和下一步计划。"),
  ];
  const stats: JsonObject = {
    periodType: summary.period.periodType,
    periodStart: summary.period.start,
    periodEnd: summary.period.end,
    timezone: summary.period.timezone,
    journalDays: summary.journalDays,
    journalCount: summary.journalCount,
    characterCount: summary.characterCount,
    tasksCompleted: summary.tasksCompleted,
    issuesCreated: summary.issuesCreated,
    solutionsCreated: summary.solutionsCreated,
    knowledgeItems: summary.knowledgeItems,
    activeTags: summary.activeTags.map((tag) => ({ name: tag.name, count: tag.count })),
  };

  return {
    title,
    content: {
      schemaVersion: 1,
      doc: {
        type: "doc",
        content,
      },
    },
    stats,
  };
}
