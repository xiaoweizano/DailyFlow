# DailyFlow 导入、导出、备份与恢复设计

## 1. 目标

数据管理必须让用户能够：

- 把既有月份目录中的 TXT 日志安全迁移到 DailyFlow。
- 在导入前理解将要发生什么，拒绝异常文件。
- 重复执行导入时不制造重复日志。
- 导入失败时不留下半批数据。
- 以可理解格式导出日志和知识。
- 创建可恢复的完整备份，并在另一平台恢复。

## 2. TXT 历史目录识别

### 2.1 输入结构

支持用户选择一个根目录，递归扫描其中的月份目录和 `.txt` 文件：

```text
root/
├─ 202504/
│  ├─ 2025-04-01.txt
│  ├─ 20250402.txt
│  └─ 04-03.txt
├─ 202505/
└─ 202610/
```

允许根目录下存在其他文件和其他目录。非 `.txt` 文件默认忽略并在扫描摘要中显示数量；V1 不把未知二进制文件当作日志导入。

### 2.2 日期识别优先级

1. 文件名匹配 `YYYYMMDD`、`YYYY-MM-DD`、`YYYY.MM.DD`、`YYYY_MM_DD`。
2. 父目录匹配 `YYYYMM`，文件名匹配 `MMDD`、`MM-DD`、`MM.DD`。
3. 父目录为 `YYYYMM`，文件名匹配 `DD` 或 `D`，只在该月目录内唯一时接受。
4. 其余情况标记 `DATE_UNRESOLVED`，要求用户在预览中指定日期或跳过。

规则：

- 不使用文件修改时间作为自动日期，避免同步软件和复制操作改变日期。
- 日期必须是合法公历日期；`20250230` 标记非法。
- 同一日期多个文件不自动合并，标记冲突。
- 文件名可以包含额外标题文本，例如 `2025-04-01 问题排查.txt`；标题只用于预览，不覆盖正文。

### 2.3 编码识别

按以下顺序检测：

1. UTF-8 BOM：识别并移除 BOM 后按 UTF-8 解码。
2. 严格 UTF-8：任何非法序列则失败。
3. GB18030：兼容 GBK 和多数简体中文历史编码。
4. 仍失败则标记 `ENCODING_UNRESOLVED`。

安全规则：

- 从不使用宽松 UTF-8 替换字符后直接保存。
- 用户可在预览中手动切换 UTF-8/GB18030。
- 原始字节始终保存，解码结果是可重建派生物。
- 保留原始换行风格元数据，但编辑器内部统一为 LF。

### 2.4 文件读取

```ts
export interface RawImportFile {
  relativePath: string;       // 使用 / 作为逻辑分隔符
  fileName: string;
  bytes: Uint8Array | Blob;
  byteSize: number;
  lastModified?: number;      // 仅诊断，不参与自动日期
}

export interface FileImportSource {
  scan(root: ImportRoot): Promise<AsyncIterable<RawImportFile>>;
}
```

- 桌面端 Rust 侧遍历用户选择的目录，跳过符号链接或限制其解析，避免逃逸到非预期目录。
- Web File System Access API 可遍历目录；浏览器不支持时使用 `<input webkitdirectory>`，只读取本次选择结果。
- 相对路径统一使用 `/`，不将 Windows `\` 写入数据库。
- 扫描采用流式或分批读取，避免一次性把 10,000 个文件读入 UI 内存。

## 3. 导入阶段与状态机

```text
scanning
  -> preview_ready
    -> committing
      -> completed
      -> failed
      -> rolled_back
