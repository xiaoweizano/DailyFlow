import { Node } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Mathematics from "@tiptap/extension-mathematics";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-code") ?? "",
        renderHTML: (attributes) => ({ "data-code": attributes.code }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "mermaid-block",
        class: "dailyflow-mermaid-block",
        ...HTMLAttributes,
      },
    ];
  },
});

export const EditorRichContent = [
  CodeBlockLowlight.configure({ lowlight }),
  Mathematics.configure({
    katexOptions: {
      throwOnError: false,
    },
  }),
  MermaidBlock,
];

let mermaidRenderSequence = 0;

export async function renderMermaidToSvg(code: string, theme: "default" | "dark"): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  mermaidRenderSequence += 1;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    htmlLabels: false,
    theme,
  });

  const result = await mermaid.render(`dailyflow-mermaid-${mermaidRenderSequence}`, code);
  return result.svg;
}
