// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownShortcuts } from "../src/extensions/markdown-shortcuts.js";

const editors: Editor[] = [];
type TextInputHandler = (
  view: Editor["view"],
  from: number,
  to: number,
  text: string,
) => boolean;

function createTestEditor(content = "<p></p>"): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      MarkdownShortcuts,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function typeText(editor: Editor, input: string): void {
  editor.commands.focus("end");
  for (const character of input) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      (handler as TextInputHandler)(editor.view, from, to, character),
    );
    if (!handled) {
      editor.commands.insertContent(character);
    }
  }
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("MarkdownShortcuts", () => {
  it.each([
    ["## 标题", 2, "标题"],
    ["##　标题", 2, "标题"],
  ])("converts %s into heading level %i", (input, level, text) => {
    const editor = createTestEditor();

    typeText(editor, input);

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text }],
    });
  });

  it("does not convert heading syntax inside a code block", () => {
    const editor = createTestEditor("<pre><code>##</code></pre>");

    typeText(editor, " 标题");

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "codeBlock",
      content: [{ type: "text", text: "## 标题" }],
    });
  });
});
