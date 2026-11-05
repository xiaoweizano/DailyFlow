# DailyFlow 可用性、编辑体验与桌面发布增强设计

**日期：** 2026-11-05

**状态：** 已确认，可进入实施

**范围：** V1 桌面端、Web 共享能力、测试与 Windows 未签名候选构建

## 1. 背景

DailyFlow 已完成工程初始化、本地存储、日志、任务、知识库、搜索、分析、导入导出和桌面候选构建的第一轮实现。当前版本可以运行，但在真实安装包验收中暴露出以下问题：

- 新建待办失败，导出、备份和恢复被误报为“本地存储暂时不可用”。
- 桌面端关闭窗口后直接退出，没有常驻托盘。
- 设置页信息密度不足，控件溢出，缺少启动、语言、主题和存储位置等设置。
- 编辑器缺少成熟的 Markdown 快捷输入、块操作、表格和图片能力，编辑器高度也没有利用可用空间。
- 热力图只有滚动周视图，缺少年份、月份、星期和键盘导航。
- 知识库入口和来源关系不清晰，应用内没有可操作的使用说明。
- 分析页切换周期后未保存的报告草稿丢失。
- Windows 与 macOS 构建、桌面自动化、发布产物需要形成稳定、可重复的交付链路。

本设计只解决上述可用性、稳定性和 V1 交付问题，不改变“本地优先、Tiptap JSON 为权威内容、Repository 隔离存储”的既定架构。

## 2. 目标与成功标准

### 2.1 总目标

1. 修复阻断核心数据操作的问题，保证日志、待办、导入、导出、备份和恢复可完整走通。
2. 将桌面端变成符合日常使用预期的常驻应用，并补全基本设置。
3. 将编辑器提升到支持结构化内容、Markdown 快捷输入、块操作、表格、图片、公式、Mermaid 和版本历史的可用水平。
4. 让知识沉淀、全年活动回顾、周期报告和帮助中心形成可发现的完整工作流。
5. 保持 Windows、macOS 与 Web 的共享边界，建立可重复的自动化测试和 Windows 未签名候选包。

### 2.2 用户可见验收标准

- 新建无截止日期或带合法截止日期的待办均能成功保存，合法日期必须通过日期选择器输入。
- 导出、备份、恢复和 TXT 导入不再把可恢复错误统一显示为“本地存储暂时不可用”；成功路径在桌面端真实写盘。
- 用户点击窗口关闭按钮时，应用隐藏到系统托盘；托盘菜单至少提供“打开 DailyFlow”“设置”和“退出”，只有明确选择“退出”才结束进程。
- 设置页按“常规、外观、编辑、数据与存储、关于”分区；所有控件在 1024px 及以上窗口和缩小页面中不溢出。
- 用户可以设置开机自启、静默启动、关闭时最小化到托盘、语言、主题、密度、字号、周起始日、自动保存间隔和历史保留策略。
- 桌面端可以备份当前数据后迁移到用户选择的存储目录；迁移失败时保留原数据并继续使用原目录。
- 编辑器支持 `## 标题` 和 `##　标题`（全角空格）快捷输入，代码块中的同样文本不得触发标题转换。
- 编辑器区域占满日志页可用高度；工具栏、正文、大纲和状态栏不会互相遮挡。
- 编辑器支持块拖拽、Slash 菜单、右侧大纲、图片、表格、Markdown 导入导出、代码高亮、KaTeX、Mermaid 和版本历史。
- 知识库支持手动新建、整篇日志沉淀和结构化块沉淀；沉淀内容是快照，来源链接可以回到原日志或块。
- 应用内帮助中心包含中文和英文离线 Markdown 文档，并可从顶栏和各空状态进入。
- 活动热力图展示所选自然年的完整 53×7 网格，包含月份、星期、图例、年份切换和键盘导航；任务到期仅用角标表示，不改变按日志数量着色的规则。
- 分析页切换周、月、年或前后周期时，未保存的报告标题和正文草稿不会丢失，并在返回后继续自动保存。
- `main` 推送后运行 CI、E2E 和 Windows 候选工作流；候选产物包含未签名 NSIS 安装包、便携 EXE、`BUILD-INFO.txt` 和 `SHA256SUMS`，但不创建标签或 Release。

