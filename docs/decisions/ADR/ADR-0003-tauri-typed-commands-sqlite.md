# ADR-0003：桌面端使用类型化 Tauri Commands 与 Rust/SQLite

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：Windows/macOS 桌面存储、命令、事务和文件能力

## 背景

桌面端需要 SQLite 事务、FTS5、附件文件、备份归档和原生文件对话框。直接把 SQL 从 WebView 发到 SQLite 可以让前端共享更多代码，但会让事务、路径安全和跨语言数据契约散落在 React 代码中。

## 决策

桌面端采用“React -> TypeScript adapter -> typed Tauri command -> Rust service -> SQLite/file system”的边界。

```text
DesktopJournalRepository (TS)
  -> invoke("journal_save_snapshot", payload)
  -> Rust validates DTO and owns transaction
  -> SQLite + FTS5 + attachment metadata
  -> typed result
  -> TS DTO mapper
```

规则：

- Application/UI 只依赖 Repository 端口，不导入 Tauri `invoke`。
- Tauri command 名称和 payload/response 字段由 TypeScript contract 与 Rust serde 显式固定为 camelCase。
- 每个业务写操作使用语义命令，不提供任意 SQL 执行命令。
- Rust 在一个事务中完成日志正文、版本、结构化投影、标签和搜索更新。
- 附件使用内容哈希和逻辑相对路径；路径由 Rust 规范化并限制在用户选择根目录或应用数据目录。
- SQLite 迁移由 Rust 管理，已发布迁移不可编辑。
- 同步 `rusqlite` 调用放入阻塞线程，不阻塞 Tauri 主线程。
- DTO 漂移由共享 fixture 和 CI 脚本阻断。

## SQLite 驱动

推荐 `rusqlite` 同步 API + `spawn_blocking`：

- 事务、FTS5、`VACUUM INTO` 和文件路径控制直观。
- 依赖相对小，容易在 Rust 集成测试中创建临时数据库。
- 代价是需要显式管理阻塞调用和手写行映射。

备选 `sqlx` async SQLite 也可行，但迁移、Tauri command 生命周期和运行时配置更复杂。进入 Task 7 前必须二选一并记录新的 Accepted ADR。

## 被否决的方案

### `tauri-plugin-sql` 从 TypeScript 执行 SQL

实现快，但事务、查询和迁移会泄漏到 UI/Application，附件和备份仍需 Rust，增加双边界。不推荐作为主方案。

### Rust 只提供通用 KV/JSON 存储

短期简单，长期无法可靠实现全文搜索、关系查询、迁移和一致性检查。否决。

### 直接复制 SQLite 文件作为同步或在线备份

WAL 活跃时文件不一致，也无法适配 Web IndexedDB 和附件。仅允许用一致性快照生成备份。

## 后果

- 每个跨端业务操作需要定义 TypeScript DTO 和 Rust DTO。
- Rust 只承担持久化、文件安全、事务和稳定错误映射，不重复实现领域规则。
- 桌面自动化需要测试 Rust command 和前端 adapter 映射，不能只测 React。
- Windows 和 macOS 共用同一命令协议，但构建、签名和 WebView 运行时分别验证。

## 验证

- 临时 SQLite 中验证迁移、revision 冲突、事务回滚和 FTS5。
- Rust fixture 与 TypeScript Zod schema 字段完全一致。
- 路径穿越、符号链接逃逸和用户取消对话框有失败测试。
- 页面 bundle 不直接导入 `tauri-client.ts`。
- Windows/macOS 启动命令和关闭保存通过平台冒烟。

## 关联文档

- [系统架构](../../architecture/SYSTEM-ARCHITECTURE.md)
- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [开发指南](../../development/DEVELOPMENT-GUIDE.md)
