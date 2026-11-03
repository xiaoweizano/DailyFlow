import { DomainRuleError } from "@dailyflow/domain";
import type { AppError } from "@dailyflow/shared";
import type { ZodError } from "zod";

import { PortError } from "./ports/port-error.js";

export function validationError(error: ZodError): AppError {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? "input" : issue.path.join(".");
    fields[field] ??= issue.message;
  }

  return {
    code: "VALIDATION_ERROR",
    message: "The application input is invalid.",
    fields,
  };
}

export function mapApplicationError(error: unknown, fallbackEntity: string): AppError {
  if (error instanceof PortError) {
    switch (error.code) {
      case "VALIDATION_ERROR":
        return {
          code: "VALIDATION_ERROR",
          message: error.details.message ?? "A storage boundary rejected the input.",
          ...(error.details.fields === undefined ? {} : { fields: error.details.fields }),
        };
      case "NOT_FOUND":
        return {
          code: "NOT_FOUND",
          entity: error.details.entity ?? fallbackEntity,
          id: error.details.id ?? "",
        };
      case "CONFLICT":
        return {
          code: "CONFLICT",
          entity: error.details.entity ?? fallbackEntity,
          expectedRevision: error.details.expectedRevision ?? 0,
          actualRevision: error.details.actualRevision ?? 0,
        };
      case "QUOTA_EXCEEDED":
        return {
          code: "QUOTA_EXCEEDED",
          ...(error.details.requiredBytes === undefined
            ? {}
            : { requiredBytes: error.details.requiredBytes }),
        };
      case "STORAGE_UNAVAILABLE":
        return {
          code: "STORAGE_UNAVAILABLE",
          retryable: error.details.retryable ?? true,
        };
      case "BACKUP_INVALID":
        return {
          code: "BACKUP_INVALID",
          reason: error.details.message ?? "The backup archive is invalid.",
        };
    }
  }

  if (error instanceof DomainRuleError) {
    return {
      code: "VALIDATION_ERROR",
      message: error.message,
      fields: { [error.field]: error.message },
    };
  }

  if (error instanceof RangeError) {
    return {
      code: "VALIDATION_ERROR",
      message: error.message,
    };
  }

  return {
    code: "STORAGE_UNAVAILABLE",
    retryable: true,
  };
}
