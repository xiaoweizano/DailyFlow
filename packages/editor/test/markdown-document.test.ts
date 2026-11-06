import { describe, expect, it } from "vitest";

import {
  createEditorSchema,
  editorDocumentToMarkdown,
  markdownToEditorDocument,
  type TiptapJsonNode,
} from "../src/index.js";

const technicalMarkdown = [
  "| 名称 | 状态 |",
  "| --- | --- |",
  "| 登录 | 完成 |",
  "",
  "```typescript",
  "const value = 1;",
  "```",
  "",
  "$$",
  "a^2 + b^2 = c^2",
  "$$",
  "",
  "```mermaid",
  "graph TD; A-->B;",
  "```",
  "",
].join("\n");

function findNode(document: TiptapJsonNode, type: string): TiptapJsonNode | undefined {
  if (document.type === type) {
    return document;
  }
  for (const child of document.content ?? []) {
    const match = findNode(child, type);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

describe("Markdown documents", () => {
  it("round-trips tables, code, math, and Mermaid blocks", () => {
    const document = markdownToEditorDocument(technicalMarkdown);

    expect(document.doc.content?.map((node) => node.type)).toEqual([
      "table",
      "codeBlock",
      "blockMath",
      "mermaidBlock",
    ]);
    expect(findNode(document.doc, "codeBlock")?.attrs?.language).toBe("typescript");
    expect(findNode(document.doc, "blockMath")?.attrs?.latex).toBe("a^2 + b^2 = c^2");
    expect(findNode(document.doc, "mermaidBlock")?.attrs?.code).toBe("graph TD; A-->B;");

    const roundTrip = editorDocumentToMarkdown(document);
    expect(roundTrip).toContain("| 名称 | 状态 |");
    expect(roundTrip).toContain("```typescript\nconst value = 1;\n```");
    expect(roundTrip).toContain("$$\na^2 + b^2 = c^2\n$$");
    expect(roundTrip).toContain("```mermaid\ngraph TD; A-->B;\n```");
    expect(markdownToEditorDocument(roundTrip)).toEqual(document);
  });

  it("round-trips inline math without treating dollars as plain text", () => {
    const document = markdownToEditorDocument("质能方程 $E=mc^2$ 很简洁。");

    const paragraph = document.doc.content?.[0];
    expect(paragraph?.type).toBe("paragraph");
    expect(paragraph?.content?.map((node) => node.type)).toEqual(["text", "inlineMath", "text"]);
    expect(paragraph?.content?.[1]?.attrs?.latex).toBe("E=mc^2");
    expect(editorDocumentToMarkdown(document)).toBe("质能方程 $E=mc^2$ 很简洁。\n");
  });

  it("produces a schema-backed document for the journal editor", () => {
    const document = markdownToEditorDocument(technicalMarkdown);
    const parsed = createEditorSchema().nodeFromJSON(document.doc);

    expect(parsed.toJSON()).toEqual(document.doc);
  });
});
