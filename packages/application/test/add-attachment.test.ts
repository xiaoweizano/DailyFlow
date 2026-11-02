import {
  parseEntityId,
  parseUtcTimestamp,
  type AttachmentRef,
  type ContentHash,
  type EntityId,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import type {
  AttachmentStore,
  PutAttachmentInput,
  StoredAttachment,
} from "../src/ports/attachment-store.js";
import {
  DEFAULT_ATTACHMENT_POLICY,
  addAttachment,
  type AddAttachmentDependencies,
} from "../src/use-cases/add-attachment.js";

const OWNER_ID = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26" as EntityId;

class FakeAttachmentStore implements AttachmentStore {
  readonly puts: PutAttachmentInput[] = [];
  result: StoredAttachment | null = null;

  async put(input: PutAttachmentInput): Promise<StoredAttachment> {
    this.puts.push(input);
    if (this.result === null) {
      throw new Error("Missing fake attachment result");
    }
    return this.result;
  }

  async getObjectUrl(): Promise<string> {
    return "blob:fake";
  }

  async read(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async removeOrphan(): Promise<void> {}

  async softDeleteOwnerLinks(): Promise<void> {}
}

function createDependencies(): {
  readonly attachments: FakeAttachmentStore;
  readonly dependencies: AddAttachmentDependencies;
} {
  const attachments = new FakeAttachmentStore();
  const attachment = {
    id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c27"),
    blobId: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c28"),
    ownerType: "journal",
    ownerId: OWNER_ID,
    displayName: "diagram.png",
    altText: "",
    isInline: true,
    sortOrder: 0,
    mimeType: "image/png",
    byteSize: 3,
    storageKind: "web-blob",
    storageKey: "0198e2f4-7e33-7c70-a8b2-18c1520f9c28",
    sha256: "a".repeat(64) as ContentHash,
    createdAt: parseUtcTimestamp("2026-10-30T03:20:11.123Z"),
    deletedAt: null,
  } satisfies AttachmentRef;
  attachments.result = {
    attachment,
    contentHash: attachment.sha256,
    byteSize: attachment.byteSize,
  };

  return {
    attachments,
    dependencies: {
      attachments,
      policy: DEFAULT_ATTACHMENT_POLICY,
    },
  };
}

describe("addAttachment", () => {
  it("delegates an allowed inline image to the attachment store", async () => {
    const { attachments, dependencies } = createDependencies();

    const result = await addAttachment(dependencies, {
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "diagram.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
      isInline: true,
    });

    expect(result.ok).toBe(true);
    expect(attachments.puts).toHaveLength(1);
    expect(attachments.puts[0]).toMatchObject({
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "diagram.png",
      mimeType: "image/png",
      isInline: true,
    });
  });

  it("rejects MIME types outside the explicit allowlist", async () => {
    const { attachments, dependencies } = createDependencies();

    const result = await addAttachment(dependencies, {
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "clipboard.html",
      mimeType: "text/html",
      bytes: new Uint8Array([1]),
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: {
          mimeType: expect.any(String),
        },
      }),
    });
    expect(attachments.puts).toHaveLength(0);
  });

  it("rejects files larger than the configured single-file limit", async () => {
    const { attachments, dependencies } = createDependencies();
    dependencies.policy.maxBytes = 2;

    const result = await addAttachment(dependencies, {
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "large.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: {
          bytes: expect.any(String),
        },
      }),
    });
    expect(attachments.puts).toHaveLength(0);
  });

  it("maps storage failures to a retryable application error", async () => {
    const { attachments, dependencies } = createDependencies();
    vi.spyOn(attachments, "put").mockRejectedValue(new Error("disk unavailable"));

    const result = await addAttachment(dependencies, {
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "notes.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array([1]),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_UNAVAILABLE",
        retryable: true,
      },
    });
  });
});