```

### 3.1 扫描

输入：

- 根目录句柄。
- 可选日期推断覆盖。
- 文件大小和数量限制。

输出：

- `ImportPreview`，包含文件摘要、识别结果、冲突、异常和预计写入量。

扫描阶段可以写入临时 preview 模型，但不能创建正式 Journal。

### 3.2 预览

预览列表字段：

- 相对路径和文件名。
- 识别出的日期。
- 编码及检测置信度。
- 原始大小和哈希。
- 可读正文摘录。
- 状态：ready、skipped、conflict、invalid。
- 冲突说明：同日已有日志、同哈希重复、同日期多文件。
- 用户可选操作：导入、跳过、指定日期、追加、另存版本。

预览必须显示真实错误，不用通用“部分文件失败”掩盖原因。

### 3.3 提交

用户确认后：

- 将选中文件按稳定顺序提交。
- 预览阶段已提交的 `import_sessions`、`import_entries` 是审计暂存记录，不属于正式数据事务的回滚范围。
- 桌面端在单个 SQLite `BEGIN IMMEDIATE` 事务中写入 `journals`、`journal_versions`、`structured_blocks`、标签、搜索文档和附件关联，同时把选中条目更新为 `imported` 并写入 `journal_id`，最后把会话更新为 `completed`。
- Web 在单个 Dexie `rw` transaction 中完成同一组正式写入和审计状态更新。
- 提交前先用短审计事务校验 `expectedSessionRevision` 并把会话从 `preview_ready` 推进为 `committing`；正式事务再次校验当前状态与 revision，完成后推进为 `completed`。会话每次有效状态变化都递增 `revision`，不匹配时返回 `CONFLICT`，避免重复提交同一预览。
- 任一业务数据写入或索引更新失败，正式数据事务整批回滚，不留下部分 Journal、版本、投影或“部分 imported”条目。
- 正式数据事务回滚后，通过独立的审计事务把会话写为 `failed` 或 `rolled_back`，并记录失败条目的 `error_code/error_detail`；审计事务不得写正式业务表。
- 事务提交成功后才向用户返回 `completed`。
- 插入顺序固定为 Journal 后 ImportEntry，由 `import_entries.journal_id` 单向引用 Journal；`journals` 不反向引用 `import_entries`，避免循环外键。

### 3.4 失败与回滚

“导入失败回滚”指提交阶段失败时，不留下部分正式日志、版本、投影或搜索索引。预览审计记录和失败原因必须保留，便于用户定位文件并修正后重试。

- `failed`：已尝试正式提交但发生未恢复错误，正式数据事务已回滚。
- `rolled_back`：提交被用户取消、进程中断恢复或显式中止，确认没有正式业务数据部分写入。
- 上述状态写入也使用独立审计事务，并使 `import_sessions.revision + 1`；审计失败不能回滚已经完成的正式提交。
- 启动恢复发现遗留的 `committing` 会话时，先以只读检查确认没有对应正式 Journal，再通过审计事务标记为 `failed` 或 `rolled_back`。不得根据审计状态盲目补写业务数据。

对已成功完成的导入，V1 不提供无限期的批次级撤销按钮。用户可以通过日志历史版本恢复到导入前内容，或从备份恢复。后续版本可以增加“撤销最近导入批次”。

### 3.5 增量导入

每个文件计算 SHA-256，并保存来源路径和原始字节。默认判定：

1. `relativePath` 已存在且 hash 相同：`duplicate_path`，默认跳过。
2. 同日期已有日志且 `file_sha256` 相同：`duplicate_content`，默认跳过。
3. 同日期已有日志但 hash 不同：`same_date_conflict`，要求用户选择。
4. 无冲突：`ready`。

用户可再次选择同一根目录进行增量导入。已导入文件默认不重复创建日志。

## 4. 冲突策略

| 策略 | 行为 | 默认 |
| --- | --- | --- |
| 跳过 | 不修改已有日志，记录 skipped | 是 |
| 追加 | 将新文本作为新段落追加到当天日志，生成新 revision | 否 |
| 作为新版本 | 用导入文本创建新 revision，旧 revision 留在历史 | 否 |
| 创建冲突副本 | 新建独立 Journal 或标记为冲突草稿，保留双方内容 | 否 |

V1 的主日志唯一日期约束意味着“创建冲突副本”不能直接创建两个同日期 active Journal。推荐实现为：

- 如果用户选择保留双方，先把旧正文写入历史版本，再把新正文写入当前日志，并在 `change_source` 和导入结果中记录来源。
- 或者创建一个无日期的 Draft 表，V1 为了控制范围不单独引入 Draft 表，改为在导入预览中要求用户选择主版本。

不允许静默覆盖。

## 5. 原始内容保留

每个导入条目保存：

- `relative_path`
- `original_file_name`
- `file_sha256`
- `raw_size`
- `raw_capture_status`
- `raw_bytes`
- `raw_cleaned_at`
- `encoding`
- `newline_style`
- `journal_id`
- `import_session_id`

`raw_capture_status` 只有三个互斥值：

- `captured`：已读取原始字节，哈希和大小可用。
- `cleaned`：原字节曾成功读取，后由用户主动清理；哈希、大小和清理时间保留。
- `unavailable`：文件枚举成功但读取失败，无法计算哈希且没有可保存字节；保留路径、错误码和可获得的文件元数据。

`unavailable` 不是“空文件”，也不是“已清理”。它不能参与按内容哈希的增量去重，但必须出现在扫描统计和异常列表中。

原始内容用途：

- 查看历史导入来源。
- 编码误判后重新解码。
- 解析器升级后重新生成 Tiptap JSON。
- 导出时保留原始文本。
- 完整性检查和重复检测。

清理策略：

- 默认随导入日志保留。
- Data Management 中允许用户清理原始字节以节省空间。
- 清理前明确提示：以后无法无损恢复原始编码和换行。
- 清理只适用于 `captured` 条目；`unavailable` 条目没有可清理内容。

## 6. 导入预览 DTO

```ts
export interface ImportPreview {
  sessionId: string;
  rootLabel: string;
  files: ImportPreviewFile[];
  counts: {
    scanned: number;
    ready: number;
    skipped: number;
    conflicts: number;
    invalid: number;
  };
  estimatedBytes: number;
  warnings: ImportWarning[];
}

