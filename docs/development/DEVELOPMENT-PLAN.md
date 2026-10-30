# DailyFlow 开发计划

> **For agentic workers:** 按任务顺序执行，每个任务先写失败测试，再实现，再运行验证并提交。除非任务显式声明，不提前扩展 V1 范围。步骤使用 `- [ ]` 跟踪。

**Goal:** 从空仓库构建可在 Windows、macOS 和 Web 本地运行的 DailyFlow V1，并完成 TXT 历史导入、搜索、备份恢复和跨端测试。

**Architecture:** 使用 pnpm/Turborepo Monorepo。Domain 与 Application 是纯 TypeScript；桌面通过类型化 Tauri commands 调用 Rust/SQLite，Web 通过 Dexie/IndexedDB；两端在组合根注入同一套用例和 UI。

**Tech Stack:** React、TypeScript、Vite、Tauri 2、Rust、SQLite、IndexedDB、Dexie、Tiptap、Tailwind CSS、shadcn/ui、Lucide、Zod、Zustand、Vitest、Playwright。

## 0. 执行原则

- 一次只把一个小任务做到可测试、可提交的完成状态。
- 任何存储实现必须先通过 Application 端口和契约测试。
- 任何涉及正文、导入、恢复的任务都必须包含失败回滚测试。
- 不在 V1 建立云端后端、账号、同步服务或 AI 必需依赖。
- 不修改已发布数据库迁移，修正通过新迁移完成。
- 每个任务完成后运行本任务指定测试、`pnpm typecheck` 和相关 lint。
- 当前工作区尚未初始化 Git；Task 1 完成后再执行提交步骤。

## 1. 里程碑

| 里程碑 | 结果 | 任务 |
| --- | --- | --- |
| M0 工程基础 | Monorepo、构建、测试、包边界可运行 | 1-3 |
| M1 核心模型 | Domain、Application、内存 adapter 可用 | 4-6 |
| M2 双端持久化 | SQLite 与 IndexedDB 共享契约通过 | 7-10 |
| M3 编辑器 | 权威 JSON、转换、自动保存、附件 | 11-13 |
| M4 核心 UI | 八个模块的主要页面和导航可用 | 14-17 |
| M5 数据迁移 | TXT 导入、导出、备份、恢复 | 18-20 |
| M6 质量与发布 | 快捷键、E2E、CI、签名与发布清单 | 21-24 |

## 2. 文件落位

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
turbo.json
tsconfig.base.json
eslint.config.js
prettier.config.cjs
.node-version
.editorconfig
.gitignore
apps/desktop/
apps/web/
packages/domain/
packages/application/
packages/infrastructure/
packages/editor/
packages/ui/
packages/features/
packages/shared/
packages/sync-contracts/
packages/ai/
scripts/
docs/
```

## 3. 任务

### Task 1: 初始化 Monorepo 与基础脚本

**Files**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.node-version`
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `apps/desktop/package.json`
- Create: `apps/web/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/application/package.json`
- Create: `packages/infrastructure/package.json`
- Create: `packages/editor/package.json`
- Create: `packages/ui/package.json`
- Create: `packages/features/package.json`
- Create: `packages/shared/package.json`
- Create: `packages/sync-contracts/package.json`
- Create: `packages/ai/package.json`

- [ ] **Step 1: 创建 workspace 与最小包清单**

  根 `package.json` 包含 `dev:web`、`dev:desktop`、`build`、`test`、`typecheck`、`lint`、`format:check`、`e2e` 脚本，并设置 `packageManager` 与 `engines`。

- [ ] **Step 2: 配置 TypeScript project references 或 workspace imports**

  所有包使用 `@dailyflow/*` 名称，`tsconfig.base.json` 开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`moduleResolution: "Bundler"`。

- [ ] **Step 3: 配置 Turborepo 任务依赖**

  `build` 依赖 `^build`；`test` 依赖 `^build`；`typecheck` 依赖 `^typecheck`；声明 `outputs` 和缓存输入。

- [ ] **Step 4: 验证依赖图**

  Run: `pnpm install && pnpm typecheck`

  Expected: 所有空包通过类型检查，无循环 workspace 依赖。

- [ ] **Step 5: 初始化 Git 并提交**

  Run: `git init && git add . && git commit -m "chore: initialize dailyflow workspace"`

### Task 2: 统一质量工具与包边界检查

**Files**

- Create: `eslint.config.js`
- Create: `prettier.config.cjs`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/result.ts`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/date.ts`
- Create: `packages/shared/src/id.ts`
- Create: `packages/shared/src/search-text.ts`
- Create: `packages/shared/src/hash.ts`
- Create: `packages/shared/test/date.test.ts`
- Create: `packages/shared/test/search-text.test.ts`
- Create: `.dependency-cruiser.cjs`

- [ ] **Step 1: 写共享工具失败测试**

  覆盖合法/非法 `LocalDate`、UTC 时间与本地日期转换、NFKC 大小写归一化、中文 bigram 生成、稳定 JSON 哈希。

- [ ] **Step 2: 运行测试确认失败**

  Run: `pnpm --filter @dailyflow/shared test`

  Expected: FAIL，原因是对应函数尚不存在。

- [ ] **Step 3: 实现纯函数**

  `date.ts` 不依赖浏览器本地时区隐式切日；`id.ts` 生成 UUIDv7 并支持注入时钟；`hash.ts` 使用 Web Crypto 或共享抽象。

- [ ] **Step 4: 配置 ESLint、Prettier 与依赖巡航**

  禁止 `domain` import React/Tauri/Dexie；禁止 `features` 直接 import desktop/web adapter；禁止 app 组合根外的代码选择具体存储；禁止循环依赖。

- [ ] **Step 5: 验证**

  Run: `pnpm --filter @dailyflow/shared test && pnpm lint && pnpm typecheck`

  Expected: 全部通过。

- [ ] **Step 6: 提交**

  Run: `git add . && git commit -m "chore: add shared utilities and quality gates"`

### Task 3: 建立共享 UI、Web 与桌面壳

**Files**

