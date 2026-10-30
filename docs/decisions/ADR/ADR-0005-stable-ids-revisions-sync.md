# ADR-0005：稳定 ID、Revision、软删除与同步预留

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：所有业务实体、未来同步和迁移

## 背景

V1 不实现云同步，但未来需要同一用户多设备离线编辑。若 V1 使用自增 ID、覆盖式保存、物理删除或把本地时区混入 UTC 时间，后续同步会产生 ID 重分配、删除复活和无法解释的冲突。

## 决策

从 V1 起建立以下不可逆数据语义：

1. 业务 ID 使用客户端生成的小写 UUIDv7。
2. 可变聚合有从 1 开始单调递增的 `revision`。
3. 更新使用 `expectedRevision` 乐观并发控制；`null` 只表示首次创建。
4. 时间戳使用 UTC ISO 8601 毫秒字符串；日记/截止日期使用严格 `LocalDate`。
5. 删除默认写 `deleted_at` 软删除，不立即物理删除历史或关系。
6. 附件使用 SHA-256 内容哈希，业务实体只引用附件 ID 和逻辑相对路径。
7. 同步 DTO 独立放在 `packages/sync-contracts`，V1 不依赖同步服务启动。
8. 未来同步使用设备 ID、变更信封、HLC、服务端 change log 和 cursor。

`revision` 与 HLC 职责不同：

- `revision` 表示单个实体状态的并发控制版本。
- HLC 解释跨设备因果关系和大致顺序，不替代实体 revision。
- 服务端 `serverSequence` 只用于拉取游标，不作为业务 ID。

## 删除与恢复

- 删除动作同步为 tombstone。
- 恢复使用新 revision 和 `action = "restore"`。
- 物理清理必须晚于所有设备的 tombstone 保留窗口。
- UI 默认过滤软删除实体，但数据管理/回收站可显式查看。
- 未来同步不能在本地已清理后伪造相同 ID 的业务状态。

## 首次启用同步

V1 不建立完整 outbox。未来首次启用同步时：

1. 注册设备。
2. 生成当前本地实体快照。
3. 上传 bootstrap snapshot。
4. 服务端生成基线 revision 和 cursor。
5. 客户端从该 cursor 开始增量变更。

## 被否决的方案

### SQLite 自增主键作为业务 ID

跨设备会冲突，Web 也无法在离线时安全分配。否决。

### 随机 UUIDv4

可用，但索引局部性与时间排序不如 UUIDv7；UUIDv7 更适合本地生成和多端增量。选择 UUIDv7。

### 物理删除并依靠 last-write-wins

会导致删除后从旧设备复活，且无法审计恢复。否决。

### V1 不预留，未来一次性迁移

数据模型和 UI 均会依赖旧语义，迁移风险高。否决。

## 后果

- 查询必须持续过滤软删除和归档状态。
- 清理任务需要明确的保留期和用户确认。
- 所有写用例必须传入或产生 revision，不能盲目 upsert。
- 同步协议可以独立演进，但改动 `revision`、ID 或删除语义需要新 ADR。
- 日期格式化层必须区分用户本地日期与 UTC 时刻。

## 验证

- 同一日期并发保存只有一个成功，另一方得到 `CONFLICT`。
- 恢复旧内容产生更高 revision，历史不删除。
- 软删除实体默认不出现在列表和搜索中。
- 跨端 fixture 对 UUID、日期、revision 和 tombstone 编码一致。
- 未配置同步时，应用启动、保存、导入和搜索完全不依赖网络。

## 关联文档

- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [同步协议](../../architecture/SYNC-PROTOCOL.md)
- [编辑器设计](../../architecture/EDITOR-DESIGN.md)
