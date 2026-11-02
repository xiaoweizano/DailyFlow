import {
  ATTACHMENT_ALLOWED_MIME_TYPES,
  PortError,
  type AttachmentStore,
  type PutAttachmentInput,
  type StoredAttachment,
} from "@dailyflow/application";
import {
  parseContentHash,
  parseEntityId,
  parseUtcTimestamp,
  type AttachmentOwnerType,
  type AttachmentRef,
  type Clock,
  type EntityId,
  type IdGenerator,
} from "@dailyflow/domain";

import type { DailyFlowDb } from "./db.js";
import type { AttachmentBlobRow, AttachmentLinkRow } from "./schema.js";

export interface WebAttachmentStoreOptions {
  readonly database: DailyFlowDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return toHex(digest);
}

function notFound(attachmentId: EntityId): never {
  throw new PortError("NOT_FOUND", {
    message: "Attachment not found",
    entity: "attachment",
    id: attachmentId,
  });
}

function validateMimeType(mimeType: string): void {
  if (!(ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new PortError("VALIDATION_ERROR", {
      message: "Attachment MIME type is not allowed",
      fields: { mimeType: "The MIME type is not in the attachment allowlist." },
    });
  }
}

function toAttachment(link: AttachmentLinkRow, blob: AttachmentBlobRow): AttachmentRef {
  return {
    id: link.id,
    blobId: blob.id,
    ownerType: link.ownerType,
    ownerId: link.ownerId,
    displayName: link.displayName,
    altText: link.altText,
    isInline: link.isInline,
    sortOrder: link.sortOrder,
    mimeType: blob.mimeType,
    byteSize: blob.byteSize,
    storageKind: "web-blob",
    storageKey: blob.storageKey,
    sha256: blob.sha256,
    createdAt: link.createdAt,
    deletedAt: link.deletedAt,
  };
}

export class WebAttachmentStore implements AttachmentStore {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(options: WebAttachmentStoreOptions) {
    this.database = options.database;
    this.clock = options.clock;
    this.ids = options.ids;
  }

  async put(input: PutAttachmentInput): Promise<StoredAttachment> {
    validateMimeType(input.mimeType);
    const sha256 = await sha256Hex(input.bytes);
    const createdAt = parseUtcTimestamp(this.clock.nowUtc());
    const bytes = new Blob([input.bytes.slice()], { type: input.mimeType });

    return this.database.transaction(
      "rw",
      [this.database.attachmentBlobs, this.database.attachmentLinks],
      async () => {
        const existingBlob = await this.database.attachmentBlobs
          .where("[sha256+byteSize]")
          .equals([parseContentHash(sha256), input.bytes.byteLength])
          .first();
        const blob: AttachmentBlobRow = existingBlob ?? {
          id: parseEntityId(this.ids.nextId()),
          sha256: parseContentHash(sha256),
          byteSize: input.bytes.byteLength,
          mimeType: input.mimeType,
          storageKind: "web-blob",
          storageKey: "",
          bytes,
          createdAt,
          orphanedAt: null,
        };
        if (existingBlob === undefined) {
          await this.database.attachmentBlobs.add({
            ...blob,
            storageKey: blob.id,
          });
        }

        const link: AttachmentLinkRow = {
          id: parseEntityId(this.ids.nextId()),
          blobId: blob.id,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          displayName: input.displayName,
          altText: input.altText ?? "",
          isInline: input.isInline ?? false,
          sortOrder: input.sortOrder ?? 0,
          createdAt,
          deletedAt: null,
        };
        await this.database.attachmentLinks.add(link);
        const storedBlob = {
          ...blob,
          storageKey: blob.id,
        };

        return {
          attachment: toAttachment(link, storedBlob),
          contentHash: storedBlob.sha256,
          byteSize: storedBlob.byteSize,
        };
      },
    );
  }

  async getObjectUrl(attachmentId: EntityId): Promise<string> {
    const { blob } = await this.getActiveAttachment(attachmentId);
    try {
      return URL.createObjectURL(
        new Blob([blob.bytes], {
          type: blob.mimeType,
        }),
      );
    } catch {
      throw new PortError("STORAGE_UNAVAILABLE", {
        message: "Unable to create an attachment object URL",
        retryable: true,
      });
    }
  }

  async read(attachmentId: EntityId): Promise<Uint8Array> {
    const { blob } = await this.getActiveAttachment(attachmentId);
    return new Uint8Array(await blob.bytes.arrayBuffer());
  }

  async softDeleteOwnerLinks(ownerType: AttachmentOwnerType, ownerId: EntityId): Promise<void> {
    const deletedAt = parseUtcTimestamp(this.clock.nowUtc());
    await this.database.transaction(
      "rw",
      [this.database.attachmentBlobs, this.database.attachmentLinks],
      async () => {
        const links = (
          await this.database.attachmentLinks
            .where("[ownerType+ownerId]")
            .equals([ownerType, ownerId])
            .toArray()
        ).filter((link) => link.deletedAt === null);
        const blobIds = new Set(links.map((link) => link.blobId));

        for (const link of links) {
          await this.database.attachmentLinks.put({ ...link, deletedAt });
        }
        for (const blobId of blobIds) {
          const activeLinks = await this.database.attachmentLinks
            .where("blobId")
            .equals(blobId)
            .filter((link) => link.deletedAt === null)
            .count();
          if (activeLinks === 0) {
            const blob = await this.database.attachmentBlobs.get(blobId);
            if (blob !== undefined && blob.orphanedAt === null) {
              await this.database.attachmentBlobs.put({ ...blob, orphanedAt: deletedAt });
            }
          }
        }
      },
    );
  }

  async removeOrphan(attachmentId: EntityId): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.attachmentBlobs, this.database.attachmentLinks],
      async () => {
        const link = await this.database.attachmentLinks.get(attachmentId);
        const blobId = link?.blobId ?? attachmentId;
        const blob = await this.database.attachmentBlobs.get(blobId);
        if (blob === undefined || blob.orphanedAt === null) {
          throw new PortError("CONFLICT", {
            message: "Only orphaned attachments can be removed",
            entity: "attachment",
            id: blobId,
            actualRevision: 0,
          });
        }
        const activeLinks = await this.database.attachmentLinks
          .where("blobId")
          .equals(blobId)
          .filter((candidate) => candidate.deletedAt === null)
          .count();
        if (activeLinks > 0) {
          throw new PortError("CONFLICT", {
            message: "Attachment is still referenced",
            entity: "attachment",
            id: blobId,
            actualRevision: activeLinks,
          });
        }
        await this.database.attachmentBlobs.delete(blobId);
      },
    );
  }

  private async getActiveAttachment(
    attachmentId: EntityId,
  ): Promise<{ readonly link: AttachmentLinkRow; readonly blob: AttachmentBlobRow }> {
    const link = await this.database.attachmentLinks.get(attachmentId);
    if (link === undefined || link.deletedAt !== null) {
      return notFound(attachmentId);
    }
    const blob = await this.database.attachmentBlobs.get(link.blobId);
    if (blob === undefined) {
      return notFound(attachmentId);
    }
    return { link, blob };
  }
}
