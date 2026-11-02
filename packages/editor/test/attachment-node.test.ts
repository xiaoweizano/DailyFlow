import { describe, expect, it } from "vitest";

import {
  createEditorSchema,
  jsonToMarkdown,
  markdownToJson,
  type AttachmentAttrs,
} from "../src/index.js";

const attachmentAttrs: AttachmentAttrs = {
  attachmentId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
  displayName: "diagram.png",
  mimeType: "image/png",
  byteSize: 2048,
  isInline: true,
  altText: "架构设计图",
};

describe("attachment node", () => {
  it("stores only attachment identity and presentation metadata", () => {
    const schema = createEditorSchema();
    const attachmentNode = schema.nodes.attachment;
    if (attachmentNode === undefined) {
      throw new Error("Attachment node is missing from the editor schema");
    }
    const node = attachmentNode.create(attachmentAttrs);
    const json = node.toJSON();

    expect(json.attrs).toMatchObject(attachmentAttrs);
    expect(Object.keys(json.attrs ?? {}).sort()).toEqual(
      ["altText", "attachmentId", "byteSize", "displayName", "isInline", "mimeType"].sort(),
    );
    expect(JSON.stringify(json)).not.toMatch(/"(path|src|storageKey|storageUrl)"/u);
  });

  it("round-trips the stable attachment ID through Markdown", () => {
    const document = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "attachment", attrs: attachmentAttrs }],
        },
      ],
    };

    const markdown = jsonToMarkdown(document);
    const reparsed = markdownToJson(markdown);

    expect(markdown).toContain(`dailyflow:attachment/${attachmentAttrs.attachmentId}`);
    expect(reparsed.content?.[0]?.content?.[0]).toMatchObject({
      type: "attachment",
      attrs: {
        attachmentId: attachmentAttrs.attachmentId,
      },
    });
  });
});
