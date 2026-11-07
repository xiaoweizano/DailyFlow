import type { LocalePreference } from "@dailyflow/application";

import type { AppModuleId } from "../app-modules.js";

export interface AppMessages {
  readonly shell: {
    readonly skipToContent: string;
    readonly primaryNavigation: string;
    readonly breadcrumb: string;
    readonly searchLabel: string;
    readonly helpCenter: string;
    readonly openTodayJournal: string;
    readonly localDataReady: string;
    readonly localFirst: string;
    readonly settings: string;
    readonly help: string;
  };
  readonly navigation: Record<AppModuleId, string>;
  readonly moduleDescriptions: Record<AppModuleId, string>;
  readonly dashboard: {
    readonly eyebrow: string;
    readonly title: string;
    readonly continue: string;
    readonly openTodayJournal: string;
    readonly loading: string;
    readonly errorTitle: string;
    readonly errorDescription: string;
    readonly retry: string;
    readonly sidebarLabel: string;
    readonly recentKnowledge: string;
    readonly noRecentKnowledge: string;
    readonly recentKnowledgeDescription: string;
    readonly openKnowledge: string;
    readonly today: string;
    readonly noJournalTitle: string;
    readonly noJournalDescription: string;
    readonly createFirstJournal: string;
    readonly importTxt: string;
    readonly defaultJournalTitle: string;
    readonly noJournalBody: string;
    readonly continueJournal: string;
    readonly retrySave: string;
    readonly todayTasks: string;
    readonly noTasks: string;
    readonly noTasksDescription: string;
    readonly viewAllTasks: string;
    readonly heatmapEyebrow: string;
    readonly heatmapTitle: string;
    readonly heatmapPeriod: string;
    readonly heatmapEmpty: string;
    readonly heatmapLabel: string;
    readonly journalCount: (date: string, count: number) => string;
    readonly journalCountTitle: (date: string, count: number) => string;
    readonly recentNotesEyebrow: string;
    readonly recentNotesTitle: string;
    readonly noRecentJournals: string;
    readonly untitledJournal: string;
    readonly noExcerpt: string;
  };
  readonly help: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly search: string;
    readonly contents: string;
    readonly noResults: string;
    readonly sectionCount: (count: number) => string;
    readonly backToTop: string;
  };
}

const zhCN: AppMessages = {
  shell: {
    skipToContent: "跳到主要内容",
    primaryNavigation: "主导航",
    breadcrumb: "面包屑",
    searchLabel: "搜索日志、知识和任务",
    helpCenter: "帮助中心",
    openTodayJournal: "打开今日日志",
    localDataReady: "本地数据已就绪",
    localFirst: "本地优先",
    settings: "设置",
    help: "帮助",
  },
  navigation: {
    dashboard: "工作台",
    journal: "每日日志",
    timeline: "时间线",
    knowledge: "知识库",
    tasks: "待办",
    search: "搜索",
    analytics: "分析",
    data: "数据",
  },
  moduleDescriptions: {
    dashboard: "今天的工作入口与近期动态。",
    journal: "按日期记录工作、问题和解决过程。",
    timeline: "回顾工作节奏与持续记录。",
    knowledge: "沉淀可复用的经验、问题和方案。",
    tasks: "保持轻量、可执行的个人任务清单。",
    search: "在日志、知识和任务中快速定位。",
    analytics: "汇总周、月和年度的记录脉络。",
    data: "管理导入、导出、备份和恢复。",
  },
  dashboard: {
    eyebrow: "Daily workspace",
    title: "工作台",
    continue: "从当前记录继续推进",
    openTodayJournal: "打开今日日志",
    loading: "正在加载工作台",
    errorTitle: "工作台加载失败",
    errorDescription: "无法读取本地日志，请检查存储状态后重试。",
    retry: "重试",
    sidebarLabel: "工作台侧栏",
    recentKnowledge: "最近知识",
    noRecentKnowledge: "暂无最近知识",
    recentKnowledgeDescription: "从日志沉淀的问题与解决方案会出现在这里。",
    openKnowledge: "打开知识库",
    today: "今天",
    noJournalTitle: "今天还没有记录",
    noJournalDescription: "从一段简短的记录开始，把今天的工作、问题和解决过程留在本地。",
    createFirstJournal: "创建第一篇日志",
    importTxt: "导入历史 TXT",
    defaultJournalTitle: "今天的日志",
    noJournalBody: "今天的日志还没有正文。",
    continueJournal: "继续记录今天",
    retrySave: "重试保存",
    todayTasks: "今日待办",
    noTasks: "没有待办事项",
    noTasksDescription: "今天没有待处理任务，可以把注意力留给正在推进的工作。",
    viewAllTasks: "查看全部待办",
    heatmapEyebrow: "Consistency",
    heatmapTitle: "记录热力图",
    heatmapPeriod: "过去 12 周",
    heatmapEmpty: "过去 12 周还没有记录",
    heatmapLabel: "过去 12 周日志热力图",
    journalCount: (date, count) => `${date} 有 ${count} 篇日志`,
    journalCountTitle: (date, count) => `${date} · ${count} 篇日志`,
    recentNotesEyebrow: "Recent notes",
    recentNotesTitle: "最近记录",
    noRecentJournals: "最近还没有日志记录",
    untitledJournal: "无标题日志",
    noExcerpt: "暂无摘要",
  },
  help: {
    eyebrow: "Offline manual",
    title: "DailyFlow 使用手册",
    description: "一份完整、可搜索的本地手册，覆盖日志、模板、待办、知识、时间线、数据与设置。",
    search: "搜索帮助",
    contents: "手册目录",
    noResults: "没有找到匹配的章节。",
    sectionCount: (count) => `${count} 个章节`,
    backToTop: "回到顶部",
  },
};