- Create: `packages/ui/src/styles/globals.css`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/icon-button.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/dialog.tsx`
- Create: `packages/ui/src/components/segmented-control.tsx`
- Create: `packages/ui/src/components/save-status.tsx`
- Create: `packages/ui/src/index.ts`
- Create: `packages/features/src/index.ts`
- Create: `packages/features/src/app-shell.tsx`
- Create: `packages/features/src/routes.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/routes/router.tsx`
- Create: `apps/web/vite.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/app.tsx`
- Create: `apps/desktop/src/routes/router.tsx`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: 配置 Tailwind 语义 token**

  按 `UI-DESIGN.md` 建立背景、表面、边框、主色、状态色和字体 token；不加入渐变或装饰光斑。

- [ ] **Step 2: 封装 shadcn 基础组件**

  使用 Lucide 图标，Icon Button 带可访问名称和 tooltip；控件固定尺寸，不因 hover 改变布局。

- [ ] **Step 3: 构建共享应用外壳**

  `packages/features` 提供相同侧栏、TopBar、页面 outlet 和状态栏；`packages/features/src/routes.ts` 导出路径、页面组件和导航元数据。`apps/web` 使用 `BrowserRouter`，`apps/desktop` 使用 `HashRouter`，两者消费同一份共享路由定义，只适配平台 URL 与历史行为。

- [ ] **Step 4: 创建最小 Tauri 2 壳**

  配置 CSP、窗口最小尺寸、identifier，并实现一个无业务数据的 `app_info` command。

- [ ] **Step 5: 验证构建**

  Run: `pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

  Expected: Web 静态产物和桌面前端构建成功；在安装 Tauri 环境中 `pnpm dev:desktop` 能启动空壳。

- [ ] **Step 6: 提交**

  Run: `git add . && git commit -m "feat: add shared app shell and platform entries"`

### Task 4: 实现纯领域模型

**Files**

- Create: `packages/domain/src/journal/journal.ts`
- Create: `packages/domain/src/journal/journal-version.ts`
- Create: `packages/domain/src/journal/structured-block.ts`
- Create: `packages/domain/src/knowledge/knowledge-item.ts`
- Create: `packages/domain/src/tasks/task.ts`
- Create: `packages/domain/src/tags/tag.ts`
- Create: `packages/domain/src/attachments/attachment.ts`
- Create: `packages/domain/src/imports/import-session.ts`
- Create: `packages/domain/src/reports/report.ts`
- Create: `packages/domain/test/journal.test.ts`
- Create: `packages/domain/test/task.test.ts`
- Create: `packages/domain/test/structured-block.test.ts`

- [ ] **Step 1: 写领域规则失败测试**

  覆盖空标题可保存、任务标题非空、完成状态与 `completedAt` 一致、结构化块 ID 稳定、日期不可静默转换、revision 非负。

- [ ] **Step 2: 定义值对象**

  包括 `EntityId`、`LocalDate`、`Revision`、`ContentHash`、`TagName`。不把数据库行或 DTO 直接当领域实体。

- [ ] **Step 3: 定义聚合与工厂**

  工厂接收 `IdGenerator` 和 `Clock` 抽象，方便确定性测试；领域层不 import Node `crypto`、浏览器或 Tauri。

- [ ] **Step 4: 运行**

  Run: `pnpm --filter @dailyflow/domain test && pnpm typecheck`

  Expected: 全部领域测试通过，依赖巡航无平台 import。

- [ ] **Step 5: 提交**

  Run: `git add packages/domain && git commit -m "feat: define dailyflow domain models"`

### Task 5: 定义 Application 端口与核心用例

**Files**

- Create: `packages/application/src/ports/journal-repository.ts`
- Create: `packages/application/src/ports/knowledge-repository.ts`
- Create: `packages/application/src/ports/task-repository.ts`
- Create: `packages/application/src/ports/search-port.ts`
- Create: `packages/application/src/ports/attachment-store.ts`
- Create: `packages/application/src/ports/import-service.ts`
- Create: `packages/application/src/ports/backup-service.ts`
- Create: `packages/application/src/ports/clock.ts`
- Create: `packages/application/src/use-cases/get-journal.ts`
- Create: `packages/application/src/use-cases/save-journal.ts`
- Create: `packages/application/src/use-cases/restore-journal-version.ts`
- Create: `packages/application/src/use-cases/promote-to-knowledge.ts`
- Create: `packages/application/src/use-cases/complete-task.ts`
- Create: `packages/application/src/services/app-services.ts`
- Create: `packages/application/test/save-journal.test.ts`
- Create: `packages/application/test/promote-to-knowledge.test.ts`

- [ ] **Step 1: 写用例失败测试**

  使用内存 fake 覆盖首次保存、revision 冲突、无变更不递增、保存失败保留输入、提升知识保留来源。

- [ ] **Step 2: 定义 Zod 输入 schema**

  所有外部输入先校验：日期格式、内容 JSON、标题长度、标签规范化、`expectedRevision` 可空、checkpoint 枚举。

- [ ] **Step 3: 实现用例**

  `saveJournal` 只调用 `ContentProjector` 接口和 Repository；不 import 编辑器或具体数据库。

- [ ] **Step 4: 定义 `AppServices`**

  页面只能通过该接口取得用例/查询能力，不能根据平台 branch 自行实例化数据库。

- [ ] **Step 5: 运行**

  Run: `pnpm --filter @dailyflow/application test && pnpm typecheck`

- [ ] **Step 6: 提交**

  Run: `git add packages/application && git commit -m "feat: add application ports and journal use cases"`

### Task 6: 建立内存适配器与共享契约测试

**Files**

- Create: `packages/infrastructure/src/memory/memory-journal-repository.ts`
- Create: `packages/infrastructure/src/memory/memory-knowledge-repository.ts`
- Create: `packages/infrastructure/src/memory/memory-task-repository.ts`
- Create: `packages/infrastructure/src/memory/memory-search-port.ts`
- Create: `packages/infrastructure/src/testing/repository-contract.ts`
- Create: `packages/infrastructure/test/journal-contract.test.ts`
- Create: `packages/infrastructure/test/search-contract.test.ts`

- [ ] **Step 1: 写可复用 Repository 契约**

  契约包含创建、读取、保存、revision 冲突、软删除、分页、搜索更新和日期唯一性。

- [ ] **Step 2: 实现内存 adapter**

  内存实现仅用于测试与应用层联调，不作为生产 fallback。

- [ ] **Step 3: 验证相同契约**

  Run: `pnpm --filter @dailyflow/infrastructure test`

  Expected: 内存 repository 全部契约通过，测试可在后续 SQLite/Dexie 上复用。

- [ ] **Step 4: 提交**

  Run: `git add packages/infrastructure && git commit -m "test: add repository contracts and memory adapters"`

### Task 7: 建立 SQLite 迁移与 Rust 数据层

**Files**

- Create: `apps/desktop/src-tauri/migrations/0001_initial.sql`
- Create: `apps/desktop/src-tauri/migrations/0002_search_fts.sql`
- Create: `apps/desktop/src-tauri/src/db/mod.rs`
- Create: `apps/desktop/src-tauri/src/db/migrations.rs`
- Create: `apps/desktop/src-tauri/src/db/models.rs`
- Create: `apps/desktop/src-tauri/src/db/journal_repository.rs`
- Create: `apps/desktop/src-tauri/src/db/search_repository.rs`
- Create: `apps/desktop/src-tauri/src/commands/journal_commands.rs`
- Create: `apps/desktop/src-tauri/src/commands/search_commands.rs`
- Create: `apps/desktop/src-tauri/tests/migrations.rs`
- Create: `apps/desktop/src-tauri/tests/journal_transaction.rs`

