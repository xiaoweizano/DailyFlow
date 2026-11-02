import { ATTACHMENT_OWNER_TYPES, type AttachmentOwnerType } from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";
import { z } from "zod";

import { mapApplicationError, validationError } from "../errors.js";
import type { AttachmentStore, StoredAttachment } from "../ports/attachment-store.js";
import { EntityIdSchema } from "../validation.js";

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/zip",
  "application/octet-stream",
] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_ALLOWED_MIME_TYPES)[number];

export interface AttachmentPolicy {
  maxBytes: number;
}

export const DEFAULT_ATTACHMENT_POLICY: AttachmentPolicy = {
  maxBytes: 50 * 1024 * 1024,
};

const AddAttachmentSchema = z.object({
  ownerType: z.enum(ATTACHMENT_OWNER_TYPES),
  ownerId: EntityIdSchema,
  displayName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ATTACHMENT_ALLOWED_MIME_TYPES),
  bytes: z.instanceof(Uint8Array),
  altText: z.string().max(500).optional(),
  isInline: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export interface AddAttachmentDependencies {
  readonly attachments: AttachmentStore;
  readonly policy: AttachmentPolicy;
}

export type AddAttachmentInput = z.input<typeof AddAttachmentSchema>;
export type AddAttachmentResult = Result<StoredAttachment, AppError>;

export async function addAttachment(
  dependencies: AddAttachmentDependencies,
  input: unknown,
): Promise<AddAttachmentResult> {
  const parsed = AddAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: validationError(parsed.error) };
  }
  if (parsed.data.bytes.byteLength > dependencies.policy.maxBytes) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The attachment exceeds the configured size limit.",
        fields: {
          bytes: `Attachment must not exceed ${dependencies.policy.maxBytes} bytes.`,
        },
      },
    };
  }

  try {
    return {
      ok: true,
      value: await dependencies.attachments.put({
        ownerType: parsed.data.ownerType as AttachmentOwnerType,
        ownerId: parsed.data.ownerId,
        displayName: parsed.data.displayName,
        mimeType: parsed.data.mimeType,
        bytes: parsed.data.bytes,
        ...(parsed.data.altText === undefined ? {} : { altText: parsed.data.altText }),
        ...(parsed.data.isInline === undefined ? {} : { isInline: parsed.data.isInline }),
        ...(parsed.data.sortOrder === undefined ? {} : { sortOrder: parsed.data.sortOrder }),
      }),
    };
  } catch (error) {
    return { ok: false, error: mapApplicationError(error, "attachment") };
  }
}