const enUS: AppMessages = {
  shell: {
    skipToContent: "Skip to main content",
    primaryNavigation: "Primary navigation",
    breadcrumb: "Breadcrumb",
    searchLabel: "Search journals, knowledge, and tasks",
    helpCenter: "Help center",
    openTodayJournal: "Open today's journal",
    localDataReady: "Local data ready",
    localFirst: "Local first",
    settings: "Settings",
    help: "Help",
  },
  navigation: {
    dashboard: "Workbench",
    journal: "Daily Journal",
    timeline: "Timeline",
    knowledge: "Knowledge Base",
    tasks: "Tasks",
    search: "Search",
    analytics: "Analytics",
    data: "Data",
  },
  moduleDescriptions: {
    dashboard: "Today's work entry point and recent activity.",
    journal: "Record work, problems, and decisions by date.",
    timeline: "Review your work cadence and continuous notes.",
    knowledge: "Keep reusable experience, problems, and solutions.",
    tasks: "Maintain a lightweight, actionable personal task list.",
    search: "Find journal entries, knowledge, and tasks quickly.",
    analytics: "Summarize weekly, monthly, and yearly activity.",
    data: "Manage imports, exports, backups, and restore.",
  },
  dashboard: {
    eyebrow: "Daily workspace",
    title: "Workbench",
    continue: "Continue from today's work",
    openTodayJournal: "Open today's journal",
    loading: "Loading workbench",
    errorTitle: "Workbench failed to load",
    errorDescription: "Local journals could not be read. Check storage and try again.",
    retry: "Try again",
    sidebarLabel: "Workbench sidebar",
    recentKnowledge: "Recent knowledge",
    noRecentKnowledge: "No recent knowledge",
    recentKnowledgeDescription: "Problems and solutions saved from journals will appear here.",
    openKnowledge: "Open knowledge base",
    today: "Today",
    noJournalTitle: "No entry for today yet",
    noJournalDescription:
      "Start a short entry to keep today's work, problems, and decisions locally.",
    createFirstJournal: "Create the first journal",
    importTxt: "Import legacy TXT",
    defaultJournalTitle: "Today's journal",
    noJournalBody: "Today's journal has no content yet.",
    continueJournal: "Continue today's journal",
    retrySave: "Retry save",
    todayTasks: "Today's tasks",
    noTasks: "No tasks",
    noTasksDescription: "Nothing is pending today. Keep your attention on the work in progress.",
    viewAllTasks: "View all tasks",
    heatmapEyebrow: "Consistency",
    heatmapTitle: "Activity heatmap",
    heatmapPeriod: "Last 12 weeks",
    heatmapEmpty: "No entries in the last 12 weeks",
    heatmapLabel: "Journal activity heatmap for the last 12 weeks",
    journalCount: (date, count) => `${date} has ${count} journal${count === 1 ? "" : "s"}`,
    journalCountTitle: (date, count) => `${date} · ${count} journal${count === 1 ? "" : "s"}`,
    recentNotesEyebrow: "Recent notes",
    recentNotesTitle: "Recent entries",
    noRecentJournals: "No recent journal entries",
    untitledJournal: "Untitled journal",
    noExcerpt: "No excerpt",
  },
  help: {
    eyebrow: "Offline manual",
    title: "DailyFlow User Manual",
    description:
      "A complete, searchable local guide covering journals, templates, tasks, knowledge, timeline, data, and settings.",
    search: "Search help",
    contents: "Manual contents",
    noResults: "No matching sections.",
    sectionCount: (count) => `${count} section${count === 1 ? "" : "s"}`,
    backToTop: "Back to top",
  },
};

const messages: Record<LocalePreference, AppMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getAppMessages(locale: LocalePreference): AppMessages {
  return messages[locale];
}
