# DailyFlow 编辑器设计

## 1. 目标

编辑器需要同时满足：

- 自由书写，不强制模板。
- Tiptap 富文本体验与 Markdown 快捷输入。
- 代码块、图片、附件、链接和结构化块。
- 自动保存、冲突检测、历史版本和恢复。
- Windows、macOS、Web 的快捷键与行为一致。
- 与未来同步、搜索和 AI 扩展解耦。

核心原则：**Tiptap JSON 是唯一权威正文，Markdown 与纯文本是从权威 JSON 确定性生成的派生物。**

## 2. 为什么不采用 Markdown 与 Tiptap JSON 双权威

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| Markdown 权威，JSON 缓存 | 可移植、纯文本友好 | 自定义结构化块需扩展语法；富文本节点和属性可能无法无损往返 | 可选但复杂 |
| Tiptap JSON 权威，Markdown 派生 | 编辑器语义完整、结构化块稳定、可实现单写管线 | 导出依赖序列化器质量；JSON 不可直接作为通用 Markdown 文件 | **V1 推荐** |
| 双向独立修改 | 表面灵活 | 必然产生版本冲突、丢失格式和来源不明 | 禁止 |

V1 采用第二种。用户仍可输入和粘贴 Markdown，但 Markdown 输入必须先经过解析器生成 JSON。

## 3. 编辑器包结构

```text
packages/editor/
├─ src/
│  ├─ schema/
│  │  ├─ create-editor-schema.ts
│  │  ├─ schema-version.ts
│  │  └─ migrate-document.ts
│  ├─ extensions/
│  │  ├─ code-block.ts
│  │  ├─ attachment.ts
│  │  ├─ structured-block.ts
│  │  ├─ journal-reference.ts
│  │  └─ markdown-input.ts
│  ├─ serialization/
│  │  ├─ json-to-markdown.ts
│  │  ├─ markdown-to-json.ts
│  │  ├─ json-to-plain-text.ts
│  │  └─ normalize-document.ts
│  ├─ projection/
│  │  └─ extract-structured-blocks.ts
│  ├─ commands/
│  │  └─ editor-commands.ts
│  └─ index.ts
└─ tests/
   ├─ roundtrip.test.ts
   ├─ structured-block.test.ts
   ├─ paste.test.ts
   └─ schema-migration.test.ts
```

`packages/editor` 不依赖 Repository、Tauri 或 Dexie。它输出可直接交给 Application 校验的文档 DTO。

## 4. 正文模型

### 4.1 权威文档

```ts
export interface EditorDocument {
  schemaVersion: number;
  doc: TiptapJsonNode;
}

export interface TiptapJsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}
```

数据库中 `content_json` 保存规范化后的 `doc`，`editor_schema_version` 单独保存，避免每次解析整个 JSON 才能判断版本。

### 4.2 支持的节点

V1 基础节点：

- `doc`
- `paragraph`
- `text`
- `heading`（1 至 3 级）
- `bulletList`、`orderedList`、`listItem`
- `taskList`、`taskItem`
- `blockquote`
- `codeBlock`
- `horizontalRule`
- `hardBreak`

行内标记：

- `bold`
- `italic`
- `strike`
- `code`
- `link`

自定义节点：

- `attachment`
- `structuredBlock`
- `journalReference`
- `knowledgeReference`

### 4.3 结构化块节点

```ts
export interface StructuredBlockAttrs {
  id: string;                    // UUIDv7，节点生命周期内稳定
  blockType: "issue" | "solution" | "decision" | "note" | "todo";
  schemaVersion: number;
  data: Record<string, unknown>;
  collapsed?: boolean;
}
```

示例：

```json
{
  "type": "structuredBlock",
  "attrs": {
    "id": "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
    "blockType": "issue",
    "schemaVersion": 1,
    "collapsed": false,
    "data": {
      "symptom": "应用启动后闪烁退出",
      "environment": "Windows 11 / WebView2",
      "attempts": [
        "检查日志",
        "验证 WebView2 版本"
      ],
      "status": "solved"
    }
  }
}
```