export interface ImportPreviewFile {
  entryId: string;
  relativePath: string;
  fileName: string;
  detectedDate: string | null;
  encoding: "utf8" | "utf8-bom" | "gb18030" | "unknown";
  rawCaptureStatus: "captured" | "cleaned" | "unavailable";
  hash: string | null;
  byteSize: number | null;
  excerpt: string;
  status: "ready" | "skipped" | "conflict" | "invalid";
  conflict?: {
    kind: "duplicate_path" | "duplicate_content" | "same_date_conflict" | "duplicate_date_in_batch";
    existingJournalId?: string;
    existingRevision?: number;
  };
  errorCode?: string;
  errorMessage?: string;
}
```

UI 不必一次显示所有正文，只显示摘录；点击条目可查看只读全文。

## 7. 导出

### 7.1 Markdown 导出

输出目录：

```text
dailyflow-export-20261030/
├─ manifest.json
├─ journals/
│  └─ 2026/
│     └─ 10/
│        └─ 2026-10-30.md
├─ knowledge/
│  ├─ issues/
│  ├─ solutions/
│  └─ notes/
├─ attachments/
└─ README.txt
```

规则：

- 文件名使用本地日期和净化后的标题。
- 同一实体标题冲突时追加短 ID。
- Markdown 由权威 JSON 生成，不读取或信任可能过期的缓存。
- 附件使用稳定相对路径，Markdown 中引用相对路径。
- `manifest.json` 记录导出范围、schema、实体 ID、哈希和附件列表。
- 默认不导出软删除内容，除非用户选择“包含回收站”。

### 7.2 JSON 导出

用于自动化、调试和未来迁移。建议采用 NDJSON：

```text
entities/journals.ndjson
entities/journal-versions.ndjson
entities/knowledge-items.ndjson
entities/tasks.ndjson
entities/tags.ndjson
entities/attachments.ndjson
imports/entries.ndjson
manifest.json
```

每行一个完整 DTO，带 `entityType`、`schemaVersion` 和稳定 ID。敏感字段和本地绝对路径不得进入导出。

## 8. 完整备份

### 8.1 备份格式

V1 推荐跨平台可移植备份 `.dailyflow-backup.zip`：

```text
manifest.json
data/
  journals.ndjson
  journal-versions.ndjson
  structured-blocks.ndjson
  knowledge-items.ndjson
  tasks.ndjson
  tags.ndjson
  relations.ndjson
  attachments.ndjson
  reports.ndjson
  import-entries.ndjson