- [ ] **Step 1: 写迁移与事务失败测试**

  使用临时 SQLite 文件，验证全新数据库迁移、重复运行幂等、checksum 不匹配失败、保存失败回滚正文和 FTS。

- [ ] **Step 2: 实现连接初始化**

  启用 foreign keys、WAL、busy timeout；迁移在事务内执行并记录 `schema_migrations`。

- [ ] **Step 3: 实现日志原子保存**

  `journal_save_snapshot` 校验 payload、检查 expected revision、写 journal/version/structured blocks/search，再提交。

- [ ] **Step 4: 实现查询与恢复命令**

  返回稳定 camelCase DTO；Rust 内部字段可 snake_case，但命令契约固定。

- [ ] **Step 5: 运行**

  Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

  Expected: 迁移、事务和查询测试通过。

- [ ] **Step 6: 提交**

  Run: `git add apps/desktop/src-tauri && git commit -m "feat: add sqlite migrations and journal persistence"`

### Task 8: 实现桌面 Tauri Repository Adapter

**Files**

- Create: `packages/infrastructure/src/desktop/tauri-client.ts`
- Create: `packages/infrastructure/src/desktop/tauri-contracts.ts`
- Create: `packages/infrastructure/src/desktop/desktop-journal-repository.ts`
- Create: `packages/infrastructure/src/desktop/desktop-search-port.ts`
- Create: `packages/infrastructure/src/desktop/desktop-services.ts`
- Create: `apps/desktop/src/composition.ts`
- Create: `packages/infrastructure/test/desktop-contracts.test.ts`
- Modify: `apps/desktop/src/app.tsx`

- [ ] **Step 1: 定义命令名与 Zod contract**

  contract 与 Rust fixture 字段一一对应；禁止页面直接 import `tauri-client.ts`。

- [ ] **Step 2: 写 mock invoke 失败测试**

  覆盖字段缺失、Rust 错误码映射、保存成功 revision 映射、分页 cursor 映射。

- [ ] **Step 3: 实现 adapter**

  只在 adapter 内调用 `invoke`，把持久化 DTO 映射为 Application 类型；不把 Tauri API 暴露给 Domain。

- [ ] **Step 4: 桌面组合根注入**

  `apps/desktop/src/composition.ts` 创建 `DesktopServices` 并交给共享页面。

- [ ] **Step 5: 运行**

  Run: `pnpm --filter @dailyflow/infrastructure test && pnpm typecheck && pnpm --filter @dailyflow/desktop build`

- [ ] **Step 6: 提交**

  Run: `git add packages/infrastructure apps/desktop && git commit -m "feat: connect desktop repositories through tauri commands"`

### Task 9: 建立 Dexie Schema 与 Web Adapter

**Files**

- Create: `packages/infrastructure/src/web/db.ts`
- Create: `packages/infrastructure/src/web/schema.ts`
- Create: `packages/infrastructure/src/web/migrations/0001-initial.ts`
- Create: `packages/infrastructure/src/web/dexie-journal-repository.ts`
- Create: `packages/infrastructure/src/web/dexie-search-port.ts`
- Create: `packages/infrastructure/src/web/web-services.ts`
- Create: `apps/web/src/composition.ts`
- Create: `packages/infrastructure/test/web-journal.test.ts`
- Create: `packages/infrastructure/test/web-search.test.ts`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: 写 fake-indexeddb 失败测试**

  覆盖 schema 创建、日志事务、revision 冲突、版本记录、搜索 posting、索引重建。

- [ ] **Step 2: 声明 Dexie stores**

  使用 `DATABASE-DESIGN.md` 的 store 清单，统一 camelCase；所有日期字段使用字符串。

- [ ] **Step 3: 实现事务保存**

  `db.transaction` 跨 journal、version、structured block、search、tag stores；任一步抛错整体回滚。

- [ ] **Step 4: 实现 Web 组合根**

  `apps/web/src/composition.ts` 注入 Dexie adapters；页面不直接 import `db.ts`。

- [ ] **Step 5: 运行**

  Run: `pnpm --filter @dailyflow/infrastructure test && pnpm --filter @dailyflow/web build`

- [ ] **Step 6: 提交**

  Run: `git add packages/infrastructure apps/web && git commit -m "feat: add indexeddb repositories for web"`

### Task 10: 两端 Repository 契约一致性

**Files**

- Create: `packages/infrastructure/test/parity-fixtures.ts`
- Create: `apps/desktop/src-tauri/tests/contract_fixtures.rs`
- Create: `scripts/check-dto-fixtures.mjs`
- Modify: `packages/infrastructure/test/journal-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 建立固定 fixtures**

  包含中文日志、结构化块、标签、历史版本、软删除和空标题。

- [ ] **Step 2: 在 TypeScript 和 Rust 测试中读取同一 fixtures**

  断言字段名、枚举、revision、日期、错误码一致。

- [ ] **Step 3: 添加 CI 校验脚本**

  `scripts/check-dto-fixtures.mjs` 比对 JSON 样例与 typed contract 导出的字段集合。

- [ ] **Step 4: 运行**

  Run: `pnpm test && pnpm typecheck && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

  Expected: SQLite、Dexie、内存 adapter 对同一业务输入产生等价结果。

- [ ] **Step 5: 提交**

  Run: `git add . && git commit -m "test: enforce cross-platform repository contracts"`

### Task 11: 实现 Tiptap Schema 与内容投影

**Files**

- Create: `packages/editor/src/schema/schema-version.ts`
- Create: `packages/editor/src/schema/create-editor-schema.ts`
- Create: `packages/editor/src/extensions/structured-block.ts`
- Create: `packages/editor/src/extensions/attachment.ts`
- Create: `packages/editor/src/serialization/normalize-document.ts`
- Create: `packages/editor/src/serialization/json-to-markdown.ts`
- Create: `packages/editor/src/serialization/markdown-to-json.ts`
- Create: `packages/editor/src/serialization/json-to-plain-text.ts`
- Create: `packages/editor/src/projection/extract-structured-blocks.ts`
- Create: `packages/editor/test/roundtrip.test.ts`
- Create: `packages/editor/test/structured-block.test.ts`

- [ ] **Step 1: 写固定文档失败测试**

  覆盖标题、列表、引用、代码块、链接、中文、Emoji、结构化块、未知字段和未知节点。

- [ ] **Step 2: 实现 schema**

  节点和 mark 名称固定；附件节点只保存 attachment ID 和展示元数据，不保存路径。