## 3. 非目标

- 不实现云同步、账号体系、协作、服务端后端或同步服务器。
- 不实现完整 AI 写作、聊天或向量检索；只保留既有 AI Provider 接口和“未配置”状态。
- 不提供 Linux 正式安装包。
- 不将月目录 TXT 批量导入替换为单篇 Markdown 导入。
- 不引入运行时 i18n 框架；V1 使用类型化消息字典和 `Intl`。
- 不实现 Windows 代码签名、macOS 公证或自动更新；这些属于发布阶段后续工作。
- 不增加标签体系、双向链接图、插件市场或其他超出当前 V1 范围的知识管理功能。

## 4. 当前缺口与根因

### 4.1 待办保存

- `createTask` 生成的新任务 `revision` 为 `0`。
- `TaskSaveCommandDtoSchema` 直接复用响应 DTO，响应 DTO 要求 `revision >= 1`，导致新任务在 IPC 命令边界被拒绝。
- 修复必须拆分写入 DTO 和响应 DTO：写入允许 `revision >= 0`，响应仍要求已保存实体 `revision >= 1`。
- 日期字段应使用日期选择器并生成 `YYYY-MM-DD`，不接受本地化日期文本透传。

### 4.2 导出、备份和恢复

- Tauri capability 只声明了 `dialog:allow-open`，前端调用保存对话框时被权限拒绝。
- 应增加最小范围的 `dialog:allow-save`，不授予无关文件系统权限。
- 基础设施层不得把所有错误折叠成 `STORAGE_UNAVAILABLE`。稳定应用错误码和用户可读消息必须保留，未知错误才映射为通用存储错误。

### 4.3 TXT 导入

- 导入向导、预览和提交链路需要端到端验证以下状态：会话创建、会话版本、命令序列化、`begin_commit`、批次事务、快照字段和失败回滚。
- 任何失败都必须保留批次前状态；增量导入以规范化日期、原始内容哈希和来源文件指纹判定重复。
- 失败文件不影响已成功检查的文件，但一个已开始提交的批次必须原子完成或回滚。

### 4.4 桌面生命周期

- 当前窗口关闭事件会销毁窗口并退出进程。
- 应把“隐藏窗口”和“退出应用”建模为不同命令。托盘恢复复用现有主窗口，不创建多个日常窗口。
- 静默启动与开机自启是两个独立设置：开机自启决定是否随系统启动，静默启动决定启动后是否显示窗口。

### 4.5 设置

- 当前设置页主要由线性表单组成，密度效果只影响少量间距。
- 当前主题开关旋钮可超出轨道，缺少一致焦点态、禁用态和可访问标签。
- 当前偏好 JSON 没有显式版本和向后迁移入口。

### 4.6 编辑器

- 当前 Markdown 快捷输入未把全角空格识别为 Markdown 语义分隔。
- 编辑器高度依赖内容自然高度，导致下方大面积空白。
- 现有能力不足以支持块拖拽、Slash 菜单、大纲、图片、表格、Markdown 文档导入导出、代码高亮、公式、Mermaid 和版本历史。

### 4.7 分析与热力图

- 周期切换会改变路由和 `ReportEditor` 的 `key`，父页面重新加载模型，未提交草稿被覆盖。
- 热力图固定展示以结束日期为基准的 12 周，缺少自然年、月份和星期上下文。

### 4.8 知识库与帮助

- 知识项来源字段已存在，但 UI 没有完整展示来源，也没有从日志和结构化块形成清晰入口。
- 缺少应用内帮助文档，首次使用者无法理解任务、知识沉淀、导入和报告流程。

## 5. 分层与数据流