imports/
  raw/
    ab/
      <sha256>.bin
attachments/
  ab/cd/<sha256>.bin
checksums.json
```

桌面端另有“本地快速备份”选项，可使用 SQLite 一致性副本，但跨平台恢复仍使用可移植格式。建议 UI 默认引导用户创建可移植备份。

### 8.2 manifest

```json
{
  "format": "dailyflow-backup",
  "formatVersion": 1,
  "databaseSchemaVersion": 1,
  "dataSchemaVersion": 1,
  "editorSchemaVersion": 1,
  "appVersion": "1.0.0",
  "createdAt": "2026-10-30T03:20:11.123Z",
  "deviceId": "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
  "counts": {
    "journals": 0,
    "knowledgeItems": 0,
    "tasks": 0,
    "attachments": 0,
    "importEntries": 0,
    "rawImportFiles": 0,
    "rawImportBytes": 0,
    "rawImportUnavailable": 0
  },
  "totalBytes": 0,
  "contentDigest": "sha256:..."
}
```

### 8.3 一致性

- 桌面快速备份：`VACUUM INTO` 到一个临时文件，避免复制 WAL 活跃数据库。
- 可移植备份：在逻辑快照或只读事务下读取一致版本。
- Web 备份：先锁定写入或读取同一 Dexie 快照，再打包。
- 备份目录由用户选择；默认不覆盖已有文件。
- 备份完成后重新打开并校验 manifest 和 checksums。
- `import-entries.ndjson` 保存来源路径、`rawCaptureStatus`、可空哈希、可空大小、编码和 `rawBlobPath`。只有 `captured` 条目引用 `imports/raw/<hash前缀>/<sha256>.bin`；`cleaned` 与 `unavailable` 都必须保存 `rawBlobPath: null`。
- 原始导入字节以 SHA-256 命名并逐文件登记 checksum；恢复后必须重新校验其哈希和大小。`cleaned` 通过 `raw_cleaned_at` 表示主动清理，`unavailable` 通过错误码表示源文件不可读，禁止根据 `null` 路径猜测状态。
- 附件与导入原始字节使用不同目录，避免附件清理任务误删历史源文件。

## 9. 恢复

### 9.1 恢复前检查

1. 文件扩展名和 ZIP 结构。
2. `format`、`formatVersion`、schema 版本。
3. manifest 必填字段和哈希。
4. 实体 ID 唯一性、日期合法性、引用的附件存在。
5. `captured` 条目引用的原始字节存在、大小匹配且 SHA-256 一致；`cleaned` 条目必须带有清理时间和保留的哈希/大小；`unavailable` 条目必须带读取错误且不得引用原始字节文件。
6. 目标设备剩余空间。
7. 当前数据是否已有内容；若有，先提示创建安全快照。

### 9.2 恢复策略

- 默认恢复到新的空数据库/空 stores。
- 如果当前有数据，V1 优先使用“替换全部”而非复杂合并；必须二次确认并自动创建当前状态备份。
- 恢复先写入临时数据库或 staging stores。
- 校验行数、外键、搜索可重建性和附件哈希。
- 校验导入条目与 `imports/raw` 文件的一一对应关系，不允许路径穿越或未登记文件被静默忽略。
- 校验通过后原子切换。
- 失败时删除临时数据，保留当前数据。

### 9.3 恢复后重建

- 搜索索引可从权威正文重建。
- Markdown/plain text 可在 projector 版本升级后重建。
- 附件 orphan 清理不在恢复过程中自动执行。

## 10. 平台实现

### 10.1 Windows/macOS

- 使用 Tauri dialog 选择目录或文件。
- Rust 侧遍历、读取、解码、哈希、写入。
- 大文件使用流式和临时文件。
- 路径只在 Rust 侧使用 `PathBuf`，数据库存逻辑相对路径。
- 写入备份时使用临时文件 + 原子 rename。

### 10.2 Web

- File System Access API 可用时直接选择目录。
- 不可用时使用 directory input，读取结果不能回写原目录。
- 导出通过 Blob 下载或 File System Access 的保存句柄。
- 单个 ZIP 建议使用流式压缩库；打包前检查内存估算。
- 浏览器存储配额不足时阻止备份输出到 IndexedDB，改为直接下载。

### 10.3 路径归一化

```ts
const UNC_PREFIX = /^(?:\\\\|\/\/)/;
const VOLUME_PREFIX = /^[A-Za-z]:/;

