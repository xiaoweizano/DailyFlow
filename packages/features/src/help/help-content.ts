import manualEn from "./content/en-US/guide.md?raw";
import manualZh from "./content/zh-CN/guide.md?raw";

export type HelpLocale = "zh-CN" | "en-US";
export type HelpPageId =
  | "quick-start"
  | "journal"
  | "timeline"
  | "tasks"
  | "knowledge"
  | "search-analytics"
  | "data"
  | "settings"
  | "troubleshooting";

export type HelpTopicGroup =
  "start" | "journal" | "tasks" | "timeline" | "knowledge" | "data-settings";

export function resolveHelpPageId(value: string | undefined): HelpPageId {
  return helpSections["zh-CN"].some((section) => section.id === value)
    ? (value as HelpPageId)
    : "quick-start";
}

export function resolveOptionalHelpPageId(value: string | undefined): HelpPageId | null {
  return helpSections["zh-CN"].some((section) => section.id === value)
    ? (value as HelpPageId)
    : null;
}

export interface HelpSection {
  readonly id: HelpPageId;
  readonly title: string;
  readonly content: string;
}

export interface HelpTopicImage {
  readonly file: string;
  readonly alt: string;
  readonly caption: string;
}

export interface HelpTopic {
  readonly id: HelpPageId;
  readonly group: HelpTopicGroup;
  readonly title: string;
  readonly summary: string;
  readonly stepCount: number;
  readonly updatedAt: string;
  readonly image: HelpTopicImage;
}

export interface HelpInterfaceCopy {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly search: string;
  readonly searchHint: string;
  readonly allTopics: string;
  readonly fullManual: string;
  readonly backToCenter: string;
  readonly chapterContents: string;
  readonly steps: (count: number) => string;
  readonly updated: (date: string) => string;
  readonly searchResults: (count: number) => string;
  readonly noResults: string;
  readonly noResultsHint: string;
  readonly startTopic: string;
  readonly journal: string;
  readonly tasks: string;
  readonly timeline: string;
  readonly knowledge: string;
  readonly dataSettings: string;
}

export const helpManuals: Record<HelpLocale, string> = {
  "zh-CN": manualZh,
  "en-US": manualEn,
};

function splitSections(markdown: string): readonly HelpSection[] {
  const sections: HelpSection[] = [];
  let current: { id: HelpPageId; title: string; lines: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^## (.+?) \{#([^}]+)\}$/u.exec(line);
    if (heading !== null) {
      if (current !== null) {
        sections.push({
          id: current.id,
          title: current.title,
          content: current.lines.join("\n").trim(),
        });
      }
      current = {
        id: heading[2] as HelpPageId,
        title: heading[1] ?? "",
        lines: [],
      };
      continue;
    }

    current?.lines.push(line);
  }

  if (current !== null) {
    sections.push({
      id: current.id,
      title: current.title,
      content: current.lines.join("\n").trim(),
    });
  }

  return sections;
}

export const helpSections: Record<HelpLocale, readonly HelpSection[]> = {
  "zh-CN": splitSections(manualZh),
  "en-US": splitSections(manualEn),
};

