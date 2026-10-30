# DailyFlow 搜索设计

## 1. 目标

V1 搜索需要覆盖日志、知识条目、任务和结构化块，并支持日志与知识条目上的标签；优先解决中文工作记录、代码标识符和英文技术词的本地检索。

不要求：

- 向量检索。
- 自然语言问答。
- 正则表达式。
- 复杂布尔表达式。
- 云端搜索服务。

## 2. 搜索架构

```text
Authoritative data (Tiptap JSON)
  -> ContentProjector
    -> Markdown + plain text
    -> structured block text
    -> search documents
      -> Desktop: SQLite FTS5
      -> Web: Dexie inverted terms
```

搜索是派生能力，不是数据权威。索引损坏不改变正文，用户仍可打开已有正文并进入重建；常规保存则必须让正文、投影和索引在同一个本地事务中成功或失败，不能产生半写状态。

## 3. SearchPort

```ts
export interface SearchQuery {
  text: string;
  entityTypes?: Array<"journal" | "knowledge_item" | "task" | "structured_block">;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  limit: number;
  cursor?: string;
}

export interface SearchResultPage {
  items: SearchResult[];
  nextCursor?: string;
  totalApprox: number;
  indexState: "ready" | "stale" | "rebuilding" | "failed";
}

export interface SearchResult {
  entityType: "journal" | "knowledge_item" | "task" | "structured_block";
  entityId: string;
  title: string;
  snippet: string;
  highlights: Array<{ start: number; end: number }>;
  localDate?: string;
  tags: string[];
  updatedAt: string;
}

export interface SearchPort {
  query(input: SearchQuery): Promise<SearchResultPage>;
  rebuild(scope?: SearchScope): Promise<RebuildResult>;
  markStale(reason: string): Promise<void>;
  getState(): Promise<SearchIndexState>;
}
```

`SearchQuery.tags` 和 `SearchResult.tags` 用于日志、知识条目及其结构化块；V1 的任务没有标签关系，因此任务结果的 `tags` 恒为空。结构化块继承所属日志的标签，但标签不作为独立可打开实体。

## 4. 搜索文档

每个可搜索实体投影为：

```ts
export interface SearchDocument {
  id: string;
  entityType: "journal" | "knowledge_item" | "task" | "structured_block";
  entityId: string;
  title: string;
  bodyText: string;
  structuredText: string;
  tagsText: string;
  normalizedText: string;
  tokenizedText: string;
  localDate?: string;
  updatedAt: string;
  contentHash: string;
  indexVersion: number;
}
```

### 4.1 日志搜索内容

- Journal 标题。
- 正文纯文本。
- 结构化块中所有可读字段。
- 标签。
- 不默认搜索附件文件名以外的二进制内容。

结构化块同时生成独立搜索文档，便于搜索结果直接定位到块；其文本也进入所属日志的搜索文本，避免日志搜索漏召。

### 4.2 知识条目搜索内容

- 标题、正文、标签、类型。
- 问题类型中的现象、原因、方案、预防措施。
- 来源日志标题可作为弱字段，不进入默认 snippet。

### 4.3 任务搜索内容

- 标题、备注、状态和截止日期；V1 不引入任务标签。
- 完成后默认仍可搜索，但排序降低。

## 5. 文本归一化

共享 `normalizeSearchText`：

1. Unicode NFKC。
2. 统一大小写（英文小写）。
3. 全角英文字母和数字转半角。
4. 将连续空白折叠为空格。
5. 去除不可见控制字符。
6. 将常见中文标点替换为空格或稳定分隔符。
7. 保留代码标识符中的 `_`、`-`、`.`、`:`、`/` 作为可控 token 分隔符。

示例：

```text
"WebView2 启动失败：ERR_CONNECTION_RESET"
-> "webview2 启动失败 err_connection_reset"
```

不应去除所有标点，否则类似 `C++`、`a.b`、`ERR_404` 的查询会失真。搜索 tokenizer 和索引 tokenizer 必须使用同一实现。

## 6. CJK 分词策略

SQLite FTS5 的 `unicode61` 对连续中文通常不能有效切词，Web 端也没有统一内建中文分词器。V1 推荐使用确定性轻量分词：

