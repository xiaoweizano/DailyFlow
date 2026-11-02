import {
  PortError,
  type AttachmentStore,
  type PutAttachmentInput,
  type StoredAttachment,
} from "@dailyflow/application";
import { parseUtcTimestamp, type Clock, type EntityId } from "@dailyflow/domain";

import type { TauriCommandClient } from "./tauri-client.js";
import type { AttachmentOwnerTypeDto, StoredAttachmentDto } from "./tauri-contracts.js";

export interface DesktopAttachmentStoreOptions {
  readonly client: TauriCommandClient;
  readonly clock: Clock;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new PortError("VALIDATION_ERROR", {
      message: "Desktop storage returned invalid attachment bytes",
    });
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toStoredAttachment(dto: StoredAttachmentDto): StoredAttachment {
  return {
    attachment: {
      id: dto.attachment.id,
      blobId: dto.attachment.blobId,
      ownerType: dto.attachment.ownerType,
      ownerId: dto.attachment.ownerId,
      displayName: dto.attachment.displayName,
      altText: dto.attachment.altText,
      isInline: dto.attachment.isInline,
      sortOrder: dto.attachment.sortOrder,
      mimeType: dto.attachment.mimeType,
      byteSize: dto.attachment.byteSize,
      storageKind: dto.attachment.storageKind,
      storageKey: dto.attachment.storageKey,
      sha256: dto.attachment.sha256,
      createdAt: dto.attachment.createdAt,
      deletedAt: dto.attachment.deletedAt,
    },
    contentHash: dto.contentHash,
    byteSize: dto.byteSize,
  };
}

export class DesktopAttachmentStore implements AttachmentStore {
  private readonly client: TauriCommandClient;
  private readonly clock: Clock;

  constructor(options: DesktopAttachmentStoreOptions) {
    this.client = options.client;
    this.clock = options.clock;
  }

  async put(input: PutAttachmentInput): Promise<StoredAttachment> {
    const createdAt = parseUtcTimestamp(this.clock.nowUtc());
    const stored = await this.client.putAttachment({
      ownerType: input.ownerType as AttachmentOwnerTypeDto,
      ownerId: input.ownerId,
      displayName: input.displayName,
      mimeType: input.mimeType,
      bytesBase64: encodeBase64(input.bytes),
      altText: input.altText ?? "",
      isInline: input.isInline ?? false,
      sortOrder: input.sortOrder ?? 0,
      createdAt,
    });
    return toStoredAttachment(stored);
  }

  async getObjectUrl(attachmentId: EntityId): Promise<string> {
    const attachment = await this.client.readAttachment(attachmentId);
    const blob = new Blob([decodeBase64(attachment.bytesBase64).slice().buffer], {
      type: attachment.mimeType,
    });
    try {
      return URL.createObjectURL(blob);
    } catch {
      throw new PortError("STORAGE_UNAVAILABLE", {
        message: "Unable to create an attachment object URL",
        retryable: true,
      });
    }
  }

  async read(attachmentId: EntityId): Promise<Uint8Array> {
    const attachment = await this.client.readAttachment(attachmentId);
    return decodeBase64(attachment.bytesBase64);
  }

  async softDeleteOwnerLinks(
    ownerType: PutAttachmentInput["ownerType"],
    ownerId: EntityId,
  ): Promise<void> {
    await this.client.softDeleteAttachmentOwnerLinks({
      ownerType: ownerType as AttachmentOwnerTypeDto,
      ownerId,
      deletedAt: parseUtcTimestamp(this.clock.nowUtc()),
    });
  }

  async removeOrphan(attachmentId: EntityId): Promise<void> {
    await this.client.removeOrphanAttachment(attachmentId);
  }
}
