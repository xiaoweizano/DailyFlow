# DailyFlow 同步协议预留设计

## 1. 状态声明

本文是未来同步能力的架构契约，不是 V1 功能范围。

V1 不实现：

- 用户账号、设备注册和服务端。
- 自动上传、下载和后台同步。
- 多端实时协作。
- 冲突合并 UI。
- 远端附件存储。

V1 必须提前保证：

- 所有业务实体有稳定 UUIDv7。
- 业务日期与 UTC 时间戳分离。
- 可变实体有 `revision`。
- 删除使用可追踪 tombstone。
- 附件内容有稳定 SHA-256。
- 同步协议 DTO 在 `packages/sync-contracts` 中独立版本化。
- Domain/Application 不依赖同步服务即可完整运行。

## 2. 设计目标

未来同步需要支持：

- 同一用户多设备。
- 离线编辑后重新连接。
- 增量推送和拉取。
- 幂等重试。
- 日志正文冲突不静默丢失。
- 删除、恢复和附件同步。
- 协议版本演进。
- 服务端故障时本地功能继续工作。

不要求：

- 多人同时编辑同一文档的实时协同。
- 跨用户共享空间。
- 在 V1 建立同步服务。
- 端到端加密作为第一版同步的必选前置。

## 3. 推荐同步模型

推荐“本地优先 + 服务端变更日志 + 乐观并发”模型。

```text
Device A local DB
  -> push changes after cursor
Server append-only change log + canonical entity state
  -> pull changes after cursor
Device A/B local DB
```

客户端始终先写本地，再异步同步。UI 不等待网络完成保存。

### 3.1 为什么不直接同步 SQLite 文件

- SQLite 文件不可安全合并。
- Web 使用 IndexedDB，不可能共享 SQLite 文件。
- 附件和搜索索引不适合整库传输。
- 无法表达逐实体冲突和增量恢复。

因此同步的是业务变更及其版本元数据，不是数据库文件。

## 4. 标识与时间

### 4.1 Device ID

每台设备首次启动生成 UUIDv7，并保存在 `app_metadata.device_id`。

### 4.2 Entity ID

- 客户端生成 UUIDv7。
- 离线创建不等待服务端分配。
- 云端必须接受客户端 ID。

### 4.3 Revision

- 每个可变聚合有单调递增 `revision`。
- `revision` 代表该实体的本地状态版本，不是全局顺序。
- 推送时带 `baseRevision` 和 `revision`。
- 服务端拒绝不满足 expected revision 的更新，并返回冲突记录。

### 4.4 Hybrid Logical Clock

协议使用 HLC 记录因果关系和大致顺序：

```ts
export interface HybridLogicalClock {
  wallTimeMs: number;
  counter: number;
  deviceId: string;
}
```

规则：

- 客户端在本地变更时生成 HLC。
- 收到远端时钟时更新本地 HLC。
- HLC 用于排序和冲突解释，不替代实体 revision。
- 服务端分配全局 `serverSequence` 用于 pull cursor。

## 5. 变更信封

```ts
export interface SyncChangeEnvelope<T = unknown> {
  protocolVersion: 1;
  changeId: string;               // UUIDv7，全局唯一
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: "upsert" | "delete" | "restore" | "attachment-put";
  baseRevision: number | null;
  revision: number | null;
  hlc: HybridLogicalClock;
  occurredAt: string;             // UTC ISO 8601
  payloadHash: string;            // 规范化 payload 的 SHA-256
  payload: T;
}

export type SyncEntityType =
  | "journal"
  | "journal_version"
  | "knowledge_item"
  | "task"
  | "tag"
  | "journal_tag"
  | "knowledge_tag"
  | "knowledge_link"
  | "attachment_blob"
  | "attachment_link"
  | "report"
  | "setting";
```

约束：