- 英文/数字/代码标识符按连续 ASCII 片段切 token。
- 中文连续片段生成单字、二元组（bigram）和必要的前缀候选。
- 删除中文停用词不作为硬过滤，避免“的”“问题”等词导致误删上下文；只降低权重。
- 查询同样生成中文 bigram，并使用 `AND` 组合提高精度。

示例：

```text
索引文本：排查数据库连接超时
索引 token：排 查 数 据 库 连 接 超 时 排查 查数 数据 据库 库连 连接 接超 超时
查询文本：连接超时
查询 token：连接 接超 超时
```

优点：

- SQLite 与 Web 结果接近。
- 无需引入大型中文分词依赖。
- 对新词、技术词和混合文本稳定。

代价：

- 索引体积比仅英文 token 更大。
- 词义精度有限。

若后续搜索质量不足，可在独立 ADR 中替换为 ICU 或专业分词器，但 `SearchPort` 不变。

## 7. Desktop SQLite FTS5

### 7.1 索引表

在 `search_documents` 普通表之外创建 FTS5：

```sql
CREATE VIRTUAL TABLE search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body_text,
  structured_text,
  tokenized_text,
  tags_text,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

### 7.2 更新

日志保存事务中：

1. 删除旧 search document 对应 FTS 行。
2. 写入新 `search_documents` 行。
3. 写入新 `search_fts` 行。
4. 写入 `app_metadata.search_index_state = ready`。

失败处理：

- FTS 写入失败时整次保存事务回滚，编辑器保留草稿，不更新正文或部分索引。
- 不允许普通保存降级为“正文成功、索引未更新”。全局索引版本升级、备份恢复或既有索引损坏时，才将 `app_metadata.search_index_state` 标为 `stale` 或 `failed`，随后由显式重建流程恢复。

### 7.3 查询

```sql
SELECT
  d.entity_type,
  d.entity_id,
  d.title,
  d.body_text,
  d.structured_text,
  d.local_date,
  d.updated_at,
  bm25(search_fts, 0.0, 0.0, 5.0, 1.0, 2.5, 1.5, 1.0) AS rank
FROM search_fts
JOIN search_documents d
  ON d.entity_type = search_fts.entity_type
 AND d.entity_id = search_fts.entity_id
WHERE search_fts MATCH ?
ORDER BY rank, d.updated_at DESC
LIMIT ?;
```

实际查询必须：

- 对用户输入构造参数化 FTS 表达式，不拼接未转义引号。
- 支持中文 bigram 组合。
- 对任务完成状态、软删除和日期范围做额外过滤。
- 用 snippet/highlight 生成受长度限制的摘要。
- 有超时和最大结果数，避免异常输入阻塞 UI。

`bm25()` 的参数必须与 `search_fts` 的七个声明列一一对应：前两个 `UNINDEXED` 列权重为 `0.0`，后五个索引列依次对应标题、正文、结构化文本、tokenized 文本和标签。SQLite 返回的是数据库方言相关的初步分数，仅作为候选召回和第一轮排序；Application 层的共享 `SearchRanker` 会基于统一 `SearchDocument`、字段命中、短语邻近度和更新时间做最终跨平台重排，不把原始 BM25 数值暴露给 UI。

## 8. Web Dexie 索引

### 8.1 Stores

```ts
searchDocs: "id, [entityType+entityId], localDate, updatedAt",
searchTermPostings: "id, term, docId, [term+docId]",
// id = `${term}:${docId}:${field}`
```

每个 term/doc/field 对保存 posting，避免单条 posting 列表无限增长，同时保留字段权重。实现可在小数据集上增加缓存，但持久化 primary representation 使用分片。

```ts
interface SearchTermPosting {
  id: string;
  term: string;
  docId: string;
  frequency: number;
  field: "title" | "body" | "structured" | "tag";
}
```

### 8.2 查询流程

1. 归一化并 tokenize 查询。
2. 对每个 token 查询 posting。
3. 按 token 数做交集或加权并集。
4. 对候选 doc 计算字段权重、短语邻近度和更新日期排序。
5. 从 `searchDocs` 取 snippet 所需正文。
6. 应用实体类型、日期和标签过滤。

Web 端不一次扫描全部日志正文。若索引不可用，可临时执行受限前缀查询，但必须显示降级状态。

### 8.3 事务更新

保存事务中：

- upsert `searchDocs`。
- 删除该 doc 旧 postings。
- 写入新 postings。
- 更新索引版本。

## 9. 排序

建议基础评分：

```text
score =
  title_exact * 8
  + title_prefix * 6
  + title_token * 4
  + tag_exact * 5
  + phrase_in_body * 3
  + token_coverage * 2
  + recency_boost
  - completed_task_penalty
