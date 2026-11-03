import {
  exportData,
  type ContentProjector,
  type ExportDataOutcome,
  type ExportEstimate,
  type ExportOptions,
  type ExportSource,
  type ExportTarget,
} from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";
import type { AppError } from "@dailyflow/shared";

export interface ExportRuntimeDependencies {
  readonly source: ExportSource;
  readonly target: ExportTarget;
  readonly projector: ContentProjector;
  readonly clock: Clock;
}

export interface ExportRuntimeServices {
  estimate(options: ExportOptions): Promise<ExportEstimate>;
  run(options: ExportOptions): Promise<ExportDataOutcome>;
}

function applicationErrorMessage(error: AppError): string {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return "导出参数无效，请检查所选范围和包含项。";
    case "QUOTA_EXCEEDED":
      return "本地存储空间不足，无法完成导出。";
    case "STORAGE_UNAVAILABLE":
      return error.retryable ? "本地存储暂时不可用，请重试。" : "无法访问本地导出存储。";
    case "CONFLICT":
      return "目标文件已存在，请选择其他文件名。";
    case "NOT_FOUND":
      return "导出所需的数据已不存在，请刷新后重试。";
    case "IMPORT_FAILED":
      return "导入数据无法读取，导出未完成。";
    case "MIGRATION_FAILED":
      return "数据版本不兼容，导出未完成。";
    case "BACKUP_INVALID":
      return "导出数据校验失败。";
    case "AI_UNAVAILABLE":
      return "AI 服务不可用；导出不依赖 AI。";
  }
}

export function createExportRuntimeServices(
  dependencies: ExportRuntimeDependencies,
): ExportRuntimeServices {
  return {
    estimate: (options) => dependencies.source.estimate(options),
    async run(options) {
      const result = await exportData(
        {
          source: dependencies.source,
          target: dependencies.target,
          projector: dependencies.projector,
          clock: dependencies.clock,
        },
        options,
      );
      if (!result.ok) {
        throw new Error(applicationErrorMessage(result.error));
      }
      return result.value;
    },
  };
}
