import dataEn from "./content/en-US/data.md?raw";
import journalEn from "./content/en-US/journal.md?raw";
import knowledgeEn from "./content/en-US/knowledge.md?raw";
import quickStartEn from "./content/en-US/quick-start.md?raw";
import tasksEn from "./content/en-US/tasks.md?raw";
import dataZh from "./content/zh-CN/data.md?raw";
import journalZh from "./content/zh-CN/journal.md?raw";
import knowledgeZh from "./content/zh-CN/knowledge.md?raw";
import quickStartZh from "./content/zh-CN/quick-start.md?raw";
import tasksZh from "./content/zh-CN/tasks.md?raw";

export type HelpLocale = "zh-CN" | "en-US";
export type HelpPageId = "quick-start" | "journal" | "tasks" | "knowledge" | "data";

export interface HelpPage {
  readonly id: HelpPageId;
  readonly title: string;
  readonly description: string;
  readonly content: string;
}

export const helpPages: Record<HelpLocale, readonly HelpPage[]> = {
  "zh-CN": [
    {
      id: "quick-start",
      title: "快速开始",
      description: "从第一次记录到备份数据",
      content: quickStartZh,
    },
    {
      id: "journal",
      title: "每日日志",
      description: "编辑、组织与恢复日志",
      content: journalZh,
    },
    {
      id: "tasks",
      title: "任务",
      description: "创建、安排和完成任务",
      content: tasksZh,
    },
    {
      id: "knowledge",
      title: "知识库",
      description: "从日志沉淀可复用经验",
      content: knowledgeZh,
    },
    {
      id: "data",
      title: "数据管理",
      description: "导入、导出、备份与恢复",
      content: dataZh,
    },
  ],
  "en-US": [
    {
      id: "quick-start",
      title: "Quick Start",
      description: "From the first entry to your first backup",
      content: quickStartEn,
    },
    {
      id: "journal",
      title: "Daily Journal",
      description: "Write, organize, and restore entries",
      content: journalEn,
    },
    {
      id: "tasks",
      title: "Tasks",
      description: "Create, schedule, and complete tasks",
      content: tasksEn,
    },
    {
      id: "knowledge",
      title: "Knowledge Base",
      description: "Turn journal entries into reusable knowledge",
      content: knowledgeEn,
    },
    {
      id: "data",
      title: "Data Management",
      description: "Import, export, back up, and restore",
      content: dataEn,
    },
  ],
};

export function resolveHelpPageId(value: string | undefined): HelpPageId {
  return helpPages["zh-CN"].some((page) => page.id === value)
    ? (value as HelpPageId)
    : "quick-start";
}
