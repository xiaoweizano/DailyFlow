# DailyFlow 开发指南

## 1. 适用范围

本文面向实现 DailyFlow V1 的开发者，覆盖本地工具链、Windows/macOS/Web 开发环境、存储调试、测试矩阵、CI、签名准备和常见故障。

仓库已经完成 Monorepo、核心业务和自动化质量门禁的初始化。实际命令和版本约束以根 `package.json`、`.node-version`、`pnpm-lock.yaml`、`Cargo.lock`、`.github/workflows/` 和本文为准。

实现前先阅读：

- [开发计划](DEVELOPMENT-PLAN.md)
- [编码规范](CODING-STANDARDS.md)
- [系统架构](../architecture/SYSTEM-ARCHITECTURE.md)
- [数据库设计](../architecture/DATABASE-DESIGN.md)

## 2. 工具链基线

| 工具 | 基线 | 用途 |
| --- | --- | --- |
| Node.js | 当前维护中的 LTS，固定到 `.node-version` | Vite、React、测试和脚本 |
| pnpm | 使用根 `package.json` 的 `packageManager` 版本，通过 Corepack 启用 | workspace 依赖管理 |
| Rust | stable toolchain，提交 `rust-toolchain.toml` 后以其为准 | Tauri 2 与 SQLite 适配层 |
| Tauri CLI | 与 `@tauri-apps/*`、Rust crate 和配置保持一致 | 桌面开发与构建 |
| SQLite | Rust 侧可控制的版本，必须启用 FTS5 | 桌面端数据与全文搜索 |
| Playwright | 与 lockfile 固定的版本 | Web 和桌面冒烟 |

版本规则：

- 本地、CI 和发布机使用同一 Node major、pnpm 和 Rust stable。
- 不在文档或业务代码中依赖未锁定的“最新版”。
- 升级 Node、Rust、Tauri、Dexie、SQLite 或编辑器 Schema 时单独提交，并重新跑跨端契约测试。
- `Cargo.lock` 和 `pnpm-lock.yaml` 都进入版本控制。

安装 Corepack 管理的 pnpm：

```bash
corepack enable
pnpm --version
```

如果系统不允许 Corepack 写入 Node 安装目录，使用用户级 Corepack 安装方式，不要让 `sudo` 或管理员运行整个项目脚本。

## 3. 平台准备

### 3.1 Windows

需要：

- Windows 10 22H2 或 Windows 11。
- Visual Studio Build Tools 的“使用 C++ 的桌面开发”工作负载。
- Windows 10/11 SDK 与 MSVC x64 工具链。
- Evergreen WebView2 Runtime。Windows 11 通常自带；Windows 10 开发机可能由 Edge 提供。
- Git，并允许 Git 正确读取 UTF-8 和中文路径。

检查 Rust 目标：

```powershell
rustup show active-toolchain
rustup target list --installed
```

桌面开发只使用 `x86_64-pc-windows-msvc` 作为 V1 基线。不要用 GNU toolchain 生成发布包。

如果 Tauri 启动时报 WebView2 缺失，先安装 Evergreen Runtime，再重新启动开发命令。不要把固定版本的 WebView2 运行时提交到仓库；正式安装包可以选择 Tauri 支持的离线引导方案，但需单独验证体积与更新策略。

### 3.2 macOS

需要：

- macOS 12 或以上。
- Xcode Command Line Tools。
- Rust stable。
- Intel 与 Apple Silicon 分别准备，或至少有一台机器能运行交叉目标和发布冒烟。

