// @vitest-environment jsdom

import "./setup-dom.js";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttachmentPreview,
  AttachmentUploadPlaceholder,
} from "../src/journal/attachment-node-view.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attachment editor UI", () => {
  it("revokes an inline image object URL when the preview unmounts", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:attachment-preview");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const read = vi.fn(async () => new TextEncoder().encode("image bytes"));
    const view = render(
      <AttachmentPreview
        attachmentId="0198e2f4-7e33-7c70-a8b2-18c1520f9c27"
        displayName="diagram.png"
        mimeType="image/png"
        byteSize={11}
        isInline
        read={read}
      />,
    );

    expect((await screen.findByRole("img", { name: "diagram.png" })).getAttribute("src")).toBe(
      "blob:attachment-preview",
    );
    view.unmount();

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:attachment-preview");
  });

  it("keeps a failed upload as a retryable placeholder without an attachment link", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <AttachmentUploadPlaceholder
        fileName="guide.pdf"
        errorMessage="网络存储不可用"
        onRetry={onRetry}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("guide.pdf")).toBeTruthy();
    expect(screen.queryByText(/dailyflow:attachment/u)).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试上传 guide.pdf" }));

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });
});
