# ADR-0004：Web 端使用 Dexie/IndexedDB 存储

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：Web 持久化、事务、迁移、搜索和配额处理

## 背景

Web 端不能复用桌面 SQLite 文件。产品要求本地优先、无云端后端、多 store 原子写入、大量历史日志、附件和可恢复备份。浏览器能力还受 origin、配额、隐私模式和关闭页面生命周期影响。

## 决策

Web 端使用 Dexie 封装 IndexedDB，数据库名为 `dailyflow-web`。

- Application 只依赖 Repository/Service 端口。
- Dexie 对象和 store 只在 `packages/infrastructure/src/web` 内出现。
- 日志保存在一个 `rw` transaction 中跨 `journals`、`journalVersions`、`structuredBlocks`、标签和搜索 stores。
- ID 在应用层生成 UUIDv7；IndexedDB 自增键不作为业务 ID。
- 日期和 UTC 时间统一存字符串，不使用 JavaScript `Date` 依赖浏览器序列化。
- `searchDocs` 保存文档，`searchTermPostings` 保存可重建的分片倒排。
- 数据格式迁移与 Dexie store/index 版本分开编号，并写入 `meta.dataSchemaVersion`。
- 大迁移和恢复使用 Web Locks、staging 或失败保留策略，禁止边清空边导入。

## 浏览器约束

- IndexedDB 按 origin 隔离，本地端口变化会产生新数据库。
- 浏览器可能在空间不足或用户清理时删除站点数据；必须请求 `persist()`、显示结果并提供备份。
- Safari 的持久化和目录访问能力与 Chromium 不同，只承诺明确降级。
- IndexedDB 没有 SQL 外键和 SQLite 部分唯一索引。唯一日期、关系和级联语义由事务中的 adapter 和 Application 显式保证。
- 事务内不得发网络请求或等待不可控 UI 操作，否则浏览器可能提前终止事务。

## 被否决的方案

### `localStorage`

容量小、同步阻塞、只能存字符串，不适合结构化日志和附件。否决。

### 每次启动加载全部数据到内存

小数据集可用，但无法满足长期历史和 10 万日志目标，且关闭页面容易丢数据。否决为持久化主方案。

### Web 直接连接桌面 SQLite

浏览器不能安全、通用地打开本地 SQLite 文件；也无法满足多标签事务和平台一致性。否决。

### 云端数据库作为 Web 默认存储

违反 V1 本地优先、无账号和离线要求。否决。

## 后果

- Web 端需要自己的查询、排序、分页和索引实现，并通过共享契约测试。
- 附件以 Blob 存在 IndexedDB，受浏览器配额限制。
- Web 大备份可能超出内存，需要流式 ZIP 或明确警告。
- 跨端一致是业务结果一致，不是物理 schema 相同。
- 浏览器测试必须使用独立 origin/profile，避免测试互相污染。

## 验证

- `fake-indexeddb` 覆盖创建、保存、冲突、回滚、迁移、搜索和软删除。
- 同一 fixture 在 Dexie 与 SQLite 返回等价 DTO、revision 和查询结果。
- 配额错误映射为 `QUOTA_EXCEEDED`，保留编辑器草稿。
- 页面刷新、标签切换和多标签写入有自动化和手工验证。
- 清除站点数据前必须有导出/备份入口和提示。

## 关联文档

- [系统架构](../../architecture/SYSTEM-ARCHITECTURE.md)
- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [搜索设计](../../architecture/SEARCH-DESIGN.md)
- [开发指南](../../development/DEVELOPMENT-GUIDE.md)
