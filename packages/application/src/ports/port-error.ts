export type PortErrorCode =
  "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "STORAGE_UNAVAILABLE" | "QUOTA_EXCEEDED";

export interface PortErrorDetails {
  readonly message?: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly entity?: string;
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly actualRevision?: number;
  readonly retryable?: boolean;
  readonly requiredBytes?: number;
}

export class PortError extends Error {
  readonly code: PortErrorCode;
  readonly details: PortErrorDetails;

  constructor(code: PortErrorCode, details: PortErrorDetails = {}) {
    super(details.message ?? code);
    this.name = "PortError";
    this.code = code;
    this.details = details;
  }
}