- `changeId` 保证 push 幂等。
- `payloadHash` 校验传输完整性。
- 删除不删除行，而是发送 `action = "delete"`，服务端保存 tombstone。
- 附件二进制不放进普通 JSON change，使用单独的附件上传协议。
- `journal_tag` 和 `knowledge_tag` 使用稳定复合标识，例如 `journalId:tagId`；它们是不可变关联，`baseRevision` 与 `revision` 可以为 `null`。
- `journal_version` 是追加式历史快照；同一个版本 ID 只能幂等写入，不能原地修改。
- 派生数据不单独同步：`structured_blocks`、Markdown、纯文本、`search_documents`、SQLite FTS 和 Web 倒排索引都由权威 Tiptap JSON 重建。
- `import_sessions`、`import_entries` 及其原始字节是本地迁移审计数据，V1 同步契约不传输它们；导入产生的 Journal 和 JournalVersion 正常同步。

## 6. Journal 同步载荷

```ts
export interface JournalSyncPayload {
  journalId: string;
  journalDate: string;
  timezone: string;
  title: string;
  contentJson: unknown;
  editorSchemaVersion: number;
  contentHash: string;
  status: "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

标签关系通过独立的 `tag` 与 `journal_tag` 实体同步，不嵌入 Journal 载荷，避免同一事实出现两份可分别修改的副本。派生字段 `contentMarkdown`、`contentPlainText`、结构化块投影和搜索文档不参与同步，接收端从权威 JSON 重建。

### 6.1 并发规则

- 若服务端当前 revision 等于 change 的 `baseRevision`，接受并更新。
- 若 change 是同一操作的幂等重放，直接返回已有结果。
- 若不同设备基于同一 base revision 修改正文，服务端不自动合并。
- 服务端保留远端版本和本地版本，返回 conflict。
- 客户端创建冲突副本或要求用户选择主版本。

不采用字段级自动合并日志正文，因为移动块、删除和格式变化很容易产生语义损坏。

## 7. Knowledge、Task 与 Report

### 7.1 Knowledge

- 正文与 Journal 一样按文档整体版本同步。
- 标签关系通过 `tag` + `knowledge_tag` 独立同步，知识关联通过 `knowledge_link` 同步，全部使用稳定 ID。
- 来源 Journal 被删除时不自动删除知识条目。

### 7.2 Task

- 小字段实体可继续使用 revision 冲突检测。
- 未来如需字段级合并，必须通过新协议版本定义，不在 V1 文档中承诺。
- `completed_at`、`due_date` 和状态作为同一 Task 快照同步。

### 7.3 Report

- Report 是用户内容，参与同步。
- 统计快照可以携带，但接收端可重新计算基础统计。
- AI 生成来源元数据不包含 API Key。

## 8. 删除与恢复

```ts
export interface SyncTombstone {
  entityType: SyncEntityType;
  entityId: string;
  deletedAt: string;
  revision: number;
  hlc: HybridLogicalClock;
}
```

规则：

- 删除后默认不再出现在列表和搜索。
- 删除变更必须同步。
- 恢复使用新 revision 和 `action = "restore"`。
- 物理清理必须晚于所有设备的 tombstone 保留窗口。
- 服务端不能因为本地已清理就伪造新实体 ID。

## 9. 附件同步

### 9.1 分离元数据和内容

1. 客户端计算附件 SHA-256。
2. 先请求上传会话，声明 hash、大小和 MIME。
3. 服务端若已有相同 blob，返回 `alreadyExists`。
4. 否则分块上传到临时对象。
5. 完成校验后提交 blob 元数据。
6. 再同步 `attachment_link`，让实体引用 blob。

### 9.2 协议结构

```ts
export interface AttachmentUploadInit {
  blobId: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
}

