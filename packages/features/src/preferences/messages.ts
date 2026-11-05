import type { LocalePreference } from "@dailyflow/application";

export interface SettingsMessages {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly loading: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly warningTitle: string;
  readonly categoriesLabel: string;
  readonly categories: {
    readonly general: string;
    readonly appearance: string;
    readonly editor: string;
    readonly data: string;
    readonly about: string;
  };
  readonly general: {
    readonly title: string;
    readonly description: string;
    readonly language: string;
    readonly languageDescription: string;
    readonly startup: string;
    readonly startupDescription: string;
    readonly autostart: string;
    readonly autostartDescription: string;
    readonly silentStart: string;
    readonly silentStartDescription: string;
    readonly closeToTray: string;
    readonly closeToTrayDescription: string;
    readonly warnings: string;
    readonly warningsDescription: string;
  };
  readonly appearance: {
    readonly title: string;
    readonly description: string;
    readonly theme: string;
    readonly themeDescription: string;
    readonly system: string;
    readonly light: string;
    readonly dark: string;
    readonly accent: string;
    readonly accentDescription: string;
    readonly density: string;
    readonly densityDescription: string;
    readonly comfortable: string;
    readonly compact: string;
    readonly spacious: string;
    readonly blue: string;
    readonly green: string;
    readonly amber: string;
    readonly rose: string;
    readonly neutral: string;
  };
  readonly editor: {
    readonly title: string;
    readonly description: string;
    readonly fontSize: string;
    readonly width: string;
    readonly widthDescription: string;
    readonly focused: string;
    readonly wide: string;
    readonly outline: string;
    readonly outlineDescription: string;
    readonly autosave: string;
    readonly autosaveDescription: string;
    readonly weekStart: string;
    readonly weekStartDescription: string;
  };
  readonly data: {
    readonly title: string;
    readonly description: string;
    readonly storage: string;
    readonly storageDescription: string;
    readonly browserStorage: string;
    readonly defaultLocation: string;
    readonly history: string;
    readonly historyDescription: string;
    readonly maxVersions: string;
    readonly maxAgeDays: string;
  };
  readonly about: {
    readonly title: string;
    readonly description: string;
    readonly runtime: string;
    readonly desktopRuntime: string;
    readonly webRuntime: string;
    readonly storage: string;
    readonly version: string;
    readonly localOnly: string;
    readonly localOnlyDescription: string;
  };
}

const zhCN: SettingsMessages = {
  eyebrow: "Device preferences",
  title: "设置",
  description: "管理当前设备的界面、编辑、数据位置和可选扩展。设置只保存在本机。",
  loading: "正在读取本机设置",
  save: "保存设置",
  saving: "正在保存",
  saved: "设置已保存",
  warningTitle: "设置未能完全保存",
  categoriesLabel: "设置分类",
  categories: {
    general: "常规",
    appearance: "外观",
    editor: "编辑器",
    data: "数据",
    about: "关于",
  },
  general: {
    title: "常规",
    description: "选择界面语言，并控制 DailyFlow 在桌面上的启动与关闭行为。",
    language: "界面语言",
    languageDescription: "切换后立即预览语言，点击“保存设置”后持久化。",
    startup: "启动与后台",
    startupDescription: "这些选项只影响 Windows 与 macOS 桌面端。",
    autostart: "开机自启",
    autostartDescription: "登录系统后自动启动 DailyFlow。",
    silentStart: "静默启动",
    silentStartDescription: "开机启动时只保留托盘入口，不主动显示主窗口。",
    closeToTray: "关闭到托盘",
    closeToTrayDescription: "点击关闭按钮时隐藏窗口，而不退出应用。",
    warnings: "显示设置提示",
    warningsDescription: "读取或保存异常时显示可恢复提示。",
  },
  appearance: {
    title: "外观",
    description: "调整主题、强调色与界面密度，所有修改会即时预览。",
    theme: "主题",
    themeDescription: "跟随系统，或固定为浅色、深色。",
    system: "系统",
    light: "浅色",
    dark: "深色",
    accent: "强调色",
    accentDescription: "用于主要按钮、选中状态和焦点提示。",
    density: "密度",
    densityDescription: "控制列表、工具栏和设置行的信息间距。",
    comfortable: "舒适",
    compact: "紧凑",
    spacious: "宽松",
    blue: "蓝色",
    green: "绿色",
    amber: "琥珀",
    rose: "玫红",
    neutral: "中性",
  },
  editor: {
    title: "编辑器",
    description: "设置正文阅读尺寸、内容宽度、大纲和自动保存节奏。",
    fontSize: "编辑器字号",
    width: "编辑器宽度",
    widthDescription: "聚焦宽度适合长文阅读，宽屏模式利用更多横向空间。",
    focused: "聚焦",
    wide: "宽屏",
    outline: "显示文档大纲",
    outlineDescription: "根据标题生成右侧文档目录。",
    autosave: "自动保存间隔（毫秒）",
    autosaveDescription: "允许 200 到 10000 毫秒；停止输入后再合并保存。",
    weekStart: "每周起始日",
    weekStartDescription: "影响日历、周报和时间线分组。",
  },
  data: {
    title: "数据与存储",
    description: "查看数据位置、历史保留策略和当前平台的存储边界。",
    storage: "存储位置",
    storageDescription: "DailyFlow 默认使用操作系统管理的应用数据目录。",
    browserStorage: "浏览器存储位置由浏览器管理，可通过导出与备份迁移数据。",
    defaultLocation: "默认应用数据目录",
    history: "历史版本保留",
    historyDescription: "同时应用数量和天数上限，达到任一上限后按策略清理。",
    maxVersions: "最多保留版本数",
    maxAgeDays: "最长保留天数",
  },
  about: {
    title: "关于与扩展",
    description: "查看运行环境、本地存储信息、快捷键和可选 AI 扩展边界。",
    runtime: "运行环境",
    desktopRuntime: "桌面端",
    webRuntime: "Web 浏览器",
    storage: "数据存储",
    version: "版本",
    localOnly: "仅保存在当前设备",
    localOnlyDescription: "V1 不包含云同步。所有数据通过共享 Repository 边界保存在本机。",
  },
};

