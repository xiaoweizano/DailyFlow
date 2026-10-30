export type AppModuleId =
  "dashboard" | "journal" | "timeline" | "knowledge" | "tasks" | "search" | "analytics" | "data";

export interface AppModule {
  id: AppModuleId;
  label: string;
  eyebrow: string;
  description: string;
  path: string;
}

export interface AppRouteOptions {
  platform: "desktop" | "web";
  storageLabel: string;
  version: string;
}

export const appModules = [
  {
    id: "dashboard",
    label: "工作台",
    eyebrow: "Dashboard",
    description: "今天的工作入口与近期动态。",
    path: "/",
  },
  {
    id: "journal",
    label: "每日日志",
    eyebrow: "Daily Journal",
    description: "按日期记录工作、问题和解决过程。",
    path: "/journal/:date",
  },
  {
    id: "timeline",
    label: "时间线",
    eyebrow: "Timeline",
    description: "回顾工作节奏与持续记录。",
    path: "/timeline",
  },
  {
    id: "knowledge",
    label: "知识库",
    eyebrow: "Knowledge Base",
    description: "沉淀可复用的经验、问题和方案。",
    path: "/knowledge",
  },
  {
    id: "tasks",
    label: "待办",
    eyebrow: "Tasks",
    description: "保持轻量、可执行的个人任务清单。",
    path: "/tasks",
  },
  {
    id: "search",
    label: "搜索",
    eyebrow: "Search",
    description: "在日志、知识和任务中快速定位。",
    path: "/search",
  },
  {
    id: "analytics",
    label: "分析",
    eyebrow: "Analytics",
    description: "汇总周、月和年度的记录脉络。",
    path: "/analytics",
  },
  {
    id: "data",
    label: "数据",
    eyebrow: "Data Management",
    description: "管理导入、导出、备份和恢复。",
    path: "/data",
  },
] as const satisfies ReadonlyArray<AppModule>;

export const mainNavigation = appModules;

export const routePaths = {
  dashboard: "/",
  journal: "/journal/:date",
  timeline: "/timeline",
  timelineDate: "/timeline/:date",
  knowledge: "/knowledge",
  knowledgeItem: "/knowledge/:id",
  tasks: "/tasks",
  search: "/search",
  analytics: "/analytics",
  analyticsPeriod: "/analytics/:periodType/:start",
  data: "/data",
  settings: "/settings",
} as const;