- [ ] **Step 3: 实现 Markdown 与纯文本 projector**

  结构化块输出 `dailyflow-structured` 围栏；链接协议使用白名单；未知节点进入不透明容器。

- [ ] **Step 4: 实现投影**

  `extractStructuredBlocks` 从 JSON 生成带 `orderKey`、`renderedText` 和 schema 版本的项目；不读写数据库。

- [ ] **Step 5: 运行**

  Run: `pnpm --filter @dailyflow/editor test && pnpm typecheck`

  Expected: 支持节点 round-trip 语义稳定，未知字段不丢失。

- [ ] **Step 6: 提交**

  Run: `git add packages/editor && git commit -m "feat: implement canonical editor projections"`

### Task 12: 编辑器界面、自动保存与历史版本

**Files**

- Create: `packages/features/src/journal/journal-editor.tsx`
- Create: `packages/features/src/journal/editor-toolbar.tsx`
- Create: `packages/features/src/journal/save-coordinator.ts`
- Create: `packages/features/src/journal/history-panel.tsx`
- Create: `packages/features/src/journal/journal-page.tsx`
- Create: `packages/ui/src/components/history-list.tsx`
- Create: `packages/ui/src/components/save-status.tsx`
- Create: `packages/features/src/journal/journal-editor-store.ts`
- Create: `packages/features/test/save-coordinator.test.ts`
- Create: `packages/features/test/journal-page.test.tsx`

- [ ] **Step 1: 写保存协调器失败测试**

  覆盖 800ms 防抖、单飞保存、保存中再次变更、成功清除 dirty、冲突保留草稿、失败保留编辑内容。

- [ ] **Step 2: 集成 Tiptap**

  Editor 实例保存在组件生命周期；Zustand 只保存保存状态、revision、错误和 UI 面板状态。

- [ ] **Step 3: 接入 `SaveJournal`**

  保存前生成 JSON、Markdown、纯文本和结构化投影，再调用 Application 用例。

- [ ] **Step 4: 实现历史恢复**

  历史列表分页读取；恢复生成新 revision；当前正文不删除。

- [ ] **Step 5: 实现关闭/隐藏保存**

  桌面接入 `onCloseRequested`；Web 接入 `visibilitychange`、`pagehide` 和页面卸载提示。

- [ ] **Step 6: 运行**

  Run: `pnpm --filter @dailyflow/features test && pnpm --filter @dailyflow/web build`

- [ ] **Step 7: 提交**

  Run: `git add packages/features packages/ui && git commit -m "feat: add journal editor and autosave"`

### Task 13: 实现附件存储和编辑器附件节点

**Files**

- Create: `packages/application/src/use-cases/add-attachment.ts`
- Create: `packages/infrastructure/src/desktop/desktop-attachment-store.ts`
- Create: `packages/infrastructure/src/web/web-attachment-store.ts`
- Create: `apps/desktop/src-tauri/src/attachments/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/attachment_commands.rs`
- Create: `packages/features/src/journal/attachment-node-view.tsx`
- Create: `packages/editor/test/attachment-node.test.ts`
- Create: `apps/desktop/src-tauri/tests/attachment_store.rs`

- [ ] **Step 1: 写附件失败测试**

  覆盖 hash 去重、路径穿越拒绝、删除 owner 后 orphan 标记、MIME 白名单、Web Blob 事务失败回滚。

- [ ] **Step 2: 实现桌面附件服务**

  Rust 写入应用数据目录的临时文件，校验 hash 后 rename；数据库中只保存逻辑相对路径。

- [ ] **Step 3: 实现 Web 附件服务**

  Blob 与 metadata 在同一 Dexie transaction 中写入；`objectURL` 在组件卸载时 revoke。

- [ ] **Step 4: 接入编辑器**

  附件节点只使用 attachment ID；上传失败显示占位和重试，不写入正式 link。

- [ ] **Step 5: 运行**

  Run: `pnpm test && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 6: 提交**

  Run: `git add . && git commit -m "feat: add attachment storage across platforms"`

### Task 14: Dashboard 与 Daily Journal 页面

**Files**

- Create: `packages/features/src/dashboard/dashboard-page.tsx`
- Create: `packages/features/src/dashboard/today-journal-panel.tsx`
- Create: `packages/features/src/dashboard/today-tasks-panel.tsx`
- Create: `packages/features/src/dashboard/activity-heatmap.tsx`
- Create: `packages/features/src/journal/journal-list.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/features/test/dashboard.test.tsx`
- Create: `packages/features/test/journal-routing.test.tsx`

- [ ] **Step 1: 写页面状态测试**

  覆盖空数据库、已有今日日志、保存中、保存失败、无待办和最近知识区域。

- [ ] **Step 2: 实现 Dashboard**

  今日日志和待办优先；不使用 Hero 或装饰性大卡片；所有摘要可跳转详情。

- [ ] **Step 3: 实现 Journal 页面**

  日期前后切换、历史补录、标签、附件和历史面板；主操作和保存状态固定可见。

- [ ] **Step 4: 添加加载/错误/空状态**

  加载骨架不影响布局；失败提供重试，不只显示 Toast。

- [ ] **Step 5: 注册 Dashboard 与 Journal 路由**

  在 `packages/features/src/routes.ts` 注册 `/` 和 `/journal/:date`，并由 `apps/desktop/src/routes/router.tsx`、`apps/web/src/routes/router.tsx` 消费同一份定义。测试桌面 HashRouter 与 Web BrowserRouter 都能进入今日日志和历史日期，未知日期显示可恢复错误。

- [ ] **Step 6: 运行**

  Run: `pnpm --filter @dailyflow/features test && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

- [ ] **Step 7: 提交**

  Run: `git add packages/features apps/web apps/desktop && git commit -m "feat: add dashboard and journal experience"`

### Task 15: Timeline、Tasks 与日历查询

**Files**

- Create: `packages/application/src/queries/timeline-query.ts`
- Create: `packages/application/src/queries/task-list-query.ts`
- Create: `packages/infrastructure/src/desktop/desktop-timeline-query.ts`
- Create: `packages/infrastructure/src/web/dexie-timeline-query.ts`
- Create: `packages/features/src/timeline/timeline-page.tsx`
- Create: `packages/features/src/timeline/month-calendar.tsx`
- Create: `packages/features/src/timeline/activity-heatmap.tsx`
- Create: `packages/features/src/tasks/tasks-page.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/features/test/timeline.test.tsx`
- Create: `packages/application/test/tasks.test.ts`

- [ ] **Step 1: 写日期与状态测试**

  覆盖闰年、月末、跨年、本地日期、逾期判断、完成/重开任务。

- [ ] **Step 2: 实现查询端口**

  日历返回轻量日期摘要；时间线使用游标分页；不允许加载完整历史正文。