const enUS: SettingsMessages = {
  ...zhCN,
  title: "Settings",
  description: "Manage this device's interface, editor, data location, and optional extensions.",
  loading: "Loading device settings",
  save: "Save settings",
  saving: "Saving",
  saved: "Settings saved",
  warningTitle: "Some settings could not be saved",
  categoriesLabel: "Settings categories",
  categories: {
    general: "General",
    appearance: "Appearance",
    editor: "Editor",
    data: "Data",
    about: "About",
  },
  general: {
    ...zhCN.general,
    title: "General",
    description: "Choose the interface language and control desktop startup and close behavior.",
    language: "Interface language",
    languageDescription: "The language changes immediately and is saved with the settings.",
    startup: "Startup and background",
    startupDescription: "These options only affect the Windows and macOS desktop apps.",
    autostart: "Start with system",
    autostartDescription: "Launch DailyFlow after you sign in.",
    silentStart: "Silent startup",
    silentStartDescription: "Start in the tray without opening the main window.",
    closeToTray: "Close to tray",
    closeToTrayDescription: "Hide the window instead of quitting when closing it.",
    warnings: "Show settings warnings",
    warningsDescription: "Show recoverable messages when settings cannot be read or saved.",
  },
  appearance: {
    ...zhCN.appearance,
    title: "Appearance",
    description: "Adjust the theme, accent color, and interface density with a live preview.",
    theme: "Theme",
    themeDescription: "Follow the system or use a fixed light or dark theme.",
    system: "System",
    light: "Light",
    dark: "Dark",
    accent: "Accent",
    accentDescription: "Used for primary actions, selections, and focus states.",
    density: "Density",
    densityDescription: "Control the spacing in lists, toolbars, and settings rows.",
    comfortable: "Comfortable",
    compact: "Compact",
    spacious: "Spacious",
    blue: "Blue",
    green: "Green",
    amber: "Amber",
    rose: "Rose",
    neutral: "Neutral",
  },
  editor: {
    ...zhCN.editor,
    title: "Editor",
    description: "Set text size, content width, outline visibility, and autosave timing.",
    fontSize: "Editor font size",
    width: "Editor width",
    widthDescription: "Focused width is best for long reading; wide uses more horizontal space.",
    focused: "Focused",
    wide: "Wide",
    outline: "Show document outline",
    outlineDescription: "Generate a document outline from headings.",
    autosave: "Autosave interval (ms)",
    autosaveDescription: "Use 200 to 10000 milliseconds; saves are merged after typing stops.",
    weekStart: "Week starts on",
    weekStartDescription: "Affects the calendar, weekly reports, and timeline grouping.",
  },
  data: {
    ...zhCN.data,
    title: "Data and storage",
    description: "Review data location, history retention, and platform storage boundaries.",
    storage: "Storage location",
    storageDescription: "DailyFlow uses the operating system application-data directory by default.",
    browserStorage: "The browser manages storage; use export and backup to move data.",
    defaultLocation: "Default application-data directory",
    history: "History retention",
    historyDescription: "Both limits apply; versions are removed when either limit is reached.",
    maxVersions: "Maximum versions",
    maxAgeDays: "Maximum age in days",
  },
  about: {
    ...zhCN.about,
    title: "About and extensions",
    description: "Review the runtime, local storage, shortcuts, and optional AI boundaries.",
    runtime: "Runtime",
    desktopRuntime: "Desktop",
    webRuntime: "Web browser",
    storage: "Data storage",
    version: "Version",
    localOnly: "Stored on this device only",
    localOnlyDescription:
      "V1 does not include cloud sync. Data stays local through the shared Repository boundary.",
  },
};

const settingsMessages: Record<LocalePreference, SettingsMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getSettingsMessages(locale: LocalePreference): SettingsMessages {
  return settingsMessages[locale];
}
