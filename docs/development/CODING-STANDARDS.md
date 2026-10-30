# DailyFlow 编码规范

## 1. 适用范围

本文约束 DailyFlow V1 的 TypeScript、React、Rust、SQL、测试和文档代码。规范的核心不是统一排版，而是保护以下数据属性：

- 正文只有 Tiptap JSON 一个权威来源。
- Domain 和 Application 不依赖具体平台或存储。
- 保存、导入、恢复和附件关联具有明确事务边界。
- Windows、macOS、Web 的行为差异只出现在适配器和组合根。
- 用户数据在失败、迁移和并发场景下不会静默丢失。

格式化细节由 Prettier、ESLint、`cargo fmt` 和 CI 执行；本文不重复工具能够自动处理的问题。

## 2. 包与依赖边界

### 2.1 允许的依赖方向

```text
apps/*
  -> features
  -> infrastructure
  -> editor
  -> application
  -> domain
  -> shared

features -> application, domain, editor, ui, shared
application -> domain -> shared
editor      -> domain -> shared
infrastructure -> application, domain, shared
sync-contracts -> shared
ai -> application ports, shared
ui -> shared
```

规则：

- `domain` 不依赖 React、Tauri、Dexie、SQLite、浏览器 API、文件系统或网络。
- `application` 只定义端口并编排用例，不导入 `apps/*`、`infrastructure` 或 `ai` 的具体实现。
- `infrastructure` 不在包根导出平台专用模块。Tauri 入口只从 `@dailyflow/infrastructure/desktop` 导出，Dexie 入口只从 `@dailyflow/infrastructure/web` 导出。
- `ui` 不导入 Repository、Application 用例、Tauri 或 Dexie。
- `editor` 不直接读写数据库，只接收和生成普通数据对象。
- `features` 承载跨端页面和功能状态，只通过注入的 `AppServices` 调用 Application；不导入任一具体 adapter。
- `apps/*` 是组合根，唯一允许同时知道用例与具体适配器的位置，不承载共享业务页面。
- 禁止通过相对路径跨包导入源码；使用 `@dailyflow/*` 公共导出。
- 禁止在 `features` 页面中根据 `isTauri` 选择存储实现；平台差异在 `createDesktopServices()` 或 `createWebServices()` 完成。

新增跨包依赖必须同时更新 `package.json`、依赖巡航规则和 ADR。仅因“方便”而扩大公共 API 不允许。

### 2.2 公共 API

每个包只从 `src/index.ts` 或声明的子入口导出稳定 API。以下内容默认不导出：

- 数据库行类型。
- Dexie store 对象。
- Tauri command 字符串常量。
- 内部文件系统路径。
- 仅为包内复用而存在的辅助函数。

公共导出新增即视为契约变更，调用方可能跨端使用。删除或重命名公共类型必须有迁移说明。

## 3. TypeScript 规则

### 3.1 类型安全

- 开启 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride`、`exactOptionalPropertyTypes`。
- 禁止新增裸 `any`。外部输入先声明为 `unknown`，经 Zod 或显式类型守卫校验。
- 不使用类型断言掩盖缺失校验；`as` 只用于已验证的边界转换，并在相邻位置说明验证来源。
- 业务状态使用可判别联合和稳定字符串码，不用布尔组合表达互斥状态。
- 导出函数必须有明确返回类型；局部短函数可依赖推断。
- 对象可选字段与“字段存在但值为空”必须区分，避免 `undefined` 与 `null` 混用。

```ts
const SaveJournalInputSchema = z.object({
  journalId: EntityIdSchema,
  journalDate: LocalDateSchema,
  contentJson: JsonDocumentSchema,
  expectedRevision: z.number().int().positive().nullable(),
  editorSchemaVersion: z.number().int().positive(),
  projectionVersion: z.number().int().positive(),
});