### 5.1 依赖方向

```text
UI (React, Tiptap, Zustand)
  -> Application (use cases, commands, view models)
    -> Domain (entities, value objects, invariants, ports)

Infrastructure (Tauri/SQLite, Dexie/IndexedDB, filesystem)
  -> implements Domain/Application ports

apps/desktop, apps/web
  -> composition roots only
```

- Domain 不得导入 React、Tauri、Dexie、SQLite 或浏览器文件 API。
- Application 通过端口调用存储、时钟、ID、附件、导入导出和设置存储。
- 桌面端与 Web 端共享 Domain、Application、Editor schema、UI 和功能组件。
- 平台差异在 composition root 注入，不进入业务条件分支。

### 5.2 持久化边界

- 日志、知识、任务、报告、版本、搜索索引和结构化块保存在 SQLite 或 IndexedDB。
- Tiptap JSON 是正文权威数据；Markdown 和纯文本是可重建投影。
- 附件二进制不进入主数据库 BLOB；桌面端存储在应用附件目录，Web 端存储在 Dexie 附件表。数据库只保存附件元数据和内容哈希。
- 自动保存通过一个协调器串行化：收集编辑器最新模型 -> 构建快照 -> 保存 -> 更新 revision -> 刷新搜索索引与版本。
- 保存冲突返回稳定冲突错误，不静默覆盖较高 revision。

### 5.3 平台能力端口

```ts
export interface DesktopLifecyclePort {
  hideToTray(): Promise<void>;
  quit(): Promise<void>;
  setAutostart(enabled: boolean): Promise<void>;
  isAutostartEnabled(): Promise<boolean>;
}

export interface DataLocationPort {
  currentLocation(): Promise<string | null>;
  chooseDirectory(): Promise<string | null>;
  migrateData(targetDirectory: string): Promise<DataMigrationResult>;
}

export interface FileDialogPort {
  openFiles(options: OpenFileOptions): Promise<readonly SelectedFile[]>;
  saveFile(options: SaveFileOptions): Promise<SaveFileResult>;
}
```

Web 端对不可用桌面能力返回类型化 `CAPABILITY_UNAVAILABLE`，UI 显示解释和替代路径，不伪造成功。

## 6. 数据可靠性与错误处理

### 6.1 DTO 约定

- 响应 DTO 表示已持久化实体，`revision >= 1`。
- 写入 DTO 表示待保存实体，新实体 `revision === 0`，更新实体 `revision >= 0`。
- 命令使用 `expectedRevision`：新建为 `null`，更新为当前正整数 revision。
- Zod schema、Rust serde 结构、DTO fixture 和前端调用必须同步修改。

### 6.2 错误映射

- Application 定义稳定错误码，例如 `DIALOG_CANCELLED`、`PERMISSION_DENIED`、`STORAGE_UNAVAILABLE`、`INVALID_INPUT`、`CONFLICT`、`IMPORT_FAILED`。
- Infrastructure 保留 `PortError.code` 与 cause；只有无法识别的底层错误才映射为 `STORAGE_UNAVAILABLE`。
- UI 对取消操作不显示红色错误；对权限、冲突和校验错误给出不同恢复动作。

### 6.3 导入原子性

- 预览阶段只读取并校验，不写正式日志。
- 提交开始时锁定导入会话版本。
- 每个批次在单一数据库事务内写入日志、结构化块、搜索文档、版本和来源记录。
- 批次失败回滚整个批次，并把失败文件记录为可重试状态。
- 最终统计区分 `imported`、`skipped_duplicate`、`invalid_encoding`、`parse_error` 和 `write_failed`。

## 7. 桌面生命周期与托盘

### 7.1 窗口行为

- 主窗口关闭请求默认 `preventDefault` 并隐藏窗口。
- 设置 `closeToTray=false` 时允许关闭并按平台退出。
- 显式“退出”使用独立标志跳过拦截并终止进程。
- 恢复窗口时若窗口存在则 `show`、`unminimize`、`set_focus`；若被系统销毁则重建主窗口。