规则：

- `id` 由使用该节点的编辑器实例创建，复制节点时生成新 ID。
- `blockType` 只允许已迁移的固定类型；V1 不支持用户自定义 schema。
- `data` 由区块类型的 Zod schema 校验。
- 未知字段在保存时不得丢弃，以保证向前兼容；未知节点类型在旧客户端中作为只读不透明块保留。
- `structured_blocks` 表是当前 JSON 的查询投影，不能在表中独立编辑后假装正文已更新。

### 4.4 附件节点

```ts
export interface AttachmentAttrs {
  attachmentId: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  isInline: boolean;
  altText?: string;
}
```

节点只引用附件 ID，不保存 blob、绝对路径或 base64。附件上传流程：

1. UI 选择文件。
2. Application 校验大小、类型和配额。
3. `AttachmentStore.put` 写临时 blob。
4. 编辑器插入 attachment 节点。
5. 保存日志时在事务中写入附件 link。
6. 保存成功后才把临时附件标记为正式；失败保留重试入口。

## 5. JSON 与 Markdown 转换

### 5.1 单一写路径

```text
用户输入 / 粘贴 Markdown
  -> Tiptap editor state (JSON)
  -> normalizeDocument
  -> JSON-to-Markdown projector
  -> JSON-to-plain-text projector
  -> SaveJournalSnapshot
  -> Repository
```

任何入口不得先写 Markdown 字段再另写 JSON 字段。导入、恢复和转换测试也必须使用同一 projector。

### 5.2 支持映射

| Tiptap | Markdown |
| --- | --- |
| heading 1-3 | `#` 至 `###` |
| bold/italic/strike/code | `**`、`*`、`~~`、反引号 |
| bullet/ordered list | `-`、`1.` |
| task list | `- [ ]`、`- [x]` |
| blockquote | `>` |
| code block | 三反引号围栏，保留 language |
| link | `[text](url)` |
| hard break | 行尾反斜杠或空行策略，固定实现 |
| horizontal rule | `---` |
| attachment | 标准图片语法或附件链接，附稳定 ID 注释 |
| structuredBlock | 受控自定义围栏或 HTML 注释容器 |

### 5.3 结构化块导出格式

推荐使用带 language marker 的围栏块，保证原始 Markdown 可读且能被 DailyFlow 再导入：

````markdown
```dailyflow-structured
{"id":"0198e2f4-7e33-7c70-a8b2-18c1520f9c26","blockType":"issue","schemaVersion":1,"data":{"status":"solved"}}
```
````

转换规则：

- 普通 Markdown 阅读器会把它显示为代码块，不会误当成正文。
- DailyFlow 导入器识别 `dailyflow-structured` 语言并还原节点。
- JSON 必须紧凑、字段顺序稳定，便于 diff 和哈希。
- 若围栏内容不是合法 schema，导出仍保留原文，导入时提示异常，不静默丢弃。

### 5.4 派生字段

保存时生成：

- `content_markdown`
- `content_plain_text`
- `structured_blocks` 投影
- `search_documents`
- `content_hash`
- `excerpt`

派生字段版本化：

```ts
export interface ContentProjection {
  markdown: string;
  plainText: string;
  structuredBlocks: StructuredBlockProjection[];
  searchDocuments: SearchDocument[];
  excerpt: string;
  projectionVersion: number;
  contentHash: string;
}
```

任何 projector 规则改变都要递增 `projectionVersion` 并安排后台重建，不能在一次普通打开时静默重写已保存正文。

`editorSchemaVersion` 描述权威 Tiptap JSON 的节点结构版本；`projectionVersion` 描述 Markdown、纯文本、结构化块和搜索文档的生成规则版本。两者独立存储和升级。Journal、JournalVersion、KnowledgeItem、Report 等带投影的持久实体都必须保存当前 `projectionVersion`。

## 6. Markdown 粘贴与快捷输入

### 6.1 粘贴策略

