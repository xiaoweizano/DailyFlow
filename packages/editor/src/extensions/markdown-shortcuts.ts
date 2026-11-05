import { Extension, textblockTypeInputRule } from "@tiptap/core";

export const MarkdownShortcuts = Extension.create({
  name: "dailyflowMarkdownShortcuts",
  priority: 1_000,

  addInputRules() {
    const heading = this.editor.schema.nodes.heading;
    if (heading === undefined) {
      throw new Error("MarkdownShortcuts requires a heading node");
    }

    return [1, 2, 3].map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{${level}})[\\s\\u3000]+$`, "u"),
        type: heading,
        getAttributes: () => ({ level }),
      }),
    );
  },
});