### 7.2 托盘菜单

托盘菜单使用中文、英文两套类型化标签：

```text
打开 DailyFlow / Open DailyFlow
设置 / Settings
---
退出 / Quit
```

双击托盘默认恢复主窗口。托盘图标与安装包图标使用同一资产源。

### 7.3 启动

- 开机自启使用 Tauri 官方 autostart 插件能力，不直接编辑操作系统注册表或 LaunchAgent。
- 静默启动只在由系统触发启动时隐藏窗口；用户手动启动时默认显示。
- macOS 使用平台标准登录项机制，Windows 使用当前用户级启动项。
- 关闭托盘图标后不得留下不可恢复的后台进程。

## 8. 设置与偏好模型

### 8.1 分区

设置页采用左侧分类导航和右侧内容面板：

- 常规：语言、周起始日、关闭到托盘、开机自启、静默启动。
- 外观：明暗主题、主题强调色、密度、正文字号。
- 编辑：自动保存间隔、默认编辑器宽度、是否显示大纲。
- 数据与存储：当前数据目录、迁移目录、历史版本保留、数据健康检查。
- 关于：版本、运行平台、开源许可、构建信息、用户手册入口。

窄屏时分类导航变为顶部横向标签，内容保持单列。

### 8.2 偏好 schema

```ts
export const UserPreferencesV2Schema = z.object({
  schemaVersion: z.literal(2).default(2),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  accent: z.enum(["blue", "green", "amber", "rose", "neutral"]).default("blue"),
  density: z.enum(["comfortable", "compact", "spacious"]).default("comfortable"),
  editorFontSize: z.number().int().min(13).max(20).default(15),
  editorWidth: z.enum(["focused", "wide"]).default("wide"),
  showOutline: z.boolean().default(true),
  autosaveIntervalMs: z.number().int().min(200).max(10_000).default(800),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  showWarnings: z.boolean().default(true),
  closeToTray: z.boolean().default(true),
  autostart: z.boolean().default(false),
  silentStart: z.boolean().default(false),
  customDataDirectory: z.string().min(1).nullable().default(null),
  historyRetention: HistoryRetentionSchema.default({
    maxVersions: 100,
    maxAgeDays: 180,
  }),
});
```

V1 迁移规则：读取到无 `schemaVersion` 的旧偏好时补齐默认值，保留原有兼容字段；写回后变为版本 2。非法字段回退到该项默认值，不让整份设置页失败。

### 8.3 密度、主题与可访问性

- 根元素使用 `data-density`、`data-theme`、`data-accent` 和 `data-editor-width`。
- 密度必须同时影响控件高度、表单行间距、卡片内边距、列表行高和设置导航间距。
- 开关由原生 checkbox 驱动，旋钮使用固定轨道和 `translate` 状态，不允许越界。
- 所有控件提供可见焦点环、禁用态、键盘操作和至少 44×44px 的触控目标。
- 主题强调色只改变交互强调和选中态，不破坏危险、成功和警告语义色。

### 8.4 自定义数据目录

- 桌面端迁移流程：选择空目录或 DailyFlow 专用子目录 -> 创建完整备份 -> 健康检查 -> 关闭数据库连接 -> 原子复制数据库、附件和必要元数据 -> 校验记录数与哈希 -> 写入新目录设置 -> 重新打开数据库。
- 目标目录包含其他 DailyFlow 数据时禁止覆盖，必须由用户选择“使用已有目录”或取消。
- 迁移失败时删除不完整临时副本，回滚设置，继续使用原目录。
- Web 端显示“浏览器管理存储位置”，不提供伪目录选择。

## 9. 编辑器设计

### 9.1 权威内容与版本