1. 剪贴板同时有 `text/html` 和 `text/plain` 时，默认使用安全 HTML 转换。
2. 纯文本若包含明确 Markdown 结构，显示预览开关，默认智能识别。
3. 单个 URL 粘贴转换为链接。
4. 代码编辑器或代码块内粘贴保持纯文本。
5. 不允许执行粘贴 HTML 中的脚本、事件属性或任意 `file://` 链接。

### 6.2 Markdown 快捷输入

- `# ` 至 `### ` 转标题。
- `- `、`* `、`1. ` 转列表。
- `> ` 转引用。
- ````` 转代码块。
- `- [ ] ` 转任务列表。
- `---` 转分隔线。

快捷输入仅在普通段落上下文触发。保存后的权威状态仍是 JSON。

## 7. 自动保存

### 7.1 时序

```text
onUpdate
  -> 标记 dirty + 记录本地变更序号
  -> debounce 800ms
  -> project
  -> saveJournal
  -> success: 清除 dirty、更新 revision、记录 savedAt
  -> failure: 保留 dirty、显示错误、允许重试
```

附加触发点：

- 切换页面或路由。
- 窗口失焦。
- 浏览器 `visibilitychange` 变为隐藏。
- 浏览器 `pagehide`。
- 桌面窗口 `onCloseRequested`。
- 手动保存快捷键。

### 7.2 保存队列

- 同一 Journal 只允许一个在途保存。
- 如果保存进行中又有新变更，最多记住“需要再保存一次”，不并发发送多个全量快照。
- 保存成功后比较当前本地变更序号；若期间有新变更，立即进入下一次保存。
- 保存失败不自动无限重试，指数退避最多三次，然后要求用户手动重试。

```ts
interface SaveCoordinatorState {
  journalId: string;
  localChangeSeq: number;
  persistedSeq: number;
  inFlight: boolean;
  saveState: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
  lastSavedAt?: string;
  lastErrorCode?: string;
}
```

### 7.3 并发与 revision

每次保存带上当前 `expectedRevision`：

- `null`：首次创建当天日志。
- 数字：更新已存在日志。

若返回 `CONFLICT`：

1. 不覆盖本地编辑器。
2. 拉取最新持久化版本。
3. 若本地未发生新变更，且内容差异仅来自同一操作的重试，安全重试。
4. 否则进入冲突状态，保存本地冲突副本或显示对比面板。
5. 用户明确选择保留本地、保留已存在或另存冲突副本。

V1 单窗口单用户通常不会遇到此状态，但 Web 多标签页和未来同步会使它成为真实路径。

### 7.4 关闭窗口

- 桌面端拦截 Tauri 关闭事件，等待保存队列清空再关闭。
- 若保存失败，显示阻塞对话框：重试、导出临时副本、放弃本次未保存更改。
- Web 端无法阻止所有浏览器关闭，使用更短延迟、`visibilitychange` 和 `pagehide` 的同步可执行保存入口尽力完成。
- 页面卸载时不发起长网络请求；V1 只写本地存储。

### 7.5 崩溃恢复

编辑器维护最近一次成功保存的 revision 和本地变更序号。恢复流程：

- 如果页面重载后当前持久化内容与编辑缓冲区哈希不同，不自动覆盖。
- 若浏览器提供了未提交的草稿标记，显示“恢复未保存内容”。
- 草稿保存失败不得伪装成成功。

## 8. 历史版本

### 8.1 检查点策略

- `revision` 每次保存递增。
- 历史检查点按以下条件插入：
  - 达到 5 分钟间隔。
  - 连续自动保存超过 100 次。
  - 手动保存。
  - 页面关闭。
  - 导入。
  - 恢复历史版本。
  - 删除前。
- 历史版本保存完整权威 JSON，不做独立 Markdown 编辑。
- 默认保留最近 100 个检查点或 180 天，具体策略可在设置中调整。

### 8.2 恢复

1. 用户选择历史版本。
2. UI 显示渲染视图和纯文本差异。
3. 确认恢复后调用 `restoreVersion`。
4. 当前正文被替换为目标版本内容，但 `revision + 1`。
5. 插入 `change_source = 'restore'` 的新版本。
6. 历史记录不删除。

### 8.3 版本 diff

V1 先提供：

- 标题差异。
- 纯文本逐行差异。
- 渲染正文只读对照。

复杂逐词 diff、合并编辑器不进入 V1。

## 9. 结构化内容生命周期

### 9.1 插入

- 用户从命令菜单插入结构化块。
- 类型选择后提供一个可折叠的小型结构面板。
- 默认只显示必要字段，不要求填满。
- 正文仍可在区块外自由书写。

### 9.2 编辑

- 结构化字段编辑直接改变节点的 `data`。
- 每次变化仍进入统一自动保存管线。
- 不能通过直接修改 `structured_blocks` 表改变正文。

### 9.3 提升为知识

- Application 读取节点 JSON 并创建 KnowledgeItem 草稿。
- 来源 `journalId`、`blockId` 和创建时内容快照哈希写入知识条目。
- 原日志节点不变。
- 可以选择插入反向引用节点，或者只在知识条目保存来源。

## 10. 附件

### 10.1 类型与限制

V1 允许常见图片和普通附件。建议默认上限：

- 单文件 50 MB。
- 单日志附件总计 250 MB。
- Web 端根据 `navigator.storage.estimate()` 动态降低。

这些是配置，不写死在 Domain 业务规则中；Domain 接收已校验的 `AttachmentPolicy`。

### 10.2 存储

- 桌面：应用数据目录的 `attachments/<hash前两位>/<hash后两位>/<sha256>.bin`。
- Web：IndexedDB `attachmentBlobs` store，主键为 blob ID。
- 数据库只存相对 storage key 和 sha256，不存绝对路径。
- 同一内容哈希可复用 blob，但每个 owner 有独立 attachment link。
- 插入图片的节点使用 attachment ID 获取 object URL 或受控本地 URL，并在组件卸载时释放。

### 10.3 安全

- 下载/打开附件前使用 MIME 白名单和系统打开确认。
- 可执行文件不自动打开。
- 原始文件名只用于显示和导出，不用于路径。
- HTML/SVG 附件不以可执行内容直接内联渲染。

## 11. 快捷键

快捷键统一通过 `CommandRegistry` 注册，UI 显示平台适配后的提示：

| 动作 | Windows/Web | macOS |
| --- | --- | --- |
| 保存 | `Ctrl+S` | `Cmd+S` |
| 全局搜索 | `Ctrl+K` | `Cmd+K` |
| 新建/今日日志 | `Ctrl+Shift+J` | `Cmd+Shift+J` |
| 新建任务 | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| 打开命令面板 | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| 撤销/重做 | 浏览器/编辑器默认 | 编辑器默认 |

实现规则：

- 使用 `getPlatformModifier()` 或统一 `Mod` token，不在组件散落 `navigator.platform` 判断。
- 不与 Tiptap 内建快捷键冲突；注册前运行冲突检测测试。
- 可配置快捷键写入 `settings`，但 V1 不要求复杂键位录制器。
- 焦点在输入框、富文本或代码块时的行为要明确，避免全局快捷键劫持输入。

## 12. 编辑器状态划分

| 状态 | 所属 | 生命周期 |
| --- | --- | --- |
| Tiptap Editor 实例与 transaction | `packages/editor` / 页面本地 | 路由生命周期 |
| 当前文档 JSON 草稿 | 编辑器状态 | 编辑中 |
| 保存状态、revision、错误 | Zustand UI store | 页面/应用会话 |
| 已保存正文 | Repository | 持久 |
| 历史版本 | Repository | 持久 |
| 附件 object URL | 组件生命周期 | 临时 |

Zustand 不保存 Tiptap Editor 实例本身，避免跨 React 渲染持有不可序列化对象。

## 13. Schema 迁移

### 13.1 迁移原则

- 每个 Tiptap schema 版本有对应迁移函数。
- 保存时升级到当前 schema，保留未知节点和属性。
- 无法自动迁移的节点进入只读“不透明块”，显示提示和导出入口。
- 读取旧文档时不修改数据库，直到用户下一次成功保存或明确执行批量迁移。

### 13.2 迁移示例

```ts
export function migrateDocument(input: EditorDocument): EditorDocument {
  let doc = input.doc;
  let version = input.schemaVersion;

  if (version < 2) {
    doc = migrateAttachmentNodesV1toV2(doc);
    version = 2;
  }

  if (version < 3) {
    doc = migrateStructuredBlocksV2toV3(doc);
    version = 3;
  }

  return { schemaVersion: version, doc };
}
```

迁移函数必须幂等，并有固定 fixture。迁移不能依赖当前时间或随机数，否则哈希不可重现。

## 14. 序列化与转换规则

1. JSON 在保存前使用稳定字段顺序、稳定空白和 UTF-8 规范化。
2. Markdown 转换不产生绝对路径、临时 object URL 或本地主机地址。
3. Markdown 中结构化块使用固定标识，导出后再次导入可恢复块 ID。
4. 链接 URL 经过协议白名单：`https`、`http`、`mailto` 和内部引用；其他协议显示为纯文本。
5. 代码块保留语言标识，不执行代码。
6. 图片附件使用相对引用或 DailyFlow 内部 ID，导出时可选择复制附件目录。
7. 未知节点保留在 JSON 和 Markdown 的不透明容器中，不能静默删除。
8. 生成纯文本时忽略装饰但保留可搜索语义，如代码内容、标题和结构化字段文本。

## 15. 错误与恢复

| 错误 | UI 行为 | 数据行为 |
| --- | --- | --- |
| revision 冲突 | 显示对比/另存冲突副本 | 不覆盖任一方 |
| 附件上传失败 | 保留节点占位和重试 | 不写正式 link |
| JSON schema 非法 | 阻止保存并定位错误 | 保留编辑器缓冲区 |
| 保存事务中的索引更新失败 | 提示保存失败并保留草稿 | 正文、版本、投影和索引整次回滚，不留下半索引 |
| 存储配额不足 | 显示空间信息和导出入口 | 不删除旧数据 |
| 版本不存在 | 提示并刷新历史列表 | 不修改当前正文 |

对于同一保存操作，正文、版本、结构块投影和搜索索引必须位于同一业务事务；任一步失败时整次回滚，编辑器保留未保存草稿。单篇日志的索引入队应在本地事务允许的范围内完成，不能把常规保存任意降级成“正文成功、索引稍后更新”。全局索引版本升级、备份恢复或检测到既有索引损坏时，才将全局 `search_index_state` 设为 `stale` 或 `failed`，并由独立重建流程恢复。

## 16. 测试要求

### 16.1 单元测试

- JSON -> Markdown -> JSON 对支持的节点保持语义稳定。
- Markdown 粘贴在代码块、列表和引用上下文中不误转换。
- 标题、列表、代码块、链接和特殊字符转义正确。
- 结构化块 ID 在编辑中稳定，复制时生成新 ID。
- 未知节点和未知属性往返不丢失。
- schema 迁移幂等。
- 纯文本、摘录和哈希对相同输入稳定。

### 16.2 应用测试

- 800ms 防抖保存与 in-flight 队列。
- 内容变更只执行一次最新快照保存。
- 冲突不覆盖当前编辑器内容。
- 保存失败可重试且不清空。
- 恢复历史版本生成新 revision。
- 附件上传失败不留正式关联。

### 16.3 集成测试

- SQLite 与 Dexie 对同一 `SaveJournalSnapshot` 产生等价 revision 和查询结果。
- 桌面关闭拦截保存。
- Web `visibilitychange` 保存。
- 大代码块、中文、CRLF、Emoji、组合字符的 round-trip。

### 16.4 手工冒烟

- Windows WebView2 粘贴大段代码。
- macOS WKWebView 使用 Cmd 快捷键。
- Web 在页面刷新和标签切换时保存。
- 图片、附件、外部链接和结构化块渲染。