- [ ] **Step 3: 实现 Timeline**

  月历、时间线和热力图切换；日期格可键盘访问；热力图有口径和数值提示。

- [ ] **Step 4: 实现 Tasks**

  今天、即将到期、全部、已完成视图；行内完成；详情抽屉编辑关联。

- [ ] **Step 5: 注册 Timeline 与 Tasks 路由**

  在共享路由表注册 `/timeline`、`/tasks`，两个组合根同时接入；桌面构建后实际打开两个页面，确认刷新、返回和日期查询参数不会落到空白页。

- [ ] **Step 6: 运行**

  Run: `pnpm test && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

- [ ] **Step 7: 提交**

  Run: `git add packages/features packages/application packages/infrastructure apps/web apps/desktop && git commit -m "feat: add timeline calendar and tasks"`

### Task 16: Knowledge Base 与全局搜索页面

**Files**

- Create: `packages/application/src/use-cases/promote-to-knowledge.ts`
- Create: `packages/application/src/queries/knowledge-list-query.ts`
- Create: `packages/infrastructure/src/desktop/desktop-knowledge-repository.ts`
- Create: `packages/infrastructure/src/web/dexie-knowledge-repository.ts`
- Create: `packages/features/src/knowledge/knowledge-page.tsx`
- Create: `packages/features/src/knowledge/knowledge-detail.tsx`
- Create: `packages/features/src/search/search-command.tsx`
- Create: `packages/features/src/search/search-page.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/features/test/knowledge.test.tsx`
- Create: `packages/features/test/search.test.tsx`

- [ ] **Step 1: 写失败测试**

  覆盖从日志块提升、来源保留、知识类型筛选、搜索过滤、索引 stale 状态和软删除排除。

- [ ] **Step 2: 实现知识仓储与页面**

  列表与详情状态明确；问题/方案字段可选；来源链接可跳转原日志。

- [ ] **Step 3: 实现搜索**

  命令浮层与完整页共用搜索用例；键盘上下/Enter/Escape；结果高亮和索引状态。

- [ ] **Step 4: 注册 Knowledge 与 Search 路由**

  在共享路由表注册 `/knowledge`、`/knowledge/:id`、`/search`，两个组合根同时接入。桌面端打开搜索结果后能定位日志/知识；索引 `stale` 或 `failed` 时页面仍可访问并显示重建入口。

- [ ] **Step 5: 运行**

  Run: `pnpm test && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

- [ ] **Step 6: 提交**

  Run: `git add packages/features packages/application packages/infrastructure apps/web apps/desktop && git commit -m "feat: add knowledge base and global search"`

### Task 17: Analytics、Reports 与数据概览

**Files**

- Create: `packages/application/src/queries/analytics-query.ts`
- Create: `packages/application/src/use-cases/generate-report-draft.ts`
- Create: `packages/infrastructure/src/desktop/desktop-analytics-query.ts`
- Create: `packages/infrastructure/src/web/dexie-analytics-query.ts`
- Create: `packages/features/src/analytics/analytics-page.tsx`
- Create: `packages/features/src/analytics/report-editor.tsx`
- Create: `packages/features/src/analytics/stat-tile.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/application/test/analytics.test.ts`
- Create: `packages/features/test/analytics.test.tsx`

- [ ] **Step 1: 写稳定统计测试**

  输入固定日志、任务、知识数据，断言周/月/年计数、时区和日期边界。

- [ ] **Step 2: 实现查询**

  不存储重复统计数据；Report 保存用户编辑后的正文和生成时统计快照。

- [ ] **Step 3: 实现页面**

  周期切换、上一/下一周期、统计卡、趋势和报告编辑；图表有文本摘要。

- [ ] **Step 4: 验证 AI 非依赖**

  未配置 AI 时报告草稿和全部统计可用；AI 按钮默认关闭。

- [ ] **Step 5: 注册 Analytics 路由**

  在共享路由表注册 `/analytics` 并接入两个组合根；周期与报告参数保存在查询字符串中，桌面和 Web 刷新后保持当前周期。未配置 AI 时两个构建都能完整打开报告。

