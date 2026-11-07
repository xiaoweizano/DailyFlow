// @vitest-environment jsdom

import "./setup-dom.js";

import { EditorContent, useEditor } from "@tiptap/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createJournalEditorExtensions } from "../src/journal/journal-editor-extensions.js";
import { JournalImportExport } from "../src/journal/journal-import-export.js";

function EditorHarness(): React.JSX.Element {
  const editor = useEditor({
    extensions: createJournalEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "现有正文" }] }],
    },
    immediatelyRender: false,
  });

  if (editor === null) {
    return <p>正在初始化编辑器</p>;
  }

  return (
    <div>
      <EditorContent editor={editor} />
      <JournalImportExport editor={editor} />
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Journal Markdown import and export", () => {
  it("imports a Markdown file and exports the current editor as a local file", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const source = new File(
      [
        [
          "# 导入标题",
          "",
          "```typescript",
          "const imported = true;",
          "```",
          "",
          "$$",
          "x^2",
          "$$",
          "",
          "```mermaid",
          "graph LR; A-->B;",
          "```",
        ].join("\n"),
      ],
      "journal.md",
      { type: "text/markdown" },
    );

    await user.upload(await screen.findByLabelText("导入 Markdown 文件"), source);

    expect(await screen.findByRole("heading", { name: "导入标题" })).toBeInTheDocument();
    expect(document.querySelector("[data-type='mermaid-block']")).not.toBeNull();

    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((value) => {
      exported = value as Blob;
      return "blob:dailyflow-markdown";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await user.click(screen.getByRole("button", { name: "导出 Markdown" }));

    expect(exported).toBeDefined();
    await waitFor(async () => {
      expect(await exported?.text()).toContain("```mermaid\ngraph LR; A-->B;\n```");
    });
    expect(exported?.type).toBe("text/markdown;charset=utf-8");
  }, 15_000);
});
