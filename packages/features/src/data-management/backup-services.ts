import {
  createBackup,
  inspectBackup,
  restoreBackup,
  type BackupRestoreResult,
  type BackupService,
  type BackupSource,
  type BackupSourceFile,
  type BackupTarget,
  type CreateBackupOutcome,
  type InspectedBackup,
} from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";
import type { AppError } from "@dailyflow/shared";

export type { BackupSource, BackupSourceFile } from "@dailyflow/application";

export interface BackupStorageServices {
  readonly service: BackupService;
  readonly target: BackupTarget;
  readonly source: BackupSource;
}

export interface BackupRuntimeDependencies extends BackupStorageServices {
  readonly clock: Clock;
}

export interface BackupRuntimeServices {
  create(): Promise<CreateBackupOutcome>;
  selectSource(): Promise<BackupSourceFile | null>;
  inspect(file: BackupSourceFile): Promise<InspectedBackup>;
  restore(file: BackupSourceFile, expectedContentDigest: string): Promise<BackupRestoreResult>;
}

function applicationErrorMessage(error: AppError): string {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return "备份操作参数无效，请重新选择备份文件。";
    case "QUOTA_EXCEEDED":
      return "本地存储空间不足，无法完成备份或恢复。";
    case "STORAGE_UNAVAILABLE":
      return error.retryable ? "本地存储暂时不可用，请重试。" : "无法访问本地备份存储。";
    case "CONFLICT":
      return "恢复期间数据已发生变化，请重新检查备份后再试。";
    case "NOT_FOUND":
      return "备份所需的数据已不存在，请刷新后重试。";
    case "IMPORT_FAILED":
      return "备份中的导入记录无法读取，未执行恢复。";
    case "MIGRATION_FAILED":
      return "备份数据版本不兼容，未执行恢复。";
    case "BACKUP_INVALID":
      return `备份文件校验失败：${error.reason}`;
    case "AI_UNAVAILABLE":
      return "AI 服务不可用；备份与恢复不依赖 AI。";
  }
}

export function createBackupRuntimeServices(
  dependencies: BackupRuntimeDependencies,
): BackupRuntimeServices {
  return {
    async create() {
      const result = await createBackup(
        {
          service: dependencies.service,
          target: dependencies.target,
          clock: dependencies.clock,
        },
        {},
      );
      if (!result.ok) {
        throw new Error(applicationErrorMessage(result.error));
      }
      return result.value;
    },

    async selectSource() {
      try {
        return await dependencies.source.select();
      } catch {
        throw new Error("无法读取备份文件，请重试。");
      }
    },

    async inspect(file) {
      const result = await inspectBackup({ service: dependencies.service }, { bytes: file.bytes });
      if (!result.ok) {
        throw new Error(applicationErrorMessage(result.error));
      }
      return result.value;
    },

    async restore(file, expectedContentDigest) {
      const result = await restoreBackup(
        { service: dependencies.service },
        {
          bytes: file.bytes,
          expectedContentDigest,
          replaceExisting: true,
        },
      );
      if (!result.ok) {
        throw new Error(applicationErrorMessage(result.error));
      }
      return result.value;
    },
  };
}