- [ ] **Step 6: 运行**

  Run: `pnpm test && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

- [ ] **Step 7: 提交**

  Run: `git add packages/features packages/application packages/infrastructure apps/web apps/desktop && git commit -m "feat: add analytics and report drafts"`

### Task 18: TXT 导入引擎与六步导入向导

**依赖**：Task 10、Task 12、Task 16。

**Files**

- Create: `packages/domain/src/imports/import-session.ts`
- Create: `packages/domain/src/imports/import-entry.ts`
- Create: `packages/domain/src/imports/import-rules.ts`
- Create: `packages/application/src/ports/import-repository.ts`
- Create: `packages/application/src/use-cases/scan-txt-import.ts`
- Create: `packages/application/src/use-cases/commit-txt-import.ts`
- Create: `packages/infrastructure/src/shared/import/txt-decoder.ts`
- Create: `packages/infrastructure/src/shared/import/date-detector.ts`
- Create: `packages/infrastructure/src/shared/import/import-preview.ts`
- Create: `packages/infrastructure/src/web/web-import-source.ts`
- Create: `packages/infrastructure/src/desktop/desktop-import-source.ts`
- Create: `apps/desktop/src-tauri/src/import/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/import_commands.rs`
- Create: `packages/features/src/data-management/import-wizard.tsx`
- Create: `packages/features/src/data-management/import-preview-table.tsx`
- Create: `packages/features/src/data-management/import-result.tsx`
- Create: `packages/features/src/data-management/import-page.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/application/test/import-preview.test.ts`
- Create: `packages/infrastructure/test/txt-decoder.test.ts`
- Create: `apps/desktop/src-tauri/tests/import_transaction.rs`
- Create: `packages/features/test/import-wizard.test.tsx`

- [ ] **Step 1: 写识别与失败测试**

  测试覆盖 `YYYYMMDD`、`YYYY-MM-DD`、月份目录加 `MMDD`/`DD`、非法闰日、无日期、UTF-8 BOM、严格 UTF-8、GBK 中文、CRLF、混合换行、空文件和路径穿越。断言不读取修改时间决定业务日期。

- [ ] **Step 2: 实现纯导入规则**

  `detectImportDate()` 和 `decodeTxt()` 不访问文件系统；日期返回可判别结果，编码只返回 `utf8-bom`、`utf8`、`gb18030` 或 `unknown`。原始 `Uint8Array` 不被解码函数修改。

- [ ] **Step 3: 实现双端扫描端口**

  桌面 Rust 递归扫描所选根目录，拒绝符号链接逃逸并使用 `/` 生成逻辑相对路径；Web 优先使用 File System Access API，不支持时使用 `<input webkitdirectory>`。两端都用异步或分批接口，禁止一次把所有正文送入 React 状态。

- [ ] **Step 4: 实现预览与冲突**

  `createSession` 只写 `ImportSession` 的 `scanning` 审计记录，`savePreview` 在独立事务中原子写 `ImportEntry` 与统计并推进为 `preview_ready`；对应 SQLite 表为 `import_sessions`/`import_entries`，Web store 为 `importSessions`/`importEntries`。成功读取的条目写 `rawCaptureStatus=captured`、SHA-256 和大小；读取失败写 `unavailable`、空哈希与 `FILE_READ_FAILED`，仍保留路径和可获得的文件元数据。逐文件识别 `duplicate_path`、`duplicate_content`、`same_date_conflict` 和 `duplicate_date_in_batch`；预览返回计数、编码、摘录、原始大小、可读错误和用户可执行动作。

- [ ] **Step 5: 实现原子提交**

  预览会话与条目先以独立审计事务保存。正式提交开始时，先用短审计事务校验 `expectedSessionRevision` 并进入 `committing`；正式事务再校验状态与 revision，先写 Journal 及历史版本，再写 StructuredBlock、标签、搜索文档和 ImportEntry 的 `journalId/status`，`journals` 不反向引用 ImportEntry。任一正式写入失败时整批回滚正式数据，再由独立审计事务保存 `failed`/`rolled_back`、`errorSummary` 和逐项错误，不能写入部分 Journal。`captured` 条目以 BLOB/Blob 保存原始字节，`cleaned` 只保留哈希、大小和清理时间，`unavailable` 不写字节或伪造哈希。

- [ ] **Step 6: 实现六步向导**

  页面内完成选择目录、扫描、预览处理、策略确认、提交和结果。逐项错误可展开查看；取消扫描或提交后不留下正式日志。完成后显示扫描、创建、更新、跳过、冲突、异常和原始字节统计。

- [ ] **Step 7: 注册导入路由**

  在共享路由表注册 `/data/import`，`ImportPage` 包装向导并接入两个组合根。Web 的文件选择与桌面目录选择分别由已注入的 `ImportSource` 决定，页面不能分支调用 Tauri 或浏览器 API。

- [ ] **Step 8: 运行验证**

  Run: `pnpm --filter @dailyflow/application test && pnpm --filter @dailyflow/infrastructure test && pnpm --filter @dailyflow/features test -- import-wizard && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml import_transaction`

  Expected: 编码、日期和冲突测试通过；故障注入下正式表零新增；第二次同目录导入全部按策略跳过。

- [ ] **Step 9: 提交**

  Run: `git add packages apps/desktop apps/web && git commit -m "feat: add transactional txt import workflow"`

### Task 19: Markdown 与 NDJSON 数据导出

**依赖**：Task 18。

**Files**

- Create: `packages/application/src/use-cases/export-data.ts`
- Create: `packages/application/src/ports/export-target.ts`
- Create: `packages/infrastructure/src/shared/export/export-manifest.ts`
- Create: `packages/infrastructure/src/shared/export/markdown-exporter.ts`
- Create: `packages/infrastructure/src/shared/export/ndjson-exporter.ts`
- Create: `packages/infrastructure/src/web/web-export-target.ts`
- Create: `packages/infrastructure/src/desktop/desktop-export-target.ts`
- Create: `packages/features/src/data-management/export-panel.tsx`
- Create: `packages/features/src/data-management/export-page.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/infrastructure/test/export.test.ts`
- Create: `apps/desktop/src-tauri/tests/export_files.rs`

- [ ] **Step 1: 写导出快照测试**

  使用固定 Journal、Knowledge、Task、附件和原始导入数据，断言 Markdown、NDJSON 字段顺序稳定、日期路径正确、中文标题可读、软删除默认排除。

- [ ] **Step 2: 从权威 JSON 生成 Markdown**

  导出时重新调用 projector，不信任旧 `content_markdown`。标题文件名按 Windows/macOS 共同非法字符净化，冲突时附加短 ID；附件使用相对路径。完整备份与普通导出必须复用同一转换器。

- [ ] **Step 3: 实现 NDJSON**

  每行一个完整 DTO，包含 `entityType`、`schemaVersion`、稳定 ID 和规范化正文 JSON。字段顺序与换行固定，空值与本地绝对路径不写入。

- [ ] **Step 4: 实现 manifest 与原子输出**

  输出先写临时目录/临时 ZIP，完成后校验计数和 SHA-256 再原子 rename。取消或写入失败时清理临时目标，不覆盖用户已有同名导出。

- [ ] **Step 5: 接入 UI**

  显示导出范围、包含项、软删除选项和预计大小。桌面使用原生保存对话框；Web 优先保存句柄，回退 Blob 下载并提示浏览器内存限制。

- [ ] **Step 6: 注册导出路由**

  在共享路由表注册 `/data/export`，`ExportPage` 包装导出面板并接入两个组合根。桌面保存对话框和 Web 下载行为必须通过 `ExportTarget` 注入，UI 不直接读取 `showSaveFilePicker` 或 Tauri 对话框 API。

- [ ] **Step 7: 运行验证**

  Run: `pnpm --filter @dailyflow/infrastructure test -- export && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml export_files`

  Expected: 同一 fixture 重跑导出内容哈希一致；路径净化和已有文件保护通过。

- [ ] **Step 8: 提交**

  Run: `git add packages apps/desktop apps/web && git commit -m "feat: add deterministic markdown and ndjson export"`

### Task 20: 完整备份、校验与可回滚恢复

**依赖**：Task 19。

**Files**

- Create: `packages/application/src/use-cases/create-backup.ts`
- Create: `packages/application/src/use-cases/inspect-backup.ts`
- Create: `packages/application/src/use-cases/restore-backup.ts`
- Create: `packages/application/src/ports/backup-archive.ts`
- Create: `packages/infrastructure/src/shared/backup/backup-manifest.ts`
- Create: `packages/infrastructure/src/shared/backup/backup-validator.ts`
- Create: `packages/infrastructure/src/web/web-backup-service.ts`
- Create: `packages/infrastructure/src/desktop/desktop-backup-service.ts`
- Create: `apps/desktop/src-tauri/src/backup/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/backup_commands.rs`
- Create: `packages/features/src/data-management/backup-panel.tsx`
- Create: `packages/features/src/data-management/backup-page.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/infrastructure/test/backup.test.ts`
- Create: `apps/desktop/src-tauri/tests/backup_restore.rs`

- [ ] **Step 1: 写归档失败测试**

  覆盖 manifest 缺字段、schema 过新、实体 ID 重复、附件哈希错误、导入原始字节哈希错误、`../`/UNC/盘符路径、压缩炸弹和恢复到已存在数据时的安全快照。

- [ ] **Step 2: 生成可移植备份**

  写入正文、历史版本、结构化块、知识、任务、标签关系、报告、附件、导入条目和 `imports/raw/<hash前缀>/<sha256>.bin`。每个 captured 文件登记 checksum；`rawCaptureStatus`、可空哈希/大小必须一起导出，`cleaned` 与 `unavailable` 都写 `rawBlobPath: null`，不能伪造文件或混淆两种状态。

- [ ] **Step 3: 实现一致性读取**

  桌面可在逻辑只读事务中读取；另有快速备份时使用 `VACUUM INTO`，不得直接复制 WAL 活跃数据库。Web 用单个读事务或冻结写入的 staging 游标，避免备份期间混入不同 revision。

- [ ] **Step 4: 实现校验与 staging**

  恢复先解包到受限临时目录或 staging stores，逐项校验 manifest、Schema、外键、日期唯一性、正文 JSON、附件和导入原始字节状态。`captured` 校验哈希与大小，`cleaned` 校验清理时间与保留哈希/大小，`unavailable` 校验读取错误且不得出现原始字节文件。限制总解压量、单文件大小和文件数量。

- [ ] **Step 5: 实现可回滚切换**

  当前数据库非空时先自动创建安全快照，再在临时数据库/独立 stores 导入。校验成功后通过数据库替换或单事务切换；任何失败删除 staging 并保留当前数据。恢复后搜索标记 `stale`，由显式重建恢复。

- [ ] **Step 6: 注册备份路由**

  在共享路由表注册 `/data/backup`，`BackupPage` 包装备份面板并接入两个组合根。恢复失败、取消和成功三种状态在桌面与 Web 都可观察，失败后仍可返回原有数据。

- [ ] **Step 7: 运行验证**

  Run: `pnpm --filter @dailyflow/infrastructure test -- backup && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml backup_restore`

  Expected: 备份后重开校验通过；在附件、原始字节和正文三类故障下当前库均可正常打开且实体计数不变。

- [ ] **Step 8: 提交**

  Run: `git add packages apps/desktop apps/web && git commit -m "feat: add verified portable backup and rollback recovery"`

### Task 21: Data Management、健康检查与索引重建

**依赖**：Task 20。

**Files**

- Create: `packages/application/src/queries/storage-info-query.ts`
- Create: `packages/application/src/use-cases/check-data-health.ts`
- Create: `packages/application/src/use-cases/rebuild-search-index.ts`
- Create: `packages/infrastructure/src/desktop/desktop-health-query.ts`
- Create: `packages/infrastructure/src/web/dexie-health-query.ts`
- Create: `packages/features/src/data-management/data-management-page.tsx`
- Create: `packages/features/src/data-management/storage-overview.tsx`
- Create: `packages/features/src/data-management/health-report.tsx`
- Create: `packages/features/src/data-management/index-maintenance.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `apps/desktop/src-tauri/src/commands/data_commands.rs`
- Create: `packages/features/test/data-management.test.tsx`
- Create: `apps/desktop/src-tauri/tests/data_health.rs`