```

规则：

- 标题匹配优先于正文匹配。
- 精确短语优先于分散 token。
- 最近更新获得有限提升，不能掩盖强相关结果。
- 已删除、已归档默认排除；用户可显式筛选。
- 不按字符数简单排序。

## 10. 搜索结果与高亮

- `snippet` 最多约 160 个 Unicode 字符。
- 高亮位置使用明确定义的字符索引，前后端不做不一致的 byte 偏移。
- 中文、Emoji 和组合字符按 Unicode code point 处理。
- 代码块中可以命中，但 snippet 应做换行压缩，不能把大段代码塞入结果。
- 点击结果跳到对应实体；结构化块结果包含块 ID，编辑器滚动到该节点。

## 11. 索引生命周期

| 事件 | 行为 |
| --- | --- |
| 新建/更新实体 | 同事务替换搜索文档和 posting/FTS |
| 软删除实体 | 同事务移除或标记搜索文档不可见 |
| 恢复实体 | 同事务重建搜索文档 |
| projector/index 版本升级 | 设置 `stale`，后台全量重建 |
| 检测到索引异常 | 保留正文，标记 `failed`，提供重建按钮 |
| 数据恢复 | 恢复后统一重建 |

重建流程：

1. 创建临时索引或清空可重建索引。
2. 按稳定 ID 分批读取权威数据。
3. 生成搜索文档。
4. 写入索引并记录进度。
5. 校验实体计数与索引文档计数。
6. 原子切换 `search_index_state = ready`。

重建可取消；取消后保留旧索引或明确标记 `stale`。

## 12. 性能与限制

- 查询默认最多返回 50 条，分页 20 条。
- 单次查询 token 上限为 32，超长输入截断并提示。
- 对搜索输入增加 200ms 防抖。
- 空查询不执行全文扫描，可显示最近搜索或提示输入。
- 首次全量索引可分批在空闲时段执行，并显示进度。
- 搜索查询不得阻塞编辑输入；保存时只同步更新当前实体对应的搜索文档和 posting/FTS，首次全量或版本升级重建在后台分批执行。若当前实体索引写入失败，保存失败并保留草稿，不按降级规则产生半写状态。

## 13. 隐私

- 搜索只在本地执行。
- 搜索历史默认只保留最近 10 条，可在设置中关闭。
- AI 问答若未来使用搜索结果，必须明确发送范围，不复用本文档的自动搜索路径。
- 诊断信息不记录搜索词和正文。

## 14. 测试计划

### 14.1 分词

- 中文短词、长句、混合英文。
- 全角/半角、大小写、NFKC。
- 代码标识符、路径、错误码。
- 中文连续串的 bigram 查询精确度。

### 14.2 索引

- 新建、更新、删除、恢复日志后搜索结果正确。
- 日志和结构化块都命中。
- 保存事务失败时索引不留下半条数据。
- 索引损坏后可重建。
- 软删除后默认不返回。

### 14.3 跨端

- 同一 fixture 在 SQLite FTS5 和 Dexie 实现中 Top-N 结果尽量一致。
- 排序差异在允许范围内，并有快照测试。
- 桌面中文查询和 Web 中文查询返回目标日志。
- 10 万搜索文档规模的分页性能。

## 15. 待确认搜索决策

| 决策 | 方案 | 优点 | 风险 | 推荐 |
| --- | --- | --- | --- | --- |
| 中文分词 | 单字 + bigram | 无额外服务、跨端一致 | 索引较大 | **推荐 V1** |
| 中文分词 | 引入专业分词库 | 词义更准 | 包体、词典和两端口径统一成本 | 后续评估 |
| Web 搜索 | Dexie posting 倒排 | 本地、可控 | 自行维护排序 | **推荐 V1** |
| Web 搜索 | 内存全量 MiniSearch | 实现快 | 大数据集加载慢 | 小数据可选 |
| 搜索范围 | 标题 + 正文 + 日志/知识标签；任务搜索元数据 | 命中全面且符合 V1 实体范围 | 索引较大 | **推荐 V1** |

