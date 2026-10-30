# ADR-0002：Tiptap JSON 作为唯一权威正文

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：Journal、Knowledge Item、Report、版本、搜索和导出

## 背景

产品同时要求 Markdown 输入、富文本编辑、代码块、图片、附件、结构化内容和可移植导出。Markdown 适合阅读和迁移，但不能无损表达所有 Tiptap 节点属性和未来 Schema 扩展。如果 Markdown 与 Tiptap JSON 都能独立写回数据库，将无法确定最终正文，容易发生格式丢失和版本冲突。

## 决策

1. `content_json` 保存规范化后的 Tiptap `doc`，是 Journal、Knowledge Item 和 Report 的唯一权威正文。
2. `editor_schema_version` 随实体保存，用于解释权威 JSON 的节点结构。
3. Markdown、纯文本、结构化块、摘录、搜索文档和内容哈希都是派生数据。
4. 所有输入，包括 Markdown 粘贴、TXT 导入、恢复和外部转换，必须先转成当前 Schema 的 JSON，再进入统一保存用例。
5. 不允许 UI 单独修改 `content_markdown`、结构化块投影或搜索文档。
6. `projectionVersion` 与 `editorSchemaVersion` 分开管理。前者表示派生规则版本，后者表示权威 JSON 结构版本。

保存路径只有一条：

```text
用户输入 / 粘贴 / 导入
  -> 当前 Tiptap Schema JSON
  -> normalizeDocument
  -> SaveJournalSnapshot
  -> 生成 Markdown/plain/structured/search/hash
  -> Repository 原子提交 JSON + 版本 + 投影
```

## 转换规则

- Markdown 结构通过固定 projector 映射为 JSON，不持久化第二套可编辑源。
- 结构化块导出为 `dailyflow-structured` 围栏，保存稳定 `id` 和 Schema 版本。
- 未知节点和未知属性不得静默丢弃；旧客户端以只读不透明容器保留。
- 链接只允许安全协议白名单。
- 附件节点只保存 attachment ID、显示名和展示元数据，不保存绝对路径或 base64。
- 导出时从 JSON 重新生成 Markdown，不信任过期缓存。

## 被否决的方案

### Markdown 权威，JSON 为缓存

可移植性好，但富文本、结构化块、附件属性和未来节点无法稳定往返，否决作为 V1 主模型。

### JSON 与 Markdown 双权威、双向同步

会产生两个更新时间、两个冲突来源和无法预测的覆盖，明确禁止。

### 数据库只保存 HTML

HTML 语义和清洗规则复杂，结构化节点和多个编辑器版本难以稳定迁移，不适合作为长期个人数据源。

## 后果

- 序列化器和迁移函数的正确性与正文数据安全直接相关，需要高覆盖率 fixture。
- Markdown 导出不是无损数据库备份；完整备份必须包含权威 JSON。
- Schema 变更必须提供迁移，保留未知字段，并测试旧数据打开。
- 搜索和导出可以重建，不应对缓存不一致报“正文损坏”。
- 结构化块表只是查询投影，修改它不会改变正文。

## 验证

- 固定 fixture 完成 JSON -> Markdown -> JSON 的语义稳定测试。
- 未知节点、未知属性、Emoji、组合字符、中文和长代码块可往返。
- projector 版本改变后可将实体标记为 stale 并重建，不自动重写正文。
- Report、Journal 和 Knowledge Item 均保存 `editor_schema_version` 与 `projection_version`。
- 恢复历史版本创建新 revision，而不是修改历史记录。

## 关联文档

- [编辑器设计](../../architecture/EDITOR-DESIGN.md)
- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [搜索设计](../../architecture/SEARCH-DESIGN.md)
- [开发计划](../../development/DEVELOPMENT-PLAN.md)