type SaveJournalInput = z.infer<typeof SaveJournalInputSchema>;
```

Zod Schema 是运行时边界，不能代替 Domain 不变量。校验顺序为：DTO 形状 -> ID/日期/大小 -> Domain 状态规则 -> Repository 并发规则。

### 3.2 命名

- 类型、接口、React 组件：`PascalCase`。
- 函数、变量、属性：`camelCase`。
- 常量仅用于稳定配置或协议值：`UPPER_SNAKE_CASE`。
- 布尔值使用 `is`、`has`、`can`、`should` 前缀。
- 异步命令使用动词开头，如 `saveJournal`、`commitImport`、`rebuildSearchIndex`。
- 数据库列使用 `snake_case`，Tauri payload 字段使用 `camelCase`，映射必须显式。
- 文件名使用 kebab-case；React 组件文件跟随仓库统一模式后不得混用。
- 禁止 `data`、`item`、`manager`、`helper` 作为跨模块公共名称；局部短作用域可以使用。

### 3.3 模块和函数

- 一个模块只有一个主要变化原因。文件开始明显承担多个独立职责时拆分。
- 用例函数接收显式依赖对象，不读取全局单例。
- 优先纯函数；IO 只出现在 Application 端口调用之后或 Infrastructure 实现中。
- 不修改输入对象。返回新值或明确命名的 mutable builder。
- 默认使用 `const` 和小函数。不要为了复用把三段不同业务拼成带多个布尔开关的“万能函数”。

## 4. Domain 与 Application

### 4.1 Domain

- 聚合根负责自身状态转换，不接受数据库行、HTTP DTO 或 React 状态。
- `Journal`、`KnowledgeItem`、`Task`、`ImportSession`、`Report` 的创建和修改通过领域函数完成。
- ID 比较按字符串相等，不使用数值排序语义。
- `revision` 只增不减；恢复旧内容也创建新 revision。
- 删除通过 `deletedAt` 语义表达，不在 UI 中把物理删除当默认行为。
- `LocalDate` 是 `YYYY-MM-DD` 的本地业务日期，不能由 UTC 字符串截断得到。
- 时间戳使用 UTC ISO 8601；格式化只发生在 UI 或导出边界。

### 4.2 Application

- 每个用例对应一个公开函数或类，例如 `saveJournal`、`importTxtBatch`、`restoreBackup`。
- 用例负责编排，不复制 Repository 中的查询逻辑。
- 跨多个表/store 的写操作必须调用一个业务级原子端口方法，不能由 UI 依次调用多个 `save`。
- 查询端口返回摘要 DTO，不泄漏数据库行或完整正文。
- 错误在 Application 映射为稳定 `AppError`，UI 不解析 SQLite、Dexie 或 Rust 原始错误。
- 用例测试必须使用内存适配器，不启动浏览器或 Tauri。

```ts
export async function saveJournal(
  deps: { journals: JournalRepository; clock: Clock },
  rawInput: unknown,
): Promise<Result<SavedJournalSnapshot, AppError>> {
  const parsed = SaveJournalInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return err({ code: "VALIDATION_ERROR", message: "日志输入无效" });
  }

  // 领域校验和持久化在这里编排，UI 不接触事务细节。
  return deps.journals.saveSnapshot(parsed.data);
}
```

## 5. ID、日期与版本

- 实体 ID 使用小写 UUIDv7 字符串，由应用层 `IdGenerator` 注入生成。
- 测试使用固定 Clock 和 ID factory，不依赖系统时间产生不稳定快照。
- `LocalDate` 必须通过共享解析器校验真实公历日期，包括闰年。
- “今天”由注入的 `Clock` 与用户时区计算，不在 Domain 调用 `new Date()`。
- UTC 时间保存到毫秒，统一带 `Z`，例如 `2026-10-30T03:20:11.123Z`。
- `editorSchemaVersion` 表示权威 JSON 结构；`projectionVersion` 表示派生字段规则；两者不可合并。
- 乐观并发使用 `expectedRevision`。更新为 `null` 表示仅创建，避免盲目 upsert 覆盖已有日志。

## 6. 错误与结果

- 可预期业务失败返回 `Result<T, AppError>` 或抛出明确 `AppException`，同一用例不得混用两种风格。
- 不可恢复的程序错误可以抛出，但基础设施必须在上报前映射为稳定原因码。
- 错误消息面向用户时不得包含 SQL、绝对路径、API Key、完整 Prompt 或正文。
- 每个错误说明是否可重试、是否保留编辑草稿、是否需要用户选择。
- 日志记录错误码和上下文 ID，不记录正文内容。
- `catch (error)` 中不假设 `error` 是 `Error`；先做类型收窄。

稳定错误码至少包括：

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
STORAGE_UNAVAILABLE
QUOTA_EXCEEDED
IMPORT_FAILED
MIGRATION_FAILED
BACKUP_INVALID
AI_UNAVAILABLE
```

## 7. 数据库与适配器

### 7.1 SQLite

- 所有 SQL 使用参数绑定，不拼接用户输入。
- 表、列、索引使用 `snake_case`；映射到应用 DTO 时显式转换。
- 连接初始化必须启用 `foreign_keys = ON`、WAL、busy timeout 和明确同步级别。
- 写事务使用 `BEGIN IMMEDIATE` 或等价方式，避免检查 revision 后再被其他写者插入。
- 保存、导入、恢复和附件登记以业务操作作为事务单位。
- 已发布迁移文件不可编辑；修正通过新迁移完成。
- Schema 变更必须测试全新安装、已有数据升级、重复运行和失败回滚。
- Rust command 不接受任意 SQL，不接受用户提供的路径作为未校验存储路径。
- 同步 rusqlite 调用通过 `spawn_blocking` 或专用阻塞线程执行，不阻塞 Tauri 主线程。