```bash
xcode-select --install
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

V1 发布矩阵分别覆盖：

- Intel：`x86_64-apple-darwin`
- Apple Silicon：`aarch64-apple-darwin`
- Universal 2：可选发布形态，不是架构兼容的替代验收

如果在 Apple Silicon 构建 Intel 包，必须实际在 Intel 硬件或受支持的 CI runner 上安装启动验证。仅“编译成功”不能证明 WKWebView、附件路径和签名可用。

Universal 2 需要合并两个架构的 Rust 与 Tauri 产物，并在签名前验证 `lipo -info`、最低 macOS 版本、资源和 Web 前端哈希。该发布方式需在计划确认后单独加入构建流水线，不能改变 SQLite 数据和前端代码。

### 3.3 Web

Web 开发需要：

- Chrome 或 Edge 当前稳定版，用于主要验收。
- Safari 当前稳定版，用于兼容检查。
- Firefox 当前稳定版，用于 Playwright 核心回归。
- 固定本地 origin，例如 `http://localhost:5173`。IndexedDB 按 scheme、host 和 port 隔离，随意更换端口会被视为新数据空间。

Web 开发不依赖 Tauri、Rust 或任何云端服务。若页面启动时要求登录或远端 API，说明依赖边界被破坏。

File System Access API 只在安全上下文可用。`localhost` 可作为开发例外；正式部署必须使用 HTTPS。Safari 不支持完整目录写入时，回退到 `<input webkitdirectory>` 和普通下载，不应伪装成相同能力。

## 4. 初始化与常用命令

首次安装和质量门禁：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm depcruise
pnpm check:hardcoded-paths
pnpm typecheck
pnpm test
```

日常入口：

```bash
# 共享包监听与测试
pnpm test
pnpm test:watch

# Web
pnpm dev:web
pnpm --filter @dailyflow/web build

# 桌面，需要完整 Tauri 平台依赖
pnpm dev:desktop
pnpm --filter @dailyflow/desktop build
pnpm --filter @dailyflow/desktop tauri:build

# Rust
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml

# 浏览器和桌面 E2E
pnpm e2e

# 构建两个前端并验证产物
pnpm build
pnpm verify:artifacts
```

共享页面、功能组件和 Zustand 功能状态位于 `packages/features`。`apps/web` 与 `apps/desktop` 只负责平台能力、具体 adapter 和路由入口装配，不复制业务页面。目录职责、完整依赖方向和组合根规则见 [系统架构](../architecture/SYSTEM-ARCHITECTURE.md)。排查 import 错误前，先确认 `packages/features` 没有导入 `@dailyflow/infrastructure/desktop` 或 `@dailyflow/infrastructure/web`，也没有任何核心包从 Domain 导入 React、Tauri 或 Dexie。

## 5. 本地运行模型

### 5.1 Web

```text
Vite dev server
  -> apps/web composition root
  -> @dailyflow/infrastructure/web
  -> Dexie dailyflow-web
  -> browser IndexedDB
```

Web 数据位于浏览器 origin 的 IndexedDB。开发时：

- 使用固定浏览器 profile 和固定端口。
- 只在专用测试 profile 中清理站点数据，避免误删手工测试日志。
- 在 DevTools 的 Application/Storage 面板检查 `dailyflow-web`、`meta.dataSchemaVersion` 和 `meta.searchIndexState`。
- 不通过控制台直接改 store 来“修复”业务数据；使用 Application 用例或导出/恢复流程。
- 大附件、导入原始字节和备份包受浏览器配额限制，必须测试配额不足路径。

首次启动应调用 `navigator.storage.persist()` 请求持久化，并把结果展示在 Data Management。`persist()` 被拒绝不等于应用不可用，但必须强化备份提醒。

### 5.2 桌面

```text
Vite frontend
  -> apps/desktop composition root
  -> @dailyflow/infrastructure/desktop
  -> typed Tauri command
  -> Rust command + SQLite transaction/file service
  -> app_data_dir()
