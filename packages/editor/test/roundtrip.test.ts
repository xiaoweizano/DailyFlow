import { describe, expect, it } from "vitest";

import {
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  normalizeDocument,
  type EditorDocument,
  type TiptapJsonNode,
} from "../src/index.js";

const fullDocument: EditorDocument = {
  schemaVersion: 1,
  doc: {
    type: "doc",
    attrs: {
      importedFrom: "legacy-txt",
      extensionField: {
        nested: ["kept", true],
      },
    },
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "中文标题 🚀" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "普通 " },
          {
            type: "text",
            text: "粗体",
            marks: [{ type: "bold" }],
          },
          { type: "text", text: "、" },
          {
            type: "text",
            text: "斜体",
            marks: [{ type: "italic" }],
          },
          { type: "text", text: "、" },
          {
            type: "text",
            text: "删除",
            marks: [{ type: "strike" }],
          },
          { type: "text", text: "、" },
          {
            type: "text",
            text: "const value = 1",
            marks: [{ type: "code" }],
          },
          { type: "text", text: " 与 " },
          {
            type: "text",
            text: "安全链接",
            marks: [{ type: "link", attrs: { href: "https://example.com/a?q=1" } }],
          },
          { type: "text", text: " / " },
          {
            type: "text",
            text: "危险链接",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "项目一" }],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "第三项" }],
              },
            ],
          },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "已完成任务" }],
              },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "引用内容" }],
          },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [{ type: "text", text: "const answer = 42;\nconsole.log(answer);" }],
      },
      { type: "horizontalRule" },
      {
        type: "paragraph",
        content: [
          {
            type: "attachment",
            attrs: {
              attachmentId: "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
              displayName: "设计图 01.png",
              mimeType: "image/png",
              byteSize: 2048,
              isInline: true,
              altText: "架构设计图",
            },
          },
        ],
      },
      {
        type: "structuredBlock",
        attrs: {
          id: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
          blockType: "issue",
          schemaVersion: 1,
          collapsed: false,
          data: {
            symptom: "启动闪退",
            environment: "Windows 11 / WebView2",
            attempts: ["查看日志", "升级 WebView2"],
            status: "solved",
          },
          forwardCompatibleField: "kept",
        },
      },
      {
        type: "futureCustomBlock",
        attrs: {
          opaque: "保留",
          nested: { unknown: [1, 2, 3] },
        },
        content: [{ type: "text", text: "未来节点正文" }],
      },
    ],
  },
};

describe("editor document projection", () => {
  it("normalizes a fixed document without dropping unknown fields", () => {
    const normalized = normalizeDocument(fullDocument);

    expect(normalized).toEqual(fullDocument);
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.doc).not.toBe(fullDocument.doc);
    expect(normalized.doc.content?.[1]?.content?.[9]?.marks?.[0]?.attrs?.href).toBe(
      "https://example.com/a?q=1",
    );
  });

  it("projects the supported document to stable Markdown and back", () => {
    const markdown = jsonToMarkdown(fullDocument.doc);

    expect(markdown).toContain("## 中文标题 🚀");
    expect(markdown).toContain("**粗体**");
    expect(markdown).toContain("*斜体*");
    expect(markdown).toContain("~~删除~~");
    expect(markdown).toContain("`const value = 1`");
    expect(markdown).toContain("[安全链接](https://example.com/a?q=1)");
    expect(markdown).toContain("危险链接");
    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("- 项目一");
    expect(markdown).toContain("3. 第三项");
    expect(markdown).toContain("- [x] 已完成任务");
    expect(markdown).toContain("> 引用内容");
    expect(markdown).toContain("```typescript");
    expect(markdown).toContain("```dailyflow-structured");
    expect(markdown).toContain("```dailyflow-unknown");
    expect(markdown).toContain("dailyflow:attachment/0198e2f4-7e33-7c70-a8b2-18c1520f9c26");

    const reparsed = markdownToJson(markdown);
    expect(jsonToMarkdown(reparsed)).toBe(markdown);
    expect(reparsed.content?.some((node) => node.type === "futureCustomBlock")).toBe(true);
    expect(
      reparsed.content?.some(
        (node) =>
          node.type === "structuredBlock" &&
          node.attrs?.forwardCompatibleField === "kept" &&
          node.attrs.id === "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
      ),
    ).toBe(true);
  });

  it("projects searchable plain text without Markdown decoration", () => {
    const plainText = jsonToPlainText(fullDocument.doc);

    expect(plainText).toContain("中文标题 🚀");
    expect(plainText).toContain("粗体");
    expect(plainText).toContain("const answer = 42;");
    expect(plainText).toContain("启动闪退");
    expect(plainText).toContain("未来节点正文");
    expect(plainText).not.toContain("```");
    expect(plainText).not.toContain("**");
  });

  it("escapes Markdown control characters in plain text nodes", () => {
    const doc: TiptapJsonNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a * b _ c [d] \\ e" }],
        },
      ],
    };

    const markdown = jsonToMarkdown(doc);
    expect(markdown).toBe("a \\* b \\_ c \\[d\\] \\\\ e\n");
    expect(jsonToPlainText(markdownToJson(markdown))).toBe("a * b _ c [d] \\ e\n");
  });
});