export interface AttachmentUploadStatus {
  uploadId: string;
  blobId: string;
  state: "pending" | "uploading" | "committed" | "failed";
  receivedBytes: number;
  chunkSize: number;
}
```

要求：

- blob 内容寻址，同一 hash 只上传一次。
- 不把附件 base64 塞进业务 JSON。
- 附件链接与业务实体可以不同步完成，但缺失附件必须显示明确状态。
- 下载时校验 hash，防止损坏或被替换。

## 10. 同步 API

未来可采用 HTTPS JSON API：

```text
POST /v1/devices/register
POST /v1/sync/push
GET  /v1/sync/pull?cursor=...
POST /v1/attachments/uploads
PUT  /v1/attachments/uploads/{uploadId}/chunks/{index}
POST /v1/attachments/uploads/{uploadId}/complete
GET  /v1/attachments/{blobId}
POST /v1/snapshots/bootstrap
```

这些端点不属于 V1 实现范围。

### 10.1 Push

```json
{
  "protocolVersion": 1,
  "deviceId": "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
  "batchId": "0198e2f4-8bb8-7f84-b966-999ce72f6f3c",
  "changes": []
}
```

响应区分：

- accepted。
- duplicate。
- rejected validation。
- conflict。
- retryable error。

### 10.2 Pull

```json
{
  "protocolVersion": 1,
  "deviceId": "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
  "cursor": "server-seq:128742",
  "limit": 500
}
```

响应：

```json
{
  "changes": [],
  "nextCursor": "server-seq:129242",
  "hasMore": true,
  "serverTime": "2026-10-30T03:20:11.123Z"
}
```

客户端逐页拉取并在本地事务中应用。cursor 只在完整批次应用成功后推进。

## 11. 首次启用同步

V1 数据可能没有变更日志。未来启用同步时采用 bootstrap：

1. 注册设备。
2. 生成当前本地实体快照。
3. 提交 `snapshots/bootstrap`。
4. 服务端为快照生成基线版本和 cursor。
5. 客户端从该 cursor 开始记录和推送增量。

因此 V1 不需要提前实现完整 outbox。稳定 ID、revision、软删除和附件哈希已足够支持首次快照。

## 12. 协议版本与演进

- `protocolVersion` 是整数，不兼容变更必须升级。
- 新增可选字段优先保持向后兼容。
- 未知实体类型不能导致客户端崩溃，应保存为 outbox 中不可处理记录并提示升级。
- 未知字段在本地往返时不得丢弃。
- 服务端必须返回最低/最高协议版本，客户端据此决定是否同步。
- API 错误使用稳定 code，不使用展示文案作为协议。

## 13. 安全与隐私

未来同步的第一版至少包含：

- TLS。
- 设备会话和短期凭据。
- 设备撤销。
- 服务端访问审计。
- 幂等和速率限制。

不建议 V1 把第三方 AI Key 或本地诊断数据上传。

端到端加密与同步身份密钥可以在同步产品设计阶段单独评估。若采用 E2EE：

- 服务端无法读取正文。
- 附件也必须加密。
- 搜索索引不能由服务端生成。
- 密钥丢失会导致数据不可恢复，需要明确恢复策略。

## 14. 冲突记录与 UI

未来本地数据库可能需要新增：

- `sync_outbox`
- `sync_cursor`
- `sync_conflicts`
- `sync_blob_queue`

冲突 UI 至少展示：

- 本地版本和远端版本的更新时间、设备、摘要。
- 两版内容对比。
- 选择保留本地、保留远端、另存冲突副本。
- 批量处理入口。

日志正文不提供无提示自动合并。

## 15. 测试要求

- 同一 change 重复推送只应用一次。
- 离线创建、修改、删除后重新连接能完整同步。
- 两个设备基于同一 revision 编辑产生冲突而非静默覆盖。
- cursor 应用失败不推进。
- 删除 tombstone 在保留窗口内能到达所有设备。
- 附件上传中断可续传，最终 hash 一致。
- 附件已存在时跳过内容上传。
- 旧协议客户端遇到未知字段不丢数据。
- 同步中断不影响本地保存、搜索和导入。

## 16. 未来服务端建议

同步服务端可选技术：

| 方案 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- |
| TypeScript + PostgreSQL | 与前端 DTO 共享、生态成熟 | 需要建立独立服务仓储和运维 | 首次同步优先评估 |
| Rust + PostgreSQL | 性能和类型边界强 | 开发速度与招聘成本较高 | 服务规模扩大后可选 |
| 直接使用第三方 BaaS | 上线快 | 数据模型、冲突审计和离线语义受限 | 不作为默认 |

服务端必须独立于 V1 本地应用构建。即使服务端不可用，桌面和 Web 仍应完整启动并读写本地数据。