```

开发命令启动 Vite 与 Tauri 两个进程。SQLite、附件和备份路径由 Rust 运行时解析，不在前端拼接：

```text
Windows: %APPDATA%/<Tauri identifier>/
macOS:   ~/Library/Application Support/<Tauri identifier>/
Linux:   尽力保持可编译，不进入 V1 验收；由 Tauri 返回 XDG 路径
```

这些是平台约定示例，实际目录必须通过 `app.path().app_data_dir()` 和诊断页确认。若实现需要 `identifier`，Task 3 必须先固定并写入所有 Tauri 配置；业务代码不得依赖该字符串拼路径。

建议目录边界：

```text
<app_data_dir>/
├─ dailyflow.db
├─ attachments/<ab>/<cd>/<sha256>.bin
├─ backups/
├─ staging/
└─ logs/
```

`staging/` 只存未完成导入、导出和恢复任务；进程重启后可以安全清理过期临时项，但不能清理正式 `dailyflow.db` 或附件。

### 5.3 两种存储的切换

平台实现只在组合根注入，页面不读取 `isTauri` 后自行 new Repository。桌面数据和 Web 数据是两套独立本地存储，V1 不自动互相同步或共享目录。

跨端迁移路径是导出、可移植备份和恢复。开发时不要尝试让桌面应用打开 Web IndexedDB，也不要让 Web 直接读 SQLite 文件。

## 6. SQLite 与迁移

### 6.1 连接设置

每次打开连接都应确保：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

Rust command 的同步 SQLite 调用放在专用阻塞线程或 `spawn_blocking` 中，不阻塞 Tauri 主线程。

### 6.2 FTS5

桌面全文搜索依赖 FTS5。构建和测试必须验证：

```sql
CREATE VIRTUAL TABLE fts_probe USING fts5(value);
INSERT INTO fts_probe(value) VALUES ('dailyflow 中文检索');
DROP TABLE fts_probe;
```

如果迁移报 `no such module: fts5`：

1. 检查所选 SQLite crate/feature 是否启用 FTS5。
2. 确认没有链接到意外缺少 FTS5 的系统 SQLite。
3. 在 Rust 集成测试中创建临时表复现，不只靠开发机手工验证。

### 6.3 迁移流程

- 迁移文件放在 `apps/desktop/src-tauri/migrations/`，版本单调递增。
- 已发布迁移不得修改；修正必须新增迁移。
- 启动时校验 `schema_migrations.checksum`，不匹配就停止并提示，不自动降级。
- 每个迁移测试全新库、已有数据升级、重复运行和故障回滚。
- FTS 或大表回填分批执行，并记录 `search_index_state`。
- 破坏性迁移前使用一致性快照或要求用户备份。

本地重置桌面数据只能在明确命名的临时测试目录进行。不要用 `Remove-Item -Recurse`、`rm -rf` 或清空整个 `%APPDATA%` 来代替迁移修复。

## 7. IndexedDB 与 Dexie

Web 数据库名为 `dailyflow-web`。Dexie schema version 管 store/index 结构，`meta.dataSchemaVersion` 管应用数据格式，两者不能混为一个版本。

开发规则：

- 所有表名使用 [数据库设计](../architecture/DATABASE-DESIGN.md) 中的 store 名。
- 一次业务写入使用一个 `rw` transaction，不在事务中发网络请求或等待 UI。
- `fake-indexeddb` 测试验证事务回滚、索引和迁移。
- Web Locks 用于阻止多标签页同时执行破坏性迁移或恢复。
- 清理 IndexedDB 前先导出，尤其测试历史导入和附件时。
- 大迁移显示进度，并保留可恢复快照或 staging 标记。

IndexedDB 不是“小 SQLite”。不要依赖 SQL 查询、外键或部分唯一索引；日期唯一性、关系约束和排序必须由 Application/Repository 明确实现并通过跨端契约测试。

## 8. Tauri 命令与 DTO

Rust command 是安全与事务边界，不是 UI 的通用数据库代理。

- 每个业务写操作使用语义明确命令，例如 `journal_save_snapshot`。
- payload/response 使用显式 camelCase serde 字段。
- TypeScript 侧用 Zod 校验 IPC 返回值，并映射为 Application DTO。
- 命令不接受任意 SQL、未校验路径或任意文件系统操作。
- 用户选择的文件/目录先在 Rust 侧规范化，再检查目标在允许根目录内。
- Rust 返回稳定错误码，前端不解析原始 SQLite/IO 文本。

修改 DTO 后同时更新：

1. Rust fixture。
2. TypeScript Zod contract。
3. Application 映射。
4. 跨端契约 fixture。
5. `scripts/check-dto-fixtures.mjs` 的校验输入。

## 9. 测试矩阵

| 层 | 本地必跑 | CI | 说明 |
| --- | --- | --- | --- |
| Shared/Domain/Application | `pnpm test` | Windows/macOS/Ubuntu | 纯逻辑和内存 adapter |
| Editor | `pnpm --filter @dailyflow/editor test` | 同上 | JSON/Markdown、未知节点、迁移 |
| Web storage | fake IndexedDB | Ubuntu + 至少一个 macOS job | 事务、排序、配额错误映射 |
| Rust/SQLite | `cargo test` | Windows + macOS | 迁移、FTS5、文件安全、回滚 |
| DTO parity | fixture 脚本 | 所有平台 | 同一字段和枚举 |
| React UI | Vitest + Testing Library | Ubuntu | 可见状态、键盘、空/错/加载 |
| Web E2E | Chromium/Firefox/WebKit | 专用 e2e workflow | 固定 TZ 和 locale |
| Windows desktop | Tauri WebDriver 冒烟 | Windows runner | 应用启动、窗口标题与根节点加载；业务全流程由人工发布验收覆盖 |
| macOS desktop | Rust 集成 + 构建/启动冒烟 + 人工清单 | macOS runners | WKWebView 无同级可靠 WebDriver 时以人工验收补足 |

固定测试环境：

- `TZ=Asia/Shanghai` 与 `LANG=zh_CN.UTF-8` 至少覆盖中文日期和编码 fixture。
- Playwright 每个测试使用独立 origin 或独立 profile。
- 测试不依赖系统当前日期；通过 Clock 注入固定时间。
- 不使用任意 `sleep` 等待保存；等待可观察的“已保存”状态或数据库契约结果。
- 失败保留 trace、截图和视频，重试不能掩盖持续失败。
- 截图检查 375x812、1024x700 和 1440x900，确认无重叠和横向溢出。

常用命令：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 10. CI、构建与签名准备

### 10.1 PR 质量门

仓库包含四个工作流：

| 工作流 | 触发 | 作用 |
| --- | --- | --- |
| `ci.yml` | PR、main push、手动 | 冻结安装、格式、Lint、依赖边界、硬编码路径、类型、测试、前端构建、产物校验、三平台 Rust 测试 |
| `e2e.yml` | PR、main push、手动 | Chromium/Firefox/WebKit 浏览器回归与 Windows Tauri WebDriver 冒烟 |
| `deploy-web.yml` | main push、手动 | 使用 `/DailyFlow/` 基路径构建 Web，并发布 GitHub Pages |
| `release-desktop.yml` | `v*.*.*` tag、手动 | 受保护环境中的 Windows x64、macOS Intel 与 Apple Silicon 签名构建，创建草稿 Release |

PR 必须执行：

- pnpm 冻结 lockfile 安装。
- lint、format check、typecheck。
- TypeScript 测试、Editor round-trip、Rust 测试。
- 包边界和硬编码 Windows/macOS 路径扫描。
- DTO fixture 一致性。
- Web/桌面前端构建、产物 CSP 与打包元数据校验。
- Chromium/Firefox/WebKit E2E 和 Windows 桌面冒烟。

缓存 key 包含 lockfile 哈希。迁移和 FTS5 测试不能被缓存跳过。

### 10.2 发布工作流

| 产物 | Runner/目标 | 必要验证 |
| --- | --- | --- |
| Web | Ubuntu 静态构建 | CSP、离线启动、核心 E2E、资源哈希 |
| Windows | Windows x64 MSVC | Authenticode、WebView2、安装/升级/卸载 |
| macOS Intel | Intel 或受支持 runner | Developer ID、公证、Intel 启动 |
| macOS Apple Silicon | Apple Silicon runner | Developer ID、公证、arm64 启动 |
| Universal 2 | 计划确认后合并 | `lipo -info`、双架构启动、公证 |

签名密钥只放在受保护发布环境或 GitHub Secrets，不写入 `.env`、仓库、诊断包或构建缓存。PR 构建不要求密钥，发布 tag 缺少密钥时必须失败，而不是产出看似正式的未签名包。

Windows 准备 Authenticode 证书和时间戳服务。macOS 准备 Developer ID Application 证书、Apple Team ID 和公证凭据，使用 hardened runtime。证书轮换和过期时间写入发布运维记录。

发布环境 `release` 使用以下 Secrets：

| 平台 | Secrets |
| --- | --- |
| Windows | `WINDOWS_CERTIFICATE_BASE64`、`WINDOWS_CERTIFICATE_PASSWORD` |
| macOS | `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID` |

发布 tag 必须等于 `v` 加 Tauri 配置中的版本，例如应用版本 `0.1.0` 只能使用 `v0.1.0`。工作流只创建草稿 Release，完成[发布验收清单](RELEASE-CHECKLIST.md)后再人工发布。

## 11. 常见故障排查

| 现象 | 检查顺序 |
| --- | --- |
| `pnpm` 版本不对 | `corepack --version`、根 `packageManager`、是否进入仓库根目录 |
| Web 能构建但页面空白 | 浏览器控制台、CSP、路由 basename、静态资源相对路径 |
| Web 数据“消失” | 端口/origin 是否变化、浏览器 profile、站点数据是否被清理、控制台 quota |
| IndexedDB 写入失败 | 可用配额、隐私模式、事务是否跨 await 网络请求、是否被其他标签锁住 |
| Tauri 启动失败 | Rust toolchain、平台依赖、WebView2/Xcode、Tauri dev 日志 |
| `no such module: fts5` | Rust SQLite feature、系统链接库、临时 FTS5 测试 |
| SQLite `database is locked` | 是否长时间持有事务、是否 `BEGIN IMMEDIATE`、busy timeout、调试进程是否占用 |
| 保存一直失败 | DTO 校验、WAL 写权限、磁盘空间、文件只读、路径是否落在应用目录 |
| 中文导入乱码 | 原始字节是否保留、编码检测顺序、用户是否手动指定 GB18030 |
| 导入日期错误 | 文件名和月份目录优先级、禁止修改时间推断、时区是否被错误用于 LocalDate |
| macOS 提示应用损坏 | 签名、公证、quarantine、下载后哈希、是否把 arm64 包运行在 Intel |
| 桌面导出的 Markdown 乱码 | 导出是否为 UTF-8、文件写入是否使用二进制/明确编码、路径名是否被错误转义 |

故障日志不得包含正文、搜索词、API Key、Prompt、导入原始内容或绝对用户路径。需要更多上下文时使用实体 ID、错误码、平台和 Schema 版本。

## 12. 数据安全约定

- 不提交数据库、附件、备份、导入 fixture 中的真实个人数据或密钥。
- 测试 fixture 必须为合成内容，覆盖中文、BOM、GBK、CRLF 和长路径，但不使用真实日志。
- 不在常规单元测试中清理真实用户 profile。
- 手工破坏性测试前创建可移植备份，并记录测试目录。
- 不通过手工 SQL 修改当前正文；派生字段和搜索索引应从权威 JSON 重建。
- 恢复和迁移失败时保留当前库与 staging，先诊断，再决定清理。

## 13. 后续执行入口

从 [开发计划](DEVELOPMENT-PLAN.md) 查看已完成任务和剩余验收项。自动化任务完成后，先运行本地质量门禁；需要正式发布时，严格按[发布验收清单](RELEASE-CHECKLIST.md)完成真实硬件、签名、安装升级和浏览器验收。