- Tiptap JSON 是唯一权威内容。
- 每次 schema 变更递增 `EDITOR_SCHEMA_VERSION`。
- 保存时记录 JSON、schema 版本、Markdown 投影、纯文本投影、投影版本和内容哈希。
- 读取旧版本时运行幂等迁移；迁移不得删除未知 node、mark 或 attribute。无法识别的节点作为 `unknown` 占位保留原始 JSON。
- Markdown 导入转换为 Tiptap JSON 后保存；Markdown 导出和纯文本只由 JSON 投影，不反向独立写回数据库。
- Tiptap JSON 与 Markdown 冲突时 JSON 获胜，不执行自动双向合并。

### 9.2 快捷输入

- Markdown 输入规则识别 `#` 到 `######` 后的半角空格或全角空格。
- 输入 `## 标题` 或 `##　标题` 后转换为二级标题。
- 规则仅在普通段落起始位置生效，代码块、行内代码、表格单元格和已有标题内不转换。
- 输入规则使用 ProseMirror transaction 完成，不通过 DOM 后处理修改内容。

### 9.3 编辑器布局

- 日志页采用 `min-height: 0` 的纵向 flex/grid，编辑器占据剩余高度。
- 正文滚动发生在编辑器内容容器，工具栏和保存状态保持可见。
- 右侧大纲在宽度不足 1100px 时折叠为抽屉。
- 工具栏与正文使用统一密度 token；快捷键帮助通过图标按钮打开。

### 9.4 阶段二和阶段三能力

以下能力一次交付，但按包内独立模块组织：

- 块拖拽：基于 Tiptap DragHandle 扩展，显示块手柄并支持拖动排序。
- Slash 菜单：输入 `/` 打开命令菜单，至少包含标题、列表、引用、代码块、表格、图片、公式和 Mermaid。
- 大纲：从标题节点生成，可点击滚动到对应位置，与编辑器选择同步高亮。
- 图片和附件：支持选择本地文件、拖放和粘贴；显示上传状态，失败可重试。
- 表格：支持增删行列、表头切换和对齐。
- Markdown 导入导出：单篇文档导入导出，扩展名 `.md`；图片以附件引用处理，缺失图片给出警告。
- 代码高亮：按语言名称加载本地语法，不访问 CDN。
- 公式：行内和块级 KaTeX，编辑态与阅读态一致。
- Mermaid：块级图表，带源码视图、渲染错误提示和明确的安全限制。
- 版本历史：列出历史版本、查看 Markdown/纯文本投影、恢复为新 revision；恢复前创建当前版本检查点。

新增 node 至少包括 `table`、`tableRow`、`tableHeader`、`tableCell`、`image`、`attachment`、`mathInline`、`mathBlock`、`mermaid`。不允许未知内容因解析失败而丢失。

### 9.5 附件

- `AttachmentPort.save(input)` 返回 `attachmentId`、URL、MIME、大小和内容哈希。
- 附件元数据挂在 owner 类型和 owner id 上；一个附件可被多个 owner link 引用。
- 删除 owner 时只软删除链接；无引用附件进入孤儿清理流程，不立即物理删除。
- 图片 MIME 白名单、大小上限和文件名净化在 Infrastructure 执行，Application 进行用户可读校验。

## 10. 知识库与帮助中心

### 10.1 知识来源

- 手动新建：用户直接填写类型、标题、正文、标签。
- 整篇日志沉淀：选择知识类型后复制日志当前 JSON 快照，保存来源 `sourceJournalId`。
- 结构化块沉淀：从未删除的块复制类型、schemaVersion 和 JSON，保存 `sourceJournalId` 与 `sourceBlockId`。
- 沉淀后编辑知识项不改变原日志；编辑原日志也不改变知识快照。
- 知识详情显示来源面包屑，可跳回原日志日期并聚焦来源块；来源被删除时显示“来源不可用”。
- 日志页和结构化块菜单提供“沉淀为知识”，成功后提供“打开知识项”和“查看来源”。

### 10.2 帮助中心

