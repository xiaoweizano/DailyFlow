import type { JsonObject, JsonValue } from "@dailyflow/domain";

import type { TiptapJsonNode } from "../schema/editor-types.js";

function renderStructuredData(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value
      .map(renderStructuredData)
      .filter((part) => part.length > 0)
      .join("\n");
  }
  return Object.values(value)
    .map(renderStructuredData)
    .filter((part) => part.length > 0)
    .join("\n");
}

function renderInline(nodes: readonly TiptapJsonNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.text ?? "";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      if (node.type === "attachment") {
        const attrs = node.attrs ?? {};
        return typeof attrs.altText === "string"
          ? attrs.altText
          : typeof attrs.displayName === "string"
            ? attrs.displayName
            : "";
      }
      return renderInline(node.content);
    })
    .join("");
}

function renderBlock(node: TiptapJsonNode): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return renderInline(node.content);
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? []).map(renderBlock).join("\n");
    case "listItem":
    case "taskItem":
    case "blockquote":
      return (node.content ?? []).map(renderBlock).join("\n");
    case "codeBlock":
      return (node.content ?? []).map((child) => child.text ?? "").join("");
    case "horizontalRule":
      return "";
    case "structuredBlock":
      return typeof node.attrs?.data === "object" && node.attrs.data !== null
        ? renderStructuredData(node.attrs.data as JsonObject)
        : "";
    case "attachment":
      return renderInline([node]);
    default:
      return node.text ?? (node.content ?? []).map(renderBlock).join("");
  }
}

export function jsonToPlainText(doc: TiptapJsonNode): string {
  const blocks = (doc.content ?? []).map(renderBlock).filter((block) => block.length > 0);
  return blocks.length === 0 ? "" : `${blocks.join("\n")}\n`;
}

export function structuredDataToPlainText(data: JsonObject): string {
  return renderStructuredData(data);
}
