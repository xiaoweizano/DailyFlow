import { parseEntityId, parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopAttachmentStore } from "../src/desktop/desktop-attachment-store.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const OWNER_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const ATTACHMENT_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c27");
const CREATED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const attachmentDto = {
  id: ATTACHMENT_ID,
  blobId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c28",
  ownerType: "journal",
  ownerId: OWNER_ID,
  displayName: "guide.pdf",
  altText: "",
  isInline: false,
  sortOrder: 0,
  mimeType: "application/pdf",
  byteSize: 5,
  storageKind: "desktop-file",
  storageKey:
    "attachments/2c/f2/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824.bin",
  sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  createdAt: CREATED_AT,
  deletedAt: null,
} as const;

function createStore(invoke: TauriInvoke): DesktopAttachmentStore {
  return new DesktopAttachmentStore({
    client: new TauriCommandClient(invoke),
    clock: { nowUtc: () => CREATED_AT },
  });
}

describe("DesktopAttachmentStore", () => {
  it("serializes attachment bytes over Tauri IPC as Base64", async () => {
    const invoke = vi.fn<TauriInvoke>().mockResolvedValue({
      attachment: attachmentDto,
      contentHash: attachmentDto.sha256,
      byteSize: attachmentDto.byteSize,
    });
    const store = createStore(invoke);

    const stored = await store.put({
      ownerType: "journal",
      ownerId: OWNER_ID,
      displayName: "guide.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("hello"),
    });

    expect(invoke).toHaveBeenCalledWith("attachment_put", {
      input: {
        ownerType: "journal",
        ownerId: OWNER_ID,
        displayName: "guide.pdf",
        mimeType: "application/pdf",
        bytesBase64: "aGVsbG8=",
        altText: "",
        isInline: false,
        sortOrder: 0,
        createdAt: CREATED_AT,
      },
    });
    expect(stored.attachment.id).toBe(ATTACHMENT_ID);
  });

  it("decodes Base64 bytes and sends the clock timestamp when deleting owner links", async () => {
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce({ mimeType: "application/pdf", bytesBase64: "aGVsbG8=" })
      .mockResolvedValueOnce(undefined);
    const store = createStore(invoke);

    await expect(store.read(ATTACHMENT_ID)).resolves.toEqual(new TextEncoder().encode("hello"));
    await store.softDeleteOwnerLinks("journal", OWNER_ID);

    expect(invoke).toHaveBeenNthCalledWith(1, "attachment_read", {
      attachmentId: ATTACHMENT_ID,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "attachment_soft_delete_owner_links", {
      ownerType: "journal",
      ownerId: OWNER_ID,
      deletedAt: CREATED_AT,
    });
  });
});
