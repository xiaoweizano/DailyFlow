import type { UtcTimestamp } from "@dailyflow/domain";

export type StorageKind = "sqlite" | "indexeddb";

export interface DataHealthFacts {
  readonly integrity: string;
  readonly foreignKeyViolationCount: number;
  readonly duplicateJournalDateCount: number;
  readonly orphanedAttachmentCount: number;
  readonly invalidAttachmentLinkCount: number;
  readonly invalidTaskRelationCount: number;
  readonly indexedDocumentCount: number;
  readonly authoritativeDocumentCount: number;
  readonly staleProjectionCount: number;
  readonly staleIndexVersionCount: number;
  readonly searchIndexState: "ready" | "stale" | "failed";
  readonly lastBackupAt: UtcTimestamp | null;
}

export interface DataStorageSummary {
  readonly storageKind: StorageKind;
  readonly locationLabel: string;
  readonly schemaVersion: number;
  readonly usageBytes: number;
  readonly quotaBytes: number | null;
  readonly persisted: boolean;
  readonly journalCount: number;
  readonly knowledgeItemCount: number;
  readonly taskCount: number;
  readonly attachmentCount: number;
  readonly rawImportByteCount: number;
  readonly searchDocumentCount: number;
  readonly lastBackupAt: UtcTimestamp | null;
}

export interface DataHealthSnapshot {
  readonly facts: DataHealthFacts;
  readonly storage: DataStorageSummary;
}

export interface DataManagementPort {
  inspect(): Promise<DataHealthSnapshot>;
}
