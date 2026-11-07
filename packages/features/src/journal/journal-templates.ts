import {
  editorContentFromDocument,
  markdownToEditorDocument,
  type TiptapJsonNode,
} from "@dailyflow/editor";
import { createUuidV7 } from "@dailyflow/shared";

export const JOURNAL_TEMPLATE_STORAGE_KEY = "dailyflow.journalTemplates.v1";

export interface JournalTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly markdown: string;
  readonly builtIn: boolean;
  readonly nameEn?: string;
  readonly descriptionEn?: string;
  readonly markdownEn?: string;
}

export interface JournalTemplateLibrary {
  readonly customTemplates: readonly JournalTemplate[];
  readonly recentTemplateIds: readonly string[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BUILT_IN_JOURNAL_TEMPLATES: readonly JournalTemplate[] = [
  {
    id: "daily",
    name: "日报",
    description: "整理今天完成、明天计划和需要协助的事项",
    nameEn: "Daily report",
    descriptionEn: "Capture what was completed, tomorrow's plan, and blockers",
    builtIn: true,
    markdown: [
      "## 今日完成",
      "",
      "- ",
      "",
      "## 明日计划",
      "",
      "- ",
      "",
      "## 风险与需要协助",
      "",
      "- ",
    ].join("\n"),
    markdownEn: [
      "## Completed today",
      "",
      "- ",
      "",
      "## Plan for tomorrow",
      "",
      "- ",
      "",
      "## Risks and support needed",
      "",
      "- ",
    ].join("\n"),
  },
  {
    id: "weekly",
    name: "周报",
    description: "按目标、进展、问题和下周安排快速回顾",
    nameEn: "Weekly report",
    descriptionEn: "Review goals, progress, issues, and next week's plan",
    builtIn: true,
    markdown: [
      "## 本周目标",
      "",
      "- ",
      "",
      "## 关键进展",
      "",
      "- ",
      "",
      "## 问题与风险",
      "",
      "- ",
      "",
      "## 下周安排",
      "",
      "- ",
    ].join("\n"),
    markdownEn: [
      "## Goals for this week",
      "",
      "- ",
      "",
      "## Key progress",
      "",
      "- ",
      "",
      "## Issues and risks",
      "",
      "- ",
      "",
      "## Plan for next week",
      "",
      "- ",
    ].join("\n"),
  },
  {
    id: "investigation",
    name: "问题排查",
    description: "保留现象、判断、处理过程与最终结论",
    nameEn: "Issue investigation",
    descriptionEn: "Keep the symptoms, reasoning, resolution, and final conclusion",
    builtIn: true,
    markdown: [
      "## 问题现象",
      "",
      "## 影响范围",
      "",
      "## 排查过程",
      "",
      "1. ",
      "",
      "## 根因",
      "",
      "## 处理结果",
      "",
      "## 后续改进",
      "",
      "- ",
    ].join("\n"),
    markdownEn: [
      "## Symptoms",
      "",
      "## Impact",
      "",
      "## Investigation",
      "",
      "1. ",
      "",
      "## Root cause",
      "",
      "## Resolution",
      "",
      "## Follow-up",
      "",
      "- ",
    ].join("\n"),
  },
  {
    id: "retrospective",
    name: "复盘",
    description: "从目标、结果、原因和行动四部分沉淀经验",
    nameEn: "Retrospective",
    descriptionEn: "Turn goals, outcomes, causes, and actions into reusable lessons",
    builtIn: true,
    markdown: [
      "## 目标",
      "",
      "## 实际结果",
      "",
      "## 做得好的地方",
      "",
      "- ",
      "",
      "## 可以改进的地方",
      "",
      "- ",
      "",
      "## 下一步行动",
      "",
      "- [ ] ",
    ].join("\n"),
    markdownEn: [
      "## Goal",
      "",
      "## Outcome",
      "",
      "## What went well",
      "",
      "- ",
      "",
      "## What could improve",
      "",
      "- ",
      "",
      "## Next actions",
      "",
      "- [ ] ",
    ].join("\n"),
  },
];

const EMPTY_LIBRARY: JournalTemplateLibrary = {
  customTemplates: [],
  recentTemplateIds: [],
};

function isTemplate(value: unknown): value is JournalTemplate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<JournalTemplate>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.markdown === "string" &&
    candidate.builtIn === false
  );
}

export function loadJournalTemplateLibrary(storage?: StorageLike): JournalTemplateLibrary {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (target === undefined) {
    return EMPTY_LIBRARY;
  }

  try {
    const raw = target.getItem(JOURNAL_TEMPLATE_STORAGE_KEY);
    if (raw === null) {
      return EMPTY_LIBRARY;
    }
    const parsed = JSON.parse(raw) as {
      readonly customTemplates?: unknown;
      readonly recentTemplateIds?: unknown;
    };
    return {
      customTemplates: Array.isArray(parsed.customTemplates)
        ? parsed.customTemplates.filter(isTemplate)
        : [],
      recentTemplateIds: Array.isArray(parsed.recentTemplateIds)
        ? parsed.recentTemplateIds.filter((id): id is string => typeof id === "string").slice(0, 8)
        : [],
    };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function saveJournalTemplateLibrary(
  library: JournalTemplateLibrary,
  storage?: StorageLike,
): void {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (target === undefined) {
    return;
  }

  target.setItem(
    JOURNAL_TEMPLATE_STORAGE_KEY,
    JSON.stringify({
      customTemplates: library.customTemplates,
      recentTemplateIds: library.recentTemplateIds,
    }),
  );
}

export function createCustomJournalTemplate(input: {
  readonly name: string;
  readonly description: string;
  readonly markdown: string;
}): JournalTemplate {
  return {
    id: `custom-${createUuidV7()}`,
    name: input.name.trim(),
    description: input.description.trim(),
    markdown: input.markdown,
    builtIn: false,
  };
}

export function markRecentJournalTemplate(
  recentTemplateIds: readonly string[],
  templateId: string,
): readonly string[] {
  return [templateId, ...recentTemplateIds.filter((id) => id !== templateId)].slice(0, 8);
}

export function journalTemplateEditorContent(template: JournalTemplate): TiptapJsonNode {
  return editorContentFromDocument(markdownToEditorDocument(template.markdown).doc);
}

export function localizeJournalTemplate(
  template: JournalTemplate,
  locale: "zh-CN" | "en-US",
): JournalTemplate {
  if (locale !== "en-US" || template.builtIn === false) {
    return template;
  }

  return {
    ...template,
    name: template.nameEn ?? template.name,
    description: template.descriptionEn ?? template.description,
    markdown: template.markdownEn ?? template.markdown,
  };
}