const topicImages: Record<HelpLocale, Record<HelpPageId, HelpTopicImage>> = {
  "zh-CN": {
    "quick-start": {
      file: "quick-start.png",
      alt: "DailyFlow 工作台今日工作入口",
      caption: "从工作台打开今日日志或继续未完成的记录。",
    },
    journal: {
      file: "journal-template-flow.png",
      alt: "每日日志模板选择和正文编辑区",
      caption: "新日志先选择空白模板、最近模板或内置模板，再进入正文。",
    },
    timeline: {
      file: "timeline-year-picker.png",
      alt: "时间线年月快速选择面板",
      caption: "点击年份打开年月面板，可输入任意年份或选择今年、去年和前年。",
    },
    tasks: {
      file: "tasks-complete-reopen.png",
      alt: "待办完成和重新打开按钮",
      caption: "每条待办行尾始终提供明确的完成或重新打开按钮。",
    },
    knowledge: {
      file: "knowledge-create.png",
      alt: "知识库新建大尺寸编辑窗口",
      caption: "新建知识使用沉浸式编辑窗口，正文独立滚动，操作栏始终可见。",
    },
    "search-analytics": {
      file: "search-results.png",
      alt: "搜索页结果和索引状态",
      caption: "搜索覆盖日志、知识和待办；索引异常时页面会给出重建入口。",
    },
    data: {
      file: "data-backup.png",
      alt: "数据页完整备份和恢复入口",
      caption: "完整备份包含数据库、历史版本和附件，是恢复时的首选。",
    },
    settings: {
      file: "settings-appearance.png",
      alt: "设置中的主题、强调色和密度选项",
      caption: "外观选项直接平铺展示，不依赖带滚动条的原生选择器。",
    },
    troubleshooting: {
      file: "settings-appearance.png",
      alt: "设置页故障排查入口",
      caption: "先检查保存状态、数据目录和字段提示，再决定是否重建或恢复。",
    },
  },
  "en-US": {
    "quick-start": {
      file: "quick-start.png",
      alt: "DailyFlow workbench with today's work entries",
      caption: "Start today's journal or continue recent work from the workbench.",
    },
    journal: {
      file: "journal-template-flow.png",
      alt: "Journal template picker and document editing area",
      caption:
        "A new journal starts with a blank, recent, or built-in template before the document opens.",
    },
    timeline: {
      file: "timeline-year-picker.png",
      alt: "Timeline year and month quick picker",
      caption: "Open the year picker to enter any year or jump to this, last, or two years ago.",
    },
    tasks: {
      file: "tasks-complete-reopen.png",
      alt: "Task complete and reopen buttons",
      caption: "Every task row keeps a visible Complete or Reopen action.",
    },
    knowledge: {
      file: "knowledge-create.png",
      alt: "Large knowledge creation dialog",
      caption: "The immersive knowledge editor scrolls only its body and keeps actions visible.",
    },
    "search-analytics": {
      file: "search-results.png",
      alt: "Search results and index state",
      caption:
        "Search covers journals, knowledge, and tasks, with a rebuild entry when the index is stale.",
    },
    data: {
      file: "data-backup.png",
      alt: "Full backup and restore controls on the data page",
      caption: "A full backup contains the database, revision history, and attachments.",
    },
    settings: {
      file: "settings-appearance.png",
      alt: "Theme, accent, and density controls in Settings",
      caption: "Appearance choices are shown directly without a scrolling native selector.",
    },
    troubleshooting: {
      file: "settings-appearance.png",
      alt: "Settings entry for troubleshooting checks",
      caption: "Check save state, data directory, and field errors before rebuilding or restoring.",
    },
  },
};

const topics: Record<HelpLocale, readonly HelpTopic[]> = {
  "zh-CN": [
    {
      id: "quick-start",
      group: "start",
      title: "第一次打开 DailyFlow",
      summary: "认识工作台、今日日志和本地数据边界，完成第一轮记录。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"]["quick-start"],
    },
    {
      id: "journal",
      group: "journal",
      title: "创建并编辑每日日志",
      summary: "从模板开始，使用正文工具栏、当前行加号和大纲完成记录。",
      stepCount: 6,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].journal,
    },
    {
      id: "tasks",
      group: "tasks",
      title: "创建、完成和重新打开待办",
      summary: "填写标题和截止日期，并在列表行内完成、恢复或编辑待办。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].tasks,
    },
    {
      id: "timeline",
      group: "timeline",
      title: "使用时间线",
      summary: "快速切换年月，查看月历、时间线和年度活动热力图。",
      stepCount: 4,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].timeline,
    },
    {
      id: "knowledge",
      group: "knowledge",
      title: "新建知识并追踪来源",
      summary: "手动创建知识，或从整篇日志和结构化块沉淀独立快照。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].knowledge,
    },
    {
      id: "search-analytics",
      group: "data-settings",
      title: "搜索记录与查看分析",
      summary: "跨日志、知识和待办检索，并检查每周、每月和年度节奏。",
      stepCount: 4,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"]["search-analytics"],
    },
    {
      id: "data",
      group: "data-settings",
      title: "备份、恢复和迁移数据",
      summary: "创建完整备份、导入旧记录，并在恢复后检查搜索索引。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].data,
    },
    {
      id: "settings",
      group: "data-settings",
      title: "设置语言、外观和关闭行为",
      summary: "立即切换语言，直接选择主题与密度，并配置窗口关闭方式。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].settings,
    },
    {
      id: "troubleshooting",
      group: "data-settings",
      title: "排查保存和同步状态",
      summary: "根据字段提示、保存状态和本地数据边界定位常见失败原因。",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["zh-CN"].troubleshooting,
    },
  ],
  "en-US": [
    {
      id: "quick-start",
      group: "start",
      title: "Open DailyFlow for the first time",
      summary: "Learn the workbench, today's journal, and local data boundary.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"]["quick-start"],
    },
    {
      id: "journal",
      group: "journal",
      title: "Create and edit a daily journal",
      summary: "Choose a template, edit with the block insert menu, and use the outline.",
      stepCount: 6,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].journal,
    },
    {
      id: "tasks",
      group: "tasks",
      title: "Create, complete, and reopen tasks",
      summary: "Add a title and due date, then complete, reopen, or edit from the row.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].tasks,
    },
    {
      id: "timeline",
      group: "timeline",
      title: "Use the timeline",
      summary: "Jump across years and inspect the calendar, timeline, and annual heatmap.",
      stepCount: 4,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].timeline,
    },
    {
      id: "knowledge",
      group: "knowledge",
      title: "Create knowledge and track its source",
      summary: "Create knowledge manually or promote a whole journal or selected block.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].knowledge,
    },
    {
      id: "search-analytics",
      group: "data-settings",
      title: "Search records and review analytics",
      summary: "Find journals, knowledge, and tasks, then review weekly or annual activity.",
      stepCount: 4,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"]["search-analytics"],
    },
    {
      id: "data",
      group: "data-settings",
      title: "Back up, restore, and move data",
      summary: "Create a full backup, import old entries, and check search after a restore.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].data,
    },
    {
      id: "settings",
      group: "data-settings",
      title: "Set language, appearance, and close behavior",
      summary: "Switch language immediately, choose appearance directly, and configure close.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].settings,
    },
    {
      id: "troubleshooting",
      group: "data-settings",
      title: "Troubleshoot saves and local state",
      summary: "Use field errors, save state, and local data boundaries to recover.",
      stepCount: 5,
      updatedAt: "2026-11-07",
      image: topicImages["en-US"].troubleshooting,
    },
  ],
};

