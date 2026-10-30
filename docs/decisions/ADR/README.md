# DailyFlow 架构决策记录

## 1. 用途

ADR 记录会影响多个包、跨端数据契约或长期演进成本的技术决策。它说明当时的问题、选择、被否方案和后果，不替代详细设计文档。

发生以下变化时必须新增或更新 ADR：

- Domain、Application、Infrastructure 的依赖方向。
- 权威正文格式或编辑器 Schema 策略。
- SQLite、IndexedDB、Tauri command 或文件存储边界。
- ID、revision、日期、软删除、同步协议。
- 导入、备份、恢复的事务和安全语义。
- AI、网络、凭据或隐私边界。

## 2. 状态

| 状态 | 含义 |
| --- | --- |
| Proposed | 已形成设计基线，等待项目负责人确认或实现验证 |
| Accepted | 已确认并成为当前实现约束 |
| Superseded | 已被后续 ADR 替代，旧记录保留 |
| Deprecated | 不再建议使用，但可能仍有兼容数据 |

当前文档全部为 `Proposed`。完成第一阶段评审后，按确认结果改为 `Accepted`，或在实现前新增替代 ADR。

## 3. 索引

| ADR | 决策 | 状态 | 主要影响 |
| --- | --- | --- | --- |
| [ADR-0001](ADR-0001-monorepo-boundaries.md) | pnpm/Turborepo Monorepo 与单向依赖 | Proposed | 全部包、组合根、CI |
| [ADR-0002](ADR-0002-tiptap-json-authority.md) | Tiptap JSON 单一权威，Markdown 派生 | Proposed | 编辑器、数据库、搜索、导出 |
| [ADR-0003](ADR-0003-tauri-typed-commands-sqlite.md) | Tauri typed commands + Rust/SQLite | Proposed | 桌面端、迁移、事务、附件 |
| [ADR-0004](ADR-0004-dexie-indexeddb.md) | Web 使用 Dexie/IndexedDB adapter | Proposed | Web 存储、事务、配额 |
| [ADR-0005](ADR-0005-stable-ids-revisions-sync.md) | 稳定 ID、revision、软删除与同步预留 | Proposed | 所有实体、未来同步 |
| [ADR-0006](ADR-0006-import-raw-bytes-transaction.md) | TXT 原始字节保留与原子导入 | Proposed | 数据迁移、备份、恢复 |
| [ADR-0007](ADR-0007-optional-ai-provider.md) | AI 默认关闭且 Provider 可插拔 | Proposed | Application 端口、设置、隐私 |

## 4. 相关设计

- [产品需求](../../product/PRD.md)
- [系统架构](../../architecture/SYSTEM-ARCHITECTURE.md)
- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [编辑器设计](../../architecture/EDITOR-DESIGN.md)
- [导入导出设计](../../architecture/IMPORT-EXPORT-DESIGN.md)
- [搜索设计](../../architecture/SEARCH-DESIGN.md)
- [同步协议](../../architecture/SYNC-PROTOCOL.md)
- [UI 设计](../../architecture/UI-DESIGN.md)
- [开发计划](../../development/DEVELOPMENT-PLAN.md)
- [开发指南](../../development/DEVELOPMENT-GUIDE.md)

## 5. 待确认决策

以下选择不阻塞文档完成，但应在进入对应任务前确认：

1. **Rust SQLite 驱动**：推荐 `rusqlite` + `spawn_blocking`，Task 7 前确认；若改用 `sqlx`，必须重新评估迁移、FTS5 和 Tauri 事务实现。
2. **macOS 分发**：推荐分别发布 Intel 与 Apple Silicon 签名包，Universal 2 作为可选后续产物；需确认包体、下载和 CI 成本。
3. **历史版本保留**：推荐最近 100 个检查点或 180 天；需确认是否需要更短或可无限保留。
4. **软删除保留**：推荐 30 天；任务恢复策略需与回收站 UI 一并确认。
5. **Web 浏览器基线**：推荐 Chrome/Edge 为正式验收，Safari/Firefox 为兼容或核心回归；需确认 Safari 目录导入是否可以接受文件选择器降级。
6. **编辑器默认体验**：推荐浅色主题、约 820 px 正文宽度和默认 800 ms 自动保存；这些产品偏好不改变存储契约。
7. **AI Provider**：V1 只要求端口、默认禁用和设置边界，不要求接入具体厂商；若 V1 要提供某个 Provider，需要补充网络、费用和隐私验收。

## 6. 维护规则

- ADR 文件编号不复用，不删除历史。
- 已被替代的记录更新状态并链接到新 ADR。
- 设计变更先判断是否影响 ADR；仅改 UI 文案不需要 ADR。
- ADR 中的接口示意必须与代码公共 API 同步，不能长期保留失效名称。
- 修改 ADR 后同步更新数据库、系统架构、开发计划和 README 中的相关链接。