- 帮助内容以版本化 Markdown 文件作为唯一内容源，放在 `packages/features/src/help/content/<locale>/`。
- 构建时通过 Vite `?raw` 导入，不新增运行时 Markdown 内容服务。
- 帮助中心提供搜索、目录和 Markdown 安全渲染；链接只能跳转到内部帮助页或受控外链。
- 首版中文和英文内容一致，覆盖快速开始、日志编辑、任务、知识库、搜索、分析、导入导出、备份恢复、托盘与快捷键。
- 顶栏帮助图标、空状态和设置“关于”页提供入口。

## 11. 全年热力图

### 11.1 展示

- 默认年份为本地当前年，用户可切换前后年份或从年份菜单选择。
- 网格固定为 53 列 × 7 行，按设置中的周起始日排列。
- 左侧显示星期一、三、五或对应本地化标签；顶部在每月第一周显示月份。
- 颜色等级只由 `journalCount` 决定：0、1、2、3、4+。
- `taskDueCount > 0` 使用格子右上角小三角标记，不改变填色等级。
- 今天、选中日和键盘焦点使用独立边框，不通过颜色深浅混淆。

### 11.2 数据和缓存

- 年度视图一次请求 `[1 月 1 日, 12 月 31 日]` 的日期摘要。
- Application 提供 `getAnnualActivity(year, timezone)`，返回补齐空缺日期后的 ISO 日期数组和边界信息。
- UI 按 `year + timezone + weekStartsOn` 缓存年度数据；日志或任务变更通过统一数据版本使其失效。
- 查询必须限制最大日期跨度，防止任意大范围请求。

### 11.3 交互与可访问性

- 每个格子是可聚焦元素，左右键移动一天，上下键移动一周，PageUp/PageDown 移动一月，Home/End 到当前行首尾。
- Enter 打开当天日志，有任务时通过详情面板查看任务摘要。
- 焦点格子必须有可见文本或 live region 提示完整日期、日志数和任务数。
- 移动端允许横向滚动，但月份和星期标签保持可见。

## 12. 分析报告草稿

- 报告草稿以 `periodType + periodStart + periodEnd + timezone` 为稳定 key。
- 父级 `AnalyticsPage` 持有草稿协调器，切换周期不卸载协调器。
- 编辑器内容变化立即写入内存草稿；达到自动保存间隔后保存。
- 切换周期前强制 flush，保存失败则保留内存草稿并显示可重试状态。
- 返回同一周期时优先恢复内存草稿，其次读取数据库报告，最后生成统计草稿。
- 保存成功后清除对应内存草稿，并更新 revision。
- 关闭应用前触发 flush；无法完成时提示用户，不静默丢弃。

## 13. 测试策略

### 13.1 单元测试

- 待办写入 DTO 接受 revision 0，响应 DTO 拒绝 revision 0。
- 日期解析和非法日期校验。
- 端口错误映射保留 `DIALOG_CANCELLED`、`PERMISSION_DENIED` 和 `CONFLICT`。
- 偏好 v1 到 v2 迁移、非法字段回退和 JSON 兼容。
- Markdown 标题规则覆盖半角/全角空格、代码块和行内代码。
- JSON 到 Markdown/纯文本投影稳定，迁移幂等。
- 知识沉淀快照独立于来源修改。
- 年度热力图日期补齐、周排列、闰年和跨年。
- 报告草稿 key 和合并规则。

### 13.2 Application 与 Infrastructure 测试

- SQLite 任务 revision 0 写入后返回 revision 1。
- TXT 导入预览、增量重复、批次回滚和统计。
- 导出快照序列化、备份创建、恢复前校验和失败回滚。
- 数据目录迁移使用临时目录并校验失败回滚。
- 搜索索引在日志、知识、任务和结构化块变更后刷新。
- Dexie 与 SQLite Repository 合约测试使用同一套行为用例。

### 13.3 组件与可访问性测试