export const helpTopics: Record<HelpLocale, readonly HelpTopic[]> = topics;

export const helpInterface: Record<HelpLocale, HelpInterfaceCopy> = {
  "zh-CN": {
    eyebrow: "本地操作指引",
    title: "DailyFlow 帮助中心",
    description: "按当前任务找到步骤、截图和恢复办法。所有内容随应用离线提供。",
    search: "搜索帮助",
    searchHint: "搜索标题、步骤、按钮名称或错误提示",
    allTopics: "全部主题",
    fullManual: "查看完整手册",
    backToCenter: "返回帮助中心",
    chapterContents: "本章目录",
    steps: (count) => `${count} 个步骤`,
    updated: (date) => `更新于 ${date}`,
    searchResults: (count) => `${count} 条匹配结果`,
    noResults: "没有找到匹配的帮助内容",
    noResultsHint: "试试“完成待办”“选择模板”“年份”或“保存失败”。",
    startTopic: "快速开始",
    journal: "日志",
    tasks: "待办",
    timeline: "时间线",
    knowledge: "知识库",
    dataSettings: "数据与设置",
  },
  "en-US": {
    eyebrow: "Offline field guide",
    title: "DailyFlow Help Center",
    description: "Find the steps, screenshots, and recovery path for the task in front of you.",
    search: "Search help",
    searchHint: "Search titles, steps, button names, or error messages",
    allTopics: "All topics",
    fullManual: "View full manual",
    backToCenter: "Back to Help Center",
    chapterContents: "Chapter contents",
    steps: (count) => `${count} step${count === 1 ? "" : "s"}`,
    updated: (date) => `Updated ${date}`,
    searchResults: (count) => `${count} matching result${count === 1 ? "" : "s"}`,
    noResults: "No matching help content",
    noResultsHint: "Try “complete task”, “choose template”, “year”, or “save failed”.",
    startTopic: "Get started",
    journal: "Journals",
    tasks: "Tasks",
    timeline: "Timeline",
    knowledge: "Knowledge",
    dataSettings: "Data and settings",
  },
};

export interface HelpChapterHeading {
  readonly id: string;
  readonly title: string;
}

export function getHelpTopic(locale: HelpLocale, id: HelpPageId): HelpTopic | undefined {
  return helpTopics[locale].find((topic) => topic.id === id);
}

export function getHelpSection(locale: HelpLocale, id: HelpPageId): HelpSection | undefined {
  return helpSections[locale].find((section) => section.id === id);
}

export function getHelpChapterHeadings(section: HelpSection): readonly HelpChapterHeading[] {
  const headings: HelpChapterHeading[] = [];
  for (const line of section.content.split(/\r?\n/u)) {
    const match = /^###\s+(.+)$/u.exec(line);
    if (match === null) {
      continue;
    }
    headings.push({
      id: `${section.id}-section-${headings.length + 1}`,
      title: match[1] ?? "",
    });
  }
  return headings;
}

export function prepareHelpChapterMarkdown(section: HelpSection): string {
  let headingIndex = 0;
  return section.content
    .split(/\r?\n/u)
    .map((line) => {
      if (!/^###\s+/u.test(line)) {
        return line;
      }
      headingIndex += 1;
      return `${line} {#${section.id}-section-${headingIndex}}`;
    })
    .join("\n");
}

export function searchHelp(locale: HelpLocale, query: string): readonly HelpSection[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) {
    return [];
  }

  return helpSections[locale].filter((section) => {
    const topic = getHelpTopic(locale, section.id);
    return `${topic?.title ?? ""}\n${topic?.summary ?? ""}\n${section.title}\n${section.content}`
      .toLocaleLowerCase()
      .includes(normalized);
  });
}
