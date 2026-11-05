import { createEditorSchema } from "../schema/create-editor-schema.js";
import type { TiptapJsonNode } from "../schema/editor-types.js";

export interface DocumentOutlineItem {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly position: number;
}

export function buildDocumentOutline(document: TiptapJsonNode): readonly DocumentOutlineItem[] {
  const node = createEditorSchema().nodeFromJSON(document);
  const items: DocumentOutlineItem[] = [];

  node.descendants((child, position) => {
    if (child.type.name !== "heading") {
      return true;
    }

    const text = child.textContent.trim();
    const level = child.attrs.level;
    if (text.length === 0 || (level !== 1 && level !== 2 && level !== 3)) {
      return true;
    }

    items.push({ level, text, position });
    return true;
  });

  return items;
}
