# DailyFlow

DailyFlow 是一款面向个人的跨平台工作日志与知识管理软件。它把每日工作记录、问题排查过程、解决方案、技术总结和轻量待办放在同一个本地优先的工作空间中，并支持将按月归档的 TXT 历史日志批量导入。

DailyFlow 不是在线协作平台，也不是 Obsidian 的替代品。V1 的核心目标是：

- 让每日记录足够快，不强制固定模板。
- 让过去的工作记录可以被搜索、回看和沉淀。
- 让数据保存在用户自己的设备上，导出和恢复路径清晰。
- 用一套领域模型服务 Windows、macOS 和 Web。

## 当前状态

仓库已经包含可运行的 Monorepo、共享领域与应用层、每日日志核心功能、SQLite/Tauri 与 IndexedDB/Dexie 存储适配、TXT 导入、搜索、备份恢复、自动化测试和跨平台构建配置。

V1 自动化交付门禁已经覆盖 Windows、macOS 与 Web 的构建验证。真实 Windows/macOS 安装、签名发布和 Safari 兼容验收仍需按[发布验收清单](docs/development/RELEASE-CHECKLIST.md)在对应环境执行。

文档入口：

- [产品需求](docs/product/PRD.md)
- [系统架构](docs/architecture/SYSTEM-ARCHITECTURE.md)
- [数据库设计](docs/architecture/DATABASE-DESIGN.md)
- [编辑器设计](docs/architecture/EDITOR-DESIGN.md)
- [导入导出设计](docs/architecture/IMPORT-EXPORT-DESIGN.md)
- [搜索设计](docs/architecture/SEARCH-DESIGN.md)
- [同步协议预留](docs/architecture/SYNC-PROTOCOL.md)
- [UI 设计](docs/architecture/UI-DESIGN.md)
- [开发计划](docs/development/DEVELOPMENT-PLAN.md)
- [编码规范](docs/development/CODING-STANDARDS.md)
- [开发指南](docs/development/DEVELOPMENT-GUIDE.md)
- [用户操作手册](docs/guides/USER-GUIDE.md)
- [发布验收清单](docs/development/RELEASE-CHECKLIST.md)
- [架构决策记录](docs/decisions/ADR/README.md)

## 技术栈

| 范畴 | 选型 |
| --- | --- |
| 工程 | Monorepo、pnpm workspace、Turborepo |
| 前端 | React、TypeScript、Vite、Tailwind CSS、shadcn/ui、Lucide |
| 编辑器 | Tiptap、ProseMirror、Tiptap Markdown 转换 |
| 状态与校验 | Zustand、Zod |
| 桌面端 | Tauri 2、Rust、SQLite |
| Web 端 | IndexedDB、Dexie |
| 测试 | Vitest、Playwright、Rust `cargo test` |

## 架构摘要

```text
React UI
  -> Application use cases
    -> Repository / Service ports
      -> Desktop adapters -> typed Tauri commands -> Rust -> SQLite
      -> Web adapters -> Dexie -> IndexedDB
```

依赖方向只允许从外向内：

- `packages/domain` 只包含纯 TypeScript 领域模型与规则。
- `packages/application` 编排用例，定义并依赖端口。
- `packages/infrastructure` 提供 SQLite/Tauri、IndexedDB、文件和平台服务适配器。
- `packages/features` 承载共享页面、功能交互和 UI 状态，依赖 Application、Domain、Editor、UI 与 Shared，并在该层使用 React 和 Zustand。
- `apps/desktop` 与 `apps/web` 是组合根，负责选择适配器、接入平台能力和渲染 `packages/features`。
- Domain 和 Application 不依赖 React、Tauri、Dexie、SQLite 或浏览器存储 API。

正文的权威表示是 Tiptap JSON。Markdown 和纯文本是由编辑器序列化器生成的派生物，用于搜索、导出和兼容；任何外部 Markdown 都只从转换入口进入，不能绕过保存管线直接改写权威正文。

## 目录结构