- [ ] **Step 1: 写健康检查测试**

  构造重复有效日期、失效外键、孤立附件、搜索文档计数不一致、投影版本过旧和最后备份为空，断言检查返回可操作项且不自动删除正文。

- [ ] **Step 2: 查询存储概览**

  显示存储类型、应用数据目录的逻辑位置、数据库/Schema 版本、占用空间、附件数、导入原始字节数、搜索状态和最后备份时间。Web 额外显示 `persist()` 状态及配额估算，不暴露绝对路径。

- [ ] **Step 3: 实现索引重建**

  按稳定 ID 分批从权威 JSON 生成 `SearchDocument`，写入 `searchTermPostings`/FTS，支持进度、取消和失败保留旧索引。完成后比较实体计数再原子标记 `ready`。

- [ ] **Step 4: 汇总 Data Management**

  同页提供导入、导出、备份恢复和健康检查入口。危险操作使用明确影响说明和二次确认；索引重建、原始字节清理与恢复不在同一操作中静默执行。

- [ ] **Step 5: 注册 Data Management 路由**

  在共享路由表注册 `/data`，并保留 `/data/import`、`/data/export`、`/data/backup` 子入口；两个组合根同时接入。桌面和 Web 都能从 `/data` 进入所有子页面，索引重建进度和取消结果持续可见。

- [ ] **Step 6: 运行验证**

  Run: `pnpm --filter @dailyflow/features test -- data-management && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml data_health`

  Expected: 每个异常都有原因和建议；取消重建后正文可读；恢复健康和重建索引后状态回到 `ready`。

- [ ] **Step 7: 提交**

  Run: `git add packages apps/desktop apps/web && git commit -m "feat: add data management health and index maintenance"`

### Task 22: 设置、平台快捷键与可选 AI 接缝

**依赖**：Task 21。

**Files**