function toLogicalPath(parts: string[]): string {
  const raw = parts.join("/");

  if (VOLUME_PREFIX.test(raw) || UNC_PREFIX.test(raw)) {
    throw new Error("PATH_ABSOLUTE_PREFIX_REJECTED");
  }

  const segments = raw.split(/[\\/]+/);
  if (segments.some((part) => part === "..")) {
    throw new Error("PATH_TRAVERSAL_REJECTED");
  }

  return segments
    .filter((part) => part !== "" && part !== ".")
    .join("/");
}
```

拒绝路径穿越、磁盘卷名、UNC 前缀和符号链接逃逸。以上函数必须接收已经相对于用户选择根目录的路径片段；`..`、盘符或 UNC 前缀一旦出现就拒绝，而不是静默删除。逻辑路径只用于归档和显示，不用作未校验的文件访问路径。

## 11. 错误模型

```ts
export type ImportErrorCode =
  | "DATE_UNRESOLVED"
  | "DATE_INVALID"
  | "ENCODING_UNRESOLVED"
  | "FILE_TOO_LARGE"
  | "FILE_READ_FAILED"
  | "EMPTY_FILE"
  | "DUPLICATE_PATH"
  | "DUPLICATE_CONTENT"
  | "SAME_DATE_CONFLICT"
  | "PARSE_FAILED"
  | "COMMIT_FAILED"
  | "QUOTA_EXCEEDED";

export interface ImportIssue {
  entryId?: string;
  code: ImportErrorCode;
  message: string;
  retryable: boolean;
}
```

导入结果必须区分：

- 未选中。
- 扫描跳过。
- 预览冲突。
- 用户跳过。
- 事务失败导致整批回滚。

## 12. 完整性与安全要求

- 导入不执行 TXT 中的链接、脚本或宏。
- HTML 导入经过白名单清洗。
- ZIP 恢复防止 zip-slip：条目路径必须规范化且在目标目录内。
- 备份 manifest 中的路径不使用绝对路径。
- 对候选备份设置最大解压大小和文件数限制，防压缩炸弹。
- 恢复过程不使用用户提供的任意本地可执行内容。
- 批量导入显示进度和取消入口，取消后事务回滚。

## 13. 测试计划

### 13.1 导入 fixture

- UTF-8 无 BOM。
- UTF-8 BOM。
- GBK/GB18030 中文。
- CRLF 和混合换行。
- 空文件。
- 非法日期和无法识别文件名。
- 同名不同内容。
- 同内容不同路径。
- 10,000 个文件批次（性能测试）。
- 包含 `..`、UNC、Windows 盘符和恶意压缩路径的归档。

### 13.2 验收

- 合法文件成功数、跳过数、冲突数与预览一致。
- 事务中制造一次写入失败，数据库无新增正式日志。
- 增量第二次导入默认跳过相同内容。
- 原始字节哈希与源文件一致。
- 导出 Markdown 能重新导入，权威 JSON 结构和关键结构化块保持。
- 备份恢复后正文哈希、实体计数和附件哈希一致。

## 14. 明确边界

- V1 支持 TXT 历史日志，不支持自动导入 Word、PDF、Evernote 或 Obsidian Vault。
- V1 不做云备份。
- V1 不实现批次级无限撤销；实现事务失败回滚和历史恢复。
- V1 不承诺 Safari 具备与 Chrome 相同的目录持久访问能力。