```text
dailyflow/
├─ apps/
│  ├─ desktop/                  # React 入口 + Tauri 2 宿主与 Rust 持久化命令
│  └─ web/                      # Web 组合根与 IndexedDB 适配器装配
├─ packages/
│  ├─ domain/                   # 纯领域实体、值对象、规则、领域错误
│  ├─ application/              # 用例、端口、DTO、查询对象
│  ├─ infrastructure/           # SQLite/Tauri/Dexie、文件、平台适配器
│  ├─ editor/                   # Tiptap 扩展、JSON/Markdown 转换、编辑命令
│  ├─ ui/                       # 设计令牌、shadcn 封装、通用展示组件
│  ├─ features/                 # 共享页面、功能交互、Zustand 功能状态
│  ├─ shared/                   # 日期、ID、Result、分词、通用工具
│  ├─ sync-contracts/           # 为未来同步预留的版本化协议类型
│  └─ ai/                       # AI Provider 端口适配与可选配置
├─ docs/
├─ scripts/
├─ pnpm-workspace.yaml
├─ turbo.json
├─ package.json
└─ tsconfig.base.json
```

`apps/web` 和 `apps/desktop` 会复用同一套 Domain、Application、Editor、UI、Features 和页面用例。两端只保留组合根、存储适配器、文件系统/附件能力、平台快捷键映射和窗口生命周期等外壳差异。

## 本地开发方式

工具版本以 `.node-version`、根 `package.json` 的 `packageManager` 和 `Cargo.lock` 为准。首次安装：

```bash
corepack enable
pnpm install --frozen-lockfile
```

常用开发与质量门禁：

```bash
# Web 开发
pnpm dev:web

# 桌面开发，需要 Rust、Tauri 2 平台依赖，以及 Windows WebView2 或 macOS Xcode 工具链
pnpm dev:desktop

# 静态检查与测试
pnpm format:check
pnpm lint
pnpm depcruise
pnpm check:dto-fixtures
pnpm check:hardcoded-paths
pnpm typecheck
pnpm test

# 浏览器 E2E；首次运行前安装所需浏览器
pnpm exec playwright install chromium firefox webkit
pnpm e2e

# 两端前端构建，然后校验 CSP、Tauri 打包元数据和构建产物
pnpm build
pnpm verify:artifacts

# Rust
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Web 和桌面数据是两套独立的本地存储；跨端迁移使用导出、备份和恢复，不要让 Web 直接读取 SQLite。开发环境、测试矩阵和故障排查见[开发指南](docs/development/DEVELOPMENT-GUIDE.md)，正式发布步骤见[发布验收清单](docs/development/RELEASE-CHECKLIST.md)。

## Windows 候选构建

推送到 `main` 后，CI、浏览器 E2E 和 `Build Windows Candidate` 工作流会并行运行。候选工作流只上传未签名的手工测试包，不创建 tag 或 GitHub Release：

- `DailyFlow_<version>_x64-unsigned-setup.exe`：NSIS 安装包。
- `DailyFlow_<version>_x64-portable.exe`：便携版可执行文件。
- `BUILD-INFO.txt` 和 `SHA256SUMS`：构建来源与完整性校验信息。

在 GitHub Actions 的 `Build Windows Candidate` 运行记录中下载 `dailyflow-windows-x64-unsigned-<commit-sha>` 产物。测试前应在 PowerShell 中使用 `Get-FileHash -Algorithm SHA256` 核对 `SHA256SUMS`。也可以手动触发：

```bash
gh workflow run candidate-desktop.yml --ref main
gh run list --workflow=candidate-desktop.yml --branch main --limit 1
```

## V1 边界

- 支持 Windows、macOS 和 Web。
- 数据本地存储，不提供账号、云同步、多人协作或服务端 API。
- 提供桌面端 SQLite 数据和附件备份、Web 端可导入导出的完整数据包。
- 支持 TXT 历史日志批量导入，并保留原始字节。
- AI 是默认关闭的可选扩展，不参与保存、搜索、导入或数据一致性的关键路径。
- Linux 不列入 V1 正式发布和验收，但领域层、同步协议、路径抽象保持可移植。

## 参考文档

- [产品需求文档](docs/product/PRD.md)
- [系统架构设计](docs/architecture/SYSTEM-ARCHITECTURE.md)
- [开发计划](docs/development/DEVELOPMENT-PLAN.md)
- [用户操作手册](docs/guides/USER-GUIDE.md)
- [架构决策记录](docs/decisions/ADR/README.md)

