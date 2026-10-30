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
  readonly entryId?: string;
  readonly code: ImportErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type ImportError = ImportIssue;

export type AppError =
  | {
      readonly code: "VALIDATION_ERROR";
      readonly message: string;
      readonly fields?: Readonly<Record<string, string>>;
    }
  | { readonly code: "NOT_FOUND"; readonly entity: string; readonly id: string }
  | {
      readonly code: "CONFLICT";
      readonly entity: string;
      readonly expectedRevision: number;
      readonly actualRevision: number;
    }
  | {
      readonly code: "STORAGE_UNAVAILABLE";
      readonly retryable: boolean;
      readonly cause?: string;
    }
  | { readonly code: "QUOTA_EXCEEDED"; readonly requiredBytes?: number }
  | {
      readonly code: "IMPORT_FAILED";
      readonly batchId?: string;
      readonly details: readonly ImportError[];
    }
  | {
      readonly code: "MIGRATION_FAILED";
      readonly fromVersion: number;
      readonly toVersion: number;
    }
  | { readonly code: "BACKUP_INVALID"; readonly reason: string }
  | {
      readonly code: "AI_UNAVAILABLE";
      readonly providerId: string;
      readonly reason: string;
    };