- 设置页各分区、控件边界、键盘操作和 1024px 布局。
- 日期选择器创建待办。
- 工具栏、Slash 菜单、大纲、表格和版本历史。
- 热力图标签、焦点移动、年份切换和任务角标。
- 分析周期切换保留未保存草稿。
- 使用 `@axe-core/playwright` 检查主要页面，无严重违规。

### 13.4 E2E

- Web：创建日志、自动保存、搜索、知识沉淀、任务、导入 Markdown、导出文件和恢复备份。
- Windows 桌面：通过 Tauri smoke/CDP 验证启动、日志保存、任务创建、设置持久化和窗口隐藏/托盘恢复。
- macOS 在 CI 可用时运行同一 Playwright Web 套件和 Rust 测试；签名安装验证留给发布阶段。

## 14. CI 与交付

### 14.1 必需工作流

- `ci.yml`：lint、format check、dependency cruise、DTO fixtures、unit tests、typecheck、build。
- `e2e.yml`：Web Playwright，使用固定时区和 locale。
- `candidate-desktop.yml`：Windows x64 未签名 NSIS 和 portable EXE。

### 14.2 候选产物

```text
DailyFlow_<version>_x64-unsigned-setup.exe
DailyFlow_<version>_x64-portable.exe
BUILD-INFO.txt
SHA256SUMS
```

`BUILD-INFO.txt` 至少记录 commit、ref、run id、构建时间和 `signature=unsigned manual test candidate`。工作流上传 artifact，保留 14 天。

### 14.3 发布边界

- 不以 `v*` 标签触发构建。
- 不自动创建 GitHub Release。
- 不发布到包管理器。
- 用户手动下载 artifact、校验 SHA256 后安装验证。

## 15. 实施顺序与提交边界

1. 数据可靠性和 IPC 合约：待办、错误映射、导出/备份 capability、导入提交。
2. 桌面生命周期、托盘、启动设置和设置页重构。
3. 偏好迁移、主题/语言/密度和存储目录迁移。
4. 编辑器 schema、快捷键、布局、块/Slash/大纲、图片/表格、Markdown、高亮、公式、Mermaid、版本历史。
5. 知识来源、帮助中心和导航入口。
6. 全年热力图、年度缓存和分析报告草稿。
7. E2E、可访问性、桌面 smoke、CI 和 Windows 候选包。

每个任务遵循失败测试 -> 最小实现 -> 针对性测试 -> 回归检查 -> Git 变更检查 -> 提交。无法在同一任务安全完成的数据迁移必须拆成“兼容读取”和“切换写入”两个提交。

## 16. 风险与缓解

- **Tiptap schema 扩展导致历史 JSON 丢失：** 迁移先补测试和 fixture，未知节点保留，schema 版本递增。
- **Mermaid 内容带来 XSS 风险：** 禁用 HTML labels，使用严格安全级别，错误只显示文本源码。
- **自定义数据目录迁移中断：** 先备份、复制到临时目录、双端校验，最后切换设置。
- **托盘和退出状态竞争：** 用单一 Rust 原子状态控制显式退出，窗口关闭事件只负责隐藏。
- **i18n 覆盖成本：** 只对用户可见界面建立类型化字典，日期和数字统一走 `Intl`。
- **E2E 依赖桌面环境：** 保留 Web 共享流程测试，桌面 smoke 只覆盖平台边界和关键持久化。
- **Web 不具备桌面能力：** 通过 capability detection 说明限制，不把能力缺失显示为存储损坏。

## 17. 完成定义

- 本规格中的用户可见验收标准均有自动化测试或明确的人工桌面验收步骤。
- `pnpm lint`、`pnpm format:check`、`pnpm depcruise`、`pnpm test`、`pnpm typecheck`、`pnpm build` 和 Playwright E2E 通过。
- Rust 测试通过，Windows 候选工作流成功生成四类产物。
- 规格、计划、README、操作手册和架构文档没有互相矛盾的平台或存储描述。
- 未提交 `.acceptance-fixtures/`、截图、`.superpowers/` 等本地验收文件。
