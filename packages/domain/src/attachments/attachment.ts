import type { DomainDependencies } from "../shared/ports.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseContentHash,
  parseEntityId,
  requireNonEmptyString,
  type ContentHash,
  type EntityId,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const ATTACHMENT_STORAGE_KINDS = ["desktop-file", "web-blob"] as const;
export type AttachmentStorageKind = (typeof ATTACHMENT_STORAGE_KINDS)[number];

export const ATTACHMENT_OWNER_TYPES = ["journal", "knowledge_item", "structured_block"] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

export interface AttachmentRef {
  readonly id: EntityId;
  readonly blobId: EntityId;
  readonly ownerType: AttachmentOwnerType;
  readonly ownerId: EntityId;
  readonly displayName: string;
  readonly altText: string;
  readonly isInline: boolean;
  readonly sortOrder: number;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageKind: AttachmentStorageKind;
  readonly storageKey: string;
  readonly sha256: ContentHash;
  readonly createdAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateAttachmentRefInput {
  readonly blobId?: string;
  readonly ownerType: AttachmentOwnerType;
  readonly ownerId: string;
  readonly displayName: string;
  readonly altText?: string;
  readonly isInline?: boolean;
  readonly sortOrder?: number;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageKind: AttachmentStorageKind;
  readonly storageKey: string;
  readonly sha256: string;
}

function validateStorageKey(storageKey: string, storageKind: AttachmentStorageKind): void {
  requireNonEmptyString(storageKey, "storageKey");
  if (storageKind !== "desktop-file") {
    return;
  }

  const isAbsolute = /^[A-Za-z]:[\\/]/.test(storageKey) || storageKey.startsWith("/");
  const segments = storageKey.split("/");
  const hasUnsafeSegment = segments.some(
    (segment) => segment.length === 0 || segment === "." || segment === "..",
  );

  if (isAbsolute || storageKey.includes("\\") || hasUnsafeSegment) {
    throw new DomainRuleError(
      "storageKey",
      "Desktop attachment storageKey must be a normalized relative path using /",
    );
  }
}

export function createAttachmentRef(
  input: CreateAttachmentRefInput,
  dependencies: DomainDependencies,
): AttachmentRef {
  if (!ATTACHMENT_STORAGE_KINDS.includes(input.storageKind)) {
    throw new DomainRuleError(
      "storageKind",
      `Unsupported attachment storage kind: ${input.storageKind}`,
    );
  }
  if (!ATTACHMENT_OWNER_TYPES.includes(input.ownerType)) {
    throw new DomainRuleError("ownerType", `Unsupported attachment owner type: ${input.ownerType}`);
  }
  requireNonEmptyString(input.displayName, "displayName");
  requireNonEmptyString(input.mimeType, "mimeType");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0) {
    throw new DomainRuleError("byteSize", "byteSize must be a non-negative safe integer");
  }
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new DomainRuleError("sortOrder", "sortOrder must be a non-negative safe integer");
  }
  validateStorageKey(input.storageKey, input.storageKind);
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    blobId:
      input.blobId === undefined ? nextEntityId(dependencies.ids) : parseEntityId(input.blobId),
    ownerType: input.ownerType,
    ownerId: parseEntityId(input.ownerId),
    displayName: input.displayName,
    altText: input.altText ?? "",
    isInline: input.isInline ?? false,
    sortOrder,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    storageKind: input.storageKind,
    storageKey: input.storageKey,
    sha256: parseContentHash(input.sha256),
    createdAt,
    deletedAt: null,
  };
}
