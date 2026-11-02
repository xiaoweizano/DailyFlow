import type { AttachmentRef, ContentHash, EntityId } from "@dailyflow/domain";

export interface PutAttachmentInput {
  readonly ownerType: AttachmentRef["ownerType"];
  readonly ownerId: EntityId;
  readonly displayName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly altText?: string;
  readonly isInline?: boolean;
  readonly sortOrder?: number;
}

export interface StoredAttachment {
  readonly attachment: AttachmentRef;
  readonly contentHash: ContentHash;
  readonly byteSize: number;
}

export interface AttachmentStore {
  put(input: PutAttachmentInput): Promise<StoredAttachment>;
  getObjectUrl(attachmentId: EntityId): Promise<string>;
  read(attachmentId: EntityId): Promise<Uint8Array>;
  softDeleteOwnerLinks(ownerType: AttachmentRef["ownerType"], ownerId: EntityId): Promise<void>;
  removeOrphan(attachmentId: EntityId): Promise<void>;
}