### 7.2 Dexie/IndexedDB

- 业务代码不得访问 `window.indexedDB` 或 Dexie 表。
- 一个写用例使用一个 `rw` transaction，事务内不执行网络请求、长循环或不相关 UI 状态更新。
- Dexie schema version 只负责 store/index；数据格式迁移单独编号并写入 `meta`。
- 每个迁移先复制或保留可恢复快照，再修改数据；失败不能留下“半新半旧”状态。
- 浏览器可能关闭页面，不把关键持久化放入延迟 Promise、Worker 未确认消息或 `pagehide` 后长异步任务。
- `QuotaExceededError` 映射为 `QUOTA_EXCEEDED`，保留编辑草稿并提示备份或清理。
- `objectURL` 在组件卸载、附件切换和错误路径中统一 revoke。

### 7.3 Tauri

- 命令名可以 snake_case，payload/response 字段统一 camelCase；Rust 使用显式 `serde(rename_all = "camelCase")`。
- 命令只接受已定义 DTO，不将 JavaScript 对象直接反序列化为任意结构。
- 文件和目录使用 `PathBuf`/Tauri path API，业务代码不拼接 Windows 盘符或 macOS 用户目录。
- 扫描、附件和备份命令规范化路径，并检查目标仍在用户选择的根目录或应用数据目录内。
- 不在 Rust 层执行业务规则的另一套实现；Rust 负责验证、事务、文件安全和持久化语义。
- `panic!` 只用于不可恢复的内部不变量。对用户可触发输入返回结构化错误。
- CSP、capability 和允许的 URL 协议保持最小集合。

## 8. React、状态与 UI

- `features` 页面通过注入的 `AppServices` 调用用例，不直接导入具体 adapter。
- Zustand 只保存 UI 状态、保存协调器状态和短生命周期结果，不保存 Tiptap Editor 实例。
- 服务端/本地数据不复制进多个长期 store；以用例结果和显式查询缓存为准。
- 异步页面必须实现加载、空、成功、局部错误、重试、配额不足和冲突状态。
- 保存状态必须由实际持久化结果驱动，不能在请求发出时显示“已保存”。
- 危险操作使用带影响说明的确认对话框，不用 Toast 承载必须处理的冲突。
- 使用 shadcn/ui 原语和 Lucide 图标；图标按钮有可访问名称和 tooltip。
- 交互控件使用合适语义：开关用于二元设置，分段控件用于模式，菜单用于选项集合。
- 不写死 `Ctrl`、盘符、用户目录或绝对路径文案。
- 所有动态文本验证 375 px 和 1024 px 布局，不因 hover、加载文本或长错误码改变工具栏尺寸。
- 不靠颜色单独表达状态；焦点、对比度和键盘顺序满足 UI 设计文档。

## 9. Tiptap 与内容投影

- Tiptap JSON 是唯一权威正文；禁止直接持久化编辑器 Markdown 后反写 JSON。
- Markdown 粘贴、TXT 导入和外部 HTML 都必须转换为当前 Schema 的 JSON，再进入统一保存用例。
- 每类节点和 mark 使用固定名称；新增节点必须补充 Schema、迁移、Markdown projector 和测试。
- 结构化块和附件节点必须有稳定 `id`，不能依赖数组位置。
- 未知节点和属性在迁移中保留；无法渲染时进入只读不透明容器，不能静默删除。
- `ContentProjector` 是纯函数，不查询数据库。保存前一次生成 Markdown、纯文本、结构化块、搜索文档和 hash。
- 派生字段不能通过 UI 单独编辑；projector 规则变化时递增 `projectionVersion` 并标记重建。
- 自动保存 800 ms 防抖、单飞队列、`expectedRevision` 和失败保留草稿必须遵循 `EDITOR-DESIGN.md`。

## 10. 搜索

- 索引是派生数据，索引损坏不改变正文权威，用户仍可打开已有正文并进入重建；写路径必须保持正文与索引原子一致。
- SQLite FTS 与 Web posting 使用同一个归一化、tokenizer 和查询 token 上限实现。
- 搜索 SQL 使用参数绑定生成 MATCH 表达式，不拼接未转义引号。
- 软删除、归档和任务完成状态在查询层显式过滤，不依赖索引恰好删除。
- 常规保存中索引写入失败必须整体回滚并保留草稿；不得在同一保存中同时出现“正文成功、索引未更新”。`stale` 只用于迁移、恢复或投影版本升级后的全局重建状态。
- 重建必须分批、可取消，并校验实体与文档计数后标记 `ready`。
- 搜索日志不记录查询词和正文。

