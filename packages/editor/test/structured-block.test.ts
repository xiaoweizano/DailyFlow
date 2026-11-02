import { describe, expect, it } from "vitest";

import { createEditorSchema, extractStructuredBlocks, type TiptapJsonNode } from "../src/index.js";

const document: TiptapJsonNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "前文" }],
    },
    {
      type: "structuredBlock",
      attrs: {
        id: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
        blockType: "issue",
        schemaVersion: 1,
        data: {
          symptom: "启动闪退",
          attempts: ["检查日志", "升级 WebView2"],
          resolved: true,
        },
        forwardCompatibleField: "kept",
      },
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "中间" }],
    },
    {
      type: "structuredBlock",
      attrs: {
        id: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
        blockType: "decision",
        schemaVersion: 2,
        data: {
          title: "采用 Tauri",
          reason: "复用 React 前端",
        },
      },
    },
  ],
};

describe("structured block editor integration", () => {
  it("creates a schema with all V1 editor nodes and marks", () => {
    const schema = createEditorSchema();

    expect(Object.keys(schema.nodes)).toEqual(
      expect.arrayContaining([
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "blockquote",
        "codeBlock",
        "horizontalRule",
        "hardBreak",
        "attachment",
        "structuredBlock",
      ]),
    );
    expect(Object.keys(schema.marks)).toEqual(
      expect.arrayContaining(["bold", "italic", "strike", "code", "link"]),
    );
    expect(schema.nodes.attachment?.spec.attrs).not.toHaveProperty("path");
    expect(schema.nodes.attachment?.spec.attrs).not.toHaveProperty("src");
  });

  it("extracts query projections in canonical document order", () => {
    const blocks = extractStructuredBlocks(document);

    expect(blocks).toEqual([
      {
        id: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
        blockType: "issue",
        schemaVersion: 1,
        data: {
          symptom: "启动闪退",
          attempts: ["检查日志", "升级 WebView2"],
          resolved: true,
        },
        orderKey: "000000000001",
        renderedText: "启动闪退\n检查日志\n升级 WebView2\ntrue",
      },
      {
        id: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
        blockType: "decision",
        schemaVersion: 2,
        data: {
          title: "采用 Tauri",
          reason: "复用 React 前端",
        },
        orderKey: "000000000002",
        renderedText: "采用 Tauri\n复用 React 前端",
      },
    ]);
  });

  it("rejects malformed structured blocks instead of silently dropping data", () => {
    expect(() =>
      extractStructuredBlocks({
        type: "doc",
        content: [
          {
            type: "structuredBlock",
            attrs: {
              id: "not-a-uuid",
              blockType: "issue",
              schemaVersion: 1,
              data: {},
            },
          },
        ],
      }),
    ).toThrow(/structured block id/i);
  });
});