- Create: `packages/application/src/ports/ai-provider.ts`
- Create: `packages/application/src/ports/secret-store.ts`
- Create: `packages/application/src/use-cases/run-ai-assist.ts`
- Create: `packages/ai/src/disabled-ai-registry.ts`
- Create: `packages/ai/src/provider-registry.ts`
- Create: `packages/ai/test/disabled-registry.test.ts`
- Create: `packages/infrastructure/src/desktop/desktop-secret-store.ts`
- Create: `packages/infrastructure/src/web/web-secret-store.ts`
- Create: `packages/features/src/settings/settings-page.tsx`
- Create: `packages/features/src/settings/shortcut-settings.tsx`
- Create: `packages/features/src/settings/ai-settings.tsx`
- Create: `packages/features/src/platform/command-registry.ts`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/desktop/src/routes/router.tsx`
- Modify: `apps/web/src/routes/router.tsx`
- Create: `packages/features/test/command-registry.test.tsx`
- Create: `packages/features/test/settings.test.tsx`

- [ ] **Step 1: 写平台快捷键测试**

  抽象 `Mod`，断言 Windows Ctrl、macOS Cmd、Web 平台识别；输入框、代码块和对话框内不劫持文本编辑。覆盖冲突提示和快捷键帮助面板。

- [ ] **Step 2: 实现设置持久化**

  主题、密度、自动保存间隔、周起始日和历史保留策略经过 Zod 校验写入 `settings`。非法值回退默认并提示；设置读取失败不阻止打开日志。

- [ ] **Step 3: 实现 AI 端口与默认关闭**

  在 Application 定义 `AiProviderPort`、`AiProviderRegistry`、`AiCancellation` 和 `SecretStore` 接口；V1 组合根注入 `DisabledAiRegistry`，UI 明确显示“未配置”，不发起网络请求。

- [ ] **Step 4: 固化安全凭据边界**

  用内存 fake 验证 `SecretStore` 契约，禁止 Key 写入 IndexedDB、`localStorage`、备份或诊断日志。V1 不展示真实厂商 Key 输入；未来 Provider 接入时，桌面使用系统钥匙串，Web 只放当前标签页内存或要求每次输入。SecretStore 失败只影响未来 AI 扩展。

- [ ] **Step 5: 验证禁用态和未来显式流程契约**

  V1 不显示可触发真实请求的 AI 操作，网络替身记录到的请求数必须为 0。用 fake Provider 验证未来请求必须由用户显式发起，预览显示 Provider、用途、片段、代码块、字符数和目标；支持取消/超时，返回文本只能进入草稿区并经确认保存。不得发送附件、路径、完整历史或代码块。

- [ ] **Step 6: 注册 Settings 路由**

  在共享路由表注册 `/settings` 并接入两个组合根。桌面和 Web 都要验证快捷键帮助、设置非法值回退、未配置 AI 状态和安全凭据提示；桌面 HashRouter 重新进入设置后仍能读取已持久化设置。

- [ ] **Step 7: 运行验证**

  Run: `pnpm --filter @dailyflow/ai test && pnpm --filter @dailyflow/features test -- settings && pnpm --filter @dailyflow/features test -- command-registry && pnpm --filter @dailyflow/web build && pnpm --filter @dailyflow/desktop build`

  Expected: 无 Provider 时所有设置和报告正常；Web 存储中找不到 API Key；快捷键在三种平台映射正确。

- [ ] **Step 8: 提交**

  Run: `git add packages apps/desktop apps/web && git commit -m "feat: add settings shortcuts and optional ai boundary"`

### Task 23: Playwright 跨端验收与可访问性

**依赖**：Task 18-22。

**Files**

- Create: `playwright.config.ts`
- Create: `apps/web/e2e/fixtures/seed.ts`
- Create: `apps/web/e2e/journal.spec.ts`
- Create: `apps/web/e2e/import-export.spec.ts`
- Create: `apps/web/e2e/search-timeline.spec.ts`
- Create: `apps/web/e2e/backup-restore.spec.ts`
- Create: `apps/web/e2e/accessibility.spec.ts`
- Create: `apps/web/e2e/mobile-layout.spec.ts`
- Create: `apps/desktop/e2e/smoke.spec.ts`
- Create: `scripts/run-desktop-smoke.ps1`
- Create: `scripts/run-desktop-smoke.sh`

- [ ] **Step 1: 建立可重复种子数据**

  每个测试使用独立 origin/数据目录，通过公开 Application 用例写入固定日志、任务、知识、冲突日期和编码 fixture；不得直接改 IndexedDB 或 SQLite 绕过业务规则。

- [ ] **Step 2: 写 Web 关键工作流**

  覆盖首次启动、今日记录、800ms 自动保存、版本恢复、TXT 目录导入、预览冲突、搜索、导出、备份与恢复失败。断言数据库无部分写入和 UI 保存状态一致。

- [ ] **Step 3: 写布局与可访问性**

  在 375x812、1024x700、1440x900 截图和检查无重叠、无横向溢出。使用 axe 检查主要页面，键盘完成新建日志、保存、搜索、创建任务和打开 Data Management。

- [ ] **Step 4: 建立桌面自动化**

  Windows CI 使用 Tauri WebDriver 可自动化部分执行启动、编辑、导入、关闭保存和备份冒烟；macOS 没有可靠的同级 WebDriver 时，执行 Rust 集成测试、应用构建和签名产物启动冒烟，并在发布清单记录人工验收项。共享 UI 行为继续由 Web E2E 覆盖。

- [ ] **Step 5: 设置稳定性门槛**

  固定时区和区域设置；测试等待可观察状态，不使用任意 sleep。失败保留 trace、截图和视频；重试不能掩盖持续失败。

- [ ] **Step 6: 运行验证**

  Run: `pnpm e2e`

  Expected: Chromium、Firefox、WebKit 的核心 Web 用例通过；Windows 桌面冒烟通过；无严重或致命可访问性告警。

- [ ] **Step 7: 提交**

  Run: `git add . && git commit -m "test: add cross-platform e2e and accessibility coverage"`

### Task 24: CI、安装包构建、签名与发布验收

**依赖**：Task 23。

**Files**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/e2e.yml`
- Create: `.github/workflows/release-desktop.yml`
- Create: `.github/workflows/deploy-web.yml`
- Create: `scripts/verify-artifacts.mjs`
- Create: `scripts/check-no-hardcoded-paths.mjs`
- Create: `docs/development/RELEASE-CHECKLIST.md`

- [ ] **Step 1: 配置 PR 质量门**

  CI 安装冻结 lockfile，依次执行 lint、typecheck、共享测试、Rust 格式/测试、Web 构建和依赖边界检查。缓存 key 包含 lockfile 哈希，不允许缓存跳过迁移测试。

- [ ] **Step 2: 配置三平台矩阵**

  Web 在 Ubuntu 构建并发布静态产物；Windows 构建 `x86_64-pc-windows-msvc`；macOS 分别构建 Intel `x86_64-apple-darwin` 与 Apple Silicon `aarch64-apple-darwin`。若后续发布 Universal 2，在签名前用 lipo 合并并单独验证，不改变 V1 两种架构覆盖。

- [ ] **Step 3: 配置签名与公证**

  PR 构建不要求签名密钥。发布工作流仅在受保护 tag 上读取 GitHub Secrets：Windows Authenticode 证书、macOS Developer ID、Apple ID/公证凭据。缺失密钥时发布失败，不生成“看似正式”的未签名包。

- [ ] **Step 4: 校验产物**

  构建后检查 Web CSP、Tauri identifier/版本、Windows WebView2 安装提示、macOS 最低版本、架构、签名和安装包哈希。禁止产物包含绝对开发路径、私钥、SQLite 测试库或用户数据。

- [ ] **Step 5: 发布验收**

  在一台真实 Windows 10 22H2/11、Intel macOS 和 Apple Silicon macOS 上安装并完成启动、记录、关闭重开、TXT 导入、搜索、备份、恢复和卸载后数据保留检查。Web 在 Chrome/Edge 最新两个稳定版完成正式验收；Safari 当前稳定版完成兼容冒烟并记录目录导入的文件选择器降级，不把 Safari 的同级目录访问能力作为发布阻断项。

- [ ] **Step 6: 运行验证**

  Run: `pnpm build && pnpm e2e && pnpm verify:artifacts`

  Expected: 所有质量门通过；Web 静态包可离线启动；Windows 与两种 macOS 安装包签名有效且校验和与 manifest 一致。

- [ ] **Step 7: 提交并打候选标签**

  Run: `git add . && git commit -m "chore: add release pipelines and cross-platform gates" && git tag v1.0.0-rc.1`

  Expected: 标签触发发布候选构建；在发布清单全部勾选前不得标记稳定版。