## 11. 导入、导出与备份

- TXT 编码顺序固定为 UTF-8 BOM、严格 UTF-8、GB18030；不使用宽松替换解码。
- 自动日期不读取文件修改时间。
- 原始字节与解码结果分开保存；转换失败不能丢弃源字节。
- 导入预览不创建正式 Journal；提交以整批事务回滚。
- 逻辑路径统一使用 `/`，拒绝 `..`、UNC、盘符和符号链接逃逸。
- 导出 Markdown 时从权威 JSON 重新投影，不读取可能过期的 Markdown 缓存。
- 备份 manifest、checksums、附件和导入原始字节必须一起验证；缺失文件不能静默当作空文件。
- 恢复先写 staging，再原子切换；当前数据非空时先创建安全快照。
- ZIP 解压有最大总字节、单文件大小和文件数限制，防止 zip-slip 与压缩炸弹。

## 12. AI 边界

- AI 默认关闭，不参与保存、读取、搜索、导入、迁移和恢复。
- Provider 只实现 `AiProviderPort`，不接收 Repository 或 AppServices。
- 外部请求必须由用户显式发起并预览发送范围。
- 不默认发送附件、代码块、完整历史、导入原始字节、路径或标签全集。
- 桌面 Key 使用 `SecretStore` 和系统钥匙串；Web Key 不入 IndexedDB、`localStorage` 或备份。
- AI 输出只是草稿，必须经用户确认并通过普通保存用例落库。

## 13. 测试

### 13.1 基本流程

每个功能或缺陷修复遵循：

1. 写能表达失败行为的测试。
2. 运行并确认失败原因正确。
3. 写最小实现。
4. 运行目标测试和相关回归测试。
5. 运行 typecheck/lint。
6. 提交小范围变更。

### 13.2 测试层次

- Domain：纯 Vitest，固定时钟和 ID。
- Application：Vitest + 内存 adapter，覆盖冲突、回滚和状态机。
- Editor：JSON/Markdown round-trip、未知节点、陈旧 Schema。
- Web storage：`fake-indexeddb` + Dexie，覆盖事务和迁移。
- Desktop storage：`cargo test` + 临时 SQLite，覆盖真实 SQL、FTS 和文件。
- Contract：同一 fixture 同时验证 SQLite 与 Dexie adapter。
- UI：Testing Library 验证用户可见结果和键盘。
- E2E：Playwright 覆盖核心工作流与失败恢复。

测试规则：

- 测试名描述行为和结果，不写“works”。
- 一个测试只断言一组相关行为；避免超长 snapshot 代替语义断言。
- 不依赖执行顺序、真实当前时间、真实用户目录或网络。
- 故障注入必须证明事务前后状态，而不仅是错误消息。
- 修复数据损坏类缺陷必须有失败复现 fixture。
- 不以覆盖率数字代替关键路径覆盖；保存、导入、恢复、迁移和删除必须有失败测试。

## 14. 日志与诊断

- 使用结构化字段：`event`、`errorCode`、`entityType`、`durationMs`、`platform`。
- 禁止记录正文、搜索词、Prompt、API Key、导入原始内容、绝对路径和附件内容。
- 生产默认只记录 warn/error 和关键生命周期；调试日志需要显式开关。
- 诊断包只包含版本、Schema、平台、错误摘要和可选性能指标。
- 用户可导出诊断包，但不上传。

## 15. Git、提交与评审

- 一个提交解决一个可说明的问题，不混入无关格式化。
- 提交信息使用 Conventional Commits：`feat:`、`fix:`、`test:`、`docs:`、`chore:`、`refactor:`。
- 提交前运行本次影响的测试、`pnpm typecheck` 和相关 lint。
- 不在提交中放入数据库、附件、导出包、用户数据、密钥或 `.env`。
- 不修改他人未提交改动；不执行破坏性 reset/checkout。
- PR 描述包含用户行为、架构影响、迁移步骤、验证命令和已知风险。
- 数据模型、ID、同步、备份或 AI 边界变化必须新增/更新 ADR。

## 16. 文档

- 文档中的类型名、字段名、表名和命令必须可在设计或计划中追踪。
- 设计改变时同步更新相关 ADR、数据库设计、开发计划和 README，不能只改一处。
- 示例代码必须遵循本文；不展示已被否决的旧接口。
- 不提交占位章节；未知项写成明确待确认决策，包含候选方案、取舍和推荐。
- 所有文档链接使用仓库相对路径，并在发布前验证目标存在。

## 17. 自动检查基线

预期根命令：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm format:check
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

CI 还应执行依赖巡航、硬编码路径扫描、文档链接检查和产物校验。任何豁免必须写在代码附近并在 PR 中说明原因。
