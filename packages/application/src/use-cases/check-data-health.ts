import type { Clock, UtcTimestamp } from "@dailyflow/domain";

import type {
  DataHealthFacts,
  DataHealthSnapshot,
  DataManagementPort,
  DataStorageSummary,
} from "../ports/data-management-port.js";

export type DataHealthStatus = "healthy" | "attention" | "critical";
export type DataHealthSeverity = "warning" | "critical";

export type DataHealthIssueCode =
  | "integrity_check_failed"
  | "foreign_key_violations"
  | "duplicate_journal_dates"
  | "orphaned_attachments"
  | "invalid_attachment_links"
  | "invalid_task_relations"
  | "stale_search_projections"
  | "stale_search_index_versions"
  | "search_document_count_mismatch"
  | "search_index_failed"
  | "backup_not_observed";

export interface DataHealthIssue {
  readonly code: DataHealthIssueCode;
  readonly severity: DataHealthSeverity;
  readonly title: string;
  readonly detail: string;
  readonly recommendation: string;
  readonly count: number;
}

export interface DataHealthReport {
  readonly status: DataHealthStatus;
  readonly checkedAt: UtcTimestamp;
  readonly facts: DataHealthFacts;
  readonly storage: DataStorageSummary;
  readonly issues: readonly DataHealthIssue[];
}

export interface CheckDataHealthDependencies {
  readonly port: DataManagementPort;
  readonly clock: Clock;
}

function issue(
  code: DataHealthIssueCode,
  severity: DataHealthSeverity,
  title: string,
  detail: string,
  recommendation: string,
  count: number,
): DataHealthIssue {
  return { code, severity, title, detail, recommendation, count };
}

export function buildDataHealthReport(
  snapshot: DataHealthSnapshot,
  checkedAt: UtcTimestamp,
): DataHealthReport {
  const { facts, storage } = snapshot;
  const issues: DataHealthIssue[] = [];

  if (facts.integrity.toLowerCase() !== "ok") {
    issues.push(
      issue(
        "integrity_check_failed",
        "critical",
        "数据库完整性检查未通过",
        `完整性检查返回：${facts.integrity}`,
        "请先创建可用备份，再使用受支持的恢复流程处理。",
        1,
      ),
    );
  }
  if (facts.foreignKeyViolationCount > 0) {
    issues.push(
      issue(
        "foreign_key_violations",
        "critical",
        "存在无效的数据关系",
        `${facts.foreignKeyViolationCount} 条关系违反了外键约束。`,
        "请恢复最近一次已验证备份，并保留当前数据用于诊断。",
        facts.foreignKeyViolationCount,
      ),
    );
  }
  if (facts.duplicateJournalDateCount > 0) {
    issues.push(
      issue(
        "duplicate_journal_dates",
        "critical",
        "日志日期重复",
        `${facts.duplicateJournalDateCount} 个日期对应多条未删除日志。`,
        "请恢复备份或导出原始记录后再修复日期冲突。",
        facts.duplicateJournalDateCount,
      ),
    );
  }
  if (facts.orphanedAttachmentCount > 0) {
    issues.push(
      issue(
        "orphaned_attachments",
        "warning",
        "存在未引用的附件",
        `${facts.orphanedAttachmentCount} 个附件没有被日志或知识条目引用。`,
        "检查附件来源；需要保留时重新关联，确认无用后再通过数据管理功能清理。",
        facts.orphanedAttachmentCount,
      ),
    );
  }
  if (facts.invalidAttachmentLinkCount > 0) {
    issues.push(
      issue(
        "invalid_attachment_links",
        "critical",
        "附件关系无效",
        `${facts.invalidAttachmentLinkCount} 条附件引用指向不存在的附件或所属内容。`,
        "请恢复备份，并导出包含附件的归档以保留现场。",
        facts.invalidAttachmentLinkCount,
      ),
    );
  }
  if (facts.invalidTaskRelationCount > 0) {
    issues.push(
      issue(
        "invalid_task_relations",
        "critical",
        "任务关系无效",
        `${facts.invalidTaskRelationCount} 个任务指向不存在的来源实体。`,
        "请恢复备份，或导出任务数据后再修复来源关系。",
        facts.invalidTaskRelationCount,
      ),
    );
  }
  if (facts.staleProjectionCount > 0) {
    issues.push(
      issue(
        "stale_search_projections",
        "warning",
        "搜索投影需要更新",
        `${facts.staleProjectionCount} 条搜索文档内容已过期。`,
        "执行“检查并重建索引”以从权威内容重新生成搜索索引。",
        facts.staleProjectionCount,
      ),
    );
  }
  if (facts.staleIndexVersionCount > 0) {
    issues.push(
      issue(
        "stale_search_index_versions",
        "warning",
        "搜索索引版本较旧",
        `${facts.staleIndexVersionCount} 条搜索文档使用了旧索引版本。`,
        "执行“检查并重建索引”以升级索引。",
        facts.staleIndexVersionCount,
      ),
    );
  }
  const documentCountMismatch = facts.indexedDocumentCount !== facts.authoritativeDocumentCount;
  if (documentCountMismatch) {
    const difference = Math.abs(facts.indexedDocumentCount - facts.authoritativeDocumentCount);
    issues.push(
      issue(
        "search_document_count_mismatch",
        "warning",
        "搜索文档数量不一致",
        `索引中有 ${facts.indexedDocumentCount} 条文档，权威数据应有 ${facts.authoritativeDocumentCount} 条。`,
        "执行“检查并重建索引”使搜索数据与权威内容一致。",
        difference,
      ),
    );
  }
  if (facts.searchIndexState === "failed") {
    issues.push(
      issue(
        "search_index_failed",
        "critical",
        "搜索索引不可用",
        "搜索索引状态为失败。",
        "先导出或备份，再执行索引重建。",
        1,
      ),
    );
  }
  if (facts.lastBackupAt === null && storage.lastBackupAt === null) {
    issues.push(
      issue(
        "backup_not_observed",
        "warning",
        "尚未观察到可用备份",
        "当前设备没有记录到已完成或已验证的备份。",
        "前往“备份与恢复”创建并验证备份。",
        1,
      ),
    );
  }

  const status = issues.some((item) => item.severity === "critical")
    ? "critical"
    : issues.length > 0
      ? "attention"
      : "healthy";

  return { status, checkedAt, facts, storage, issues };
}

export async function checkDataHealth(
  dependencies: CheckDataHealthDependencies,
): Promise<DataHealthReport> {
  const snapshot = await dependencies.port.inspect();
  return buildDataHealthReport(snapshot, dependencies.clock.nowUtc() as UtcTimestamp);
}
