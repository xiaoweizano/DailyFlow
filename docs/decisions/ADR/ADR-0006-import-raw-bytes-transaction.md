# ADR-0006：TXT 导入保留原始字节并整批事务提交

- 状态：Proposed
- 日期：2026-10-30
- 决策范围：历史数据迁移、导入预览、备份和恢复

## 背景

用户已有多年按月份目录保存的 TXT 日志，可能混用 UTF-8、UTF-8 BOM 和 GBK，文件名格式不完全一致。导入是 V1 的关键数据迁移路径。仅保存解码后的富文本会让编码误判或解析器升级后无法恢复；边扫描边写入正式日志则会在异常时留下半批数据。

## 决策

### 扫描与预览

- 递归扫描用户选择的根目录，只接收 `.txt`。
- 日期优先来自文件名，其次来自 `YYYYMM` 月份目录与 `MMDD`/`DD` 组合。
- 修改时间只作诊断，不参与自动日期判断。
- 编码顺序为 UTF-8 BOM、严格 UTF-8、GB18030；失败标记 `ENCODING_UNRESOLVED`。
- 扫描先创建 `scanning` 的 `import_sessions` 记录，再以独立审计事务写入 `import_entries` 和统计并推进到 `preview_ready`，全程不创建正式 Journal。
- 每个文件计算 SHA-256，预览识别重复路径、重复内容、同日冲突和批内重复日期。

### 原始内容

每个导入条目保存：

```text
relative_path
original_file_name
detected_date
encoding
newline_style
file_sha256
raw_size
raw_capture_status
raw_bytes
raw_cleaned_at
```

`raw_capture_status` 必须为 `captured`、`cleaned` 或 `unavailable` 之一。`captured` 保存非空字节、哈希和大小；`cleaned` 清空字节但保留哈希、大小和清理时间；`unavailable` 表示文件枚举成功但读取失败，无法计算哈希或保存字节，必须保留错误码和来源。读取失败不能伪装成用户清理，也不能保存伪造哈希。这样可以重新解码、恢复原换行和解释导入结果。

### 提交与回滚

- 用户确认策略后再提交。
- 提交携带 `expectedSessionRevision`；短审计事务先进入 `committing`，正式事务再次校验状态与 revision，成功后进入 `completed`。会话每次状态变化递增 `revision`，版本不匹配时 `CONFLICT`，防止重复提交同一预览。
- 桌面使用单个 `BEGIN IMMEDIATE` 事务；Web 使用单个 Dexie `rw` transaction。
- 先写 Journal、版本和投影，再更新 ImportEntry 的 `journal_id`。
- `journals` 不反向引用 `import_entries`，避免循环外键和插入顺序问题。
- 任一正式写入或索引更新失败，整批正式变更回滚；Application 再通过独立审计事务记录 `failed`/`rolled_back` 和逐项错误。
- 预览阶段保存的 `import_sessions` 和 `import_entries` 是审计暂存记录；正式事务失败后，通过独立审计事务把会话标记为 `failed`/`rolled_back` 并保留逐项错误。
- 审计事务只能修改导入会话和条目状态，不得写入 Journal、版本、投影或搜索索引；正式提交不得留下部分 Journal 或部分成功条目。
- 已完成批次不提供无限期撤销；使用历史版本或备份恢复。

### 备份

- 可移植备份包含 `imports/raw/<hash前缀>/<sha256>.bin`。
- `import_entries.rawBlobPath`、`rawCaptureStatus`、可空哈希、可空大小和 checksum 一起验证。
- 已清理与不可读取条目都存 `rawBlobPath: null`，但用不同状态和错误码区分，不能伪造空文件。

## 被否决的方案

### 只保存解码后的纯文本

无法从错误编码或解析器升级中无损恢复，违反迁移可信目标。否决。

### 边扫描边逐文件提交

失败会留下半批数据，重复执行也难解释。否决。

### 用文件修改时间补日期

复制、同步和备份会改变修改时间，容易把日志归入错误日期。否决。

### 宽松 UTF-8 替换解码

会静默产生乱码字符并保存错误正文。只允许严格解码和显式回退。

## 后果

- 数据库会因原始字节变大，需要清理入口和备份空间提示。
- 导入事务可能需要限制单批文件数；超大目录分批时必须明确“每批原子”和用户可见进度。
- Web 受 ZIP/IndexedDB 配额影响，可能需要先导出或分批处理。
- 备份和恢复必须区分配件目录与导入原始字节目录。
- 日期和编码错误必须在预览中可操作，而不是提交后猜测。

## 验证

- UTF-8、BOM、GBK、CRLF、混合换行和非法日期 fixture。
- 故障注入后正式 Journal、版本、投影和索引零新增。
- 第二次同目录导入默认全部跳过。
- 原始字节哈希与源文件一致；`captured`、`cleaned`、`unavailable` 三种状态都满足 CHECK 约束。
- 备份完整恢复后原始字节哈希、大小、清理时间和不可读取错误一致。
- 归档路径拒绝 `..`、UNC、盘符和符号链接逃逸。

## 关联文档

- [导入、导出、备份与恢复设计](../../architecture/IMPORT-EXPORT-DESIGN.md)
- [数据库设计](../../architecture/DATABASE-DESIGN.md)
- [开发计划](../../development/DEVELOPMENT-PLAN.md)
