import { isJsonObject } from "@dailyflow/domain";
import { stableStringify } from "@dailyflow/shared";

import type { TiptapJsonNode } from "../schema/editor-types.js";
import { CURRENT_EDITOR_SCHEMA_VERSION } from "../schema/schema-version.js";
import { normalizeDocument } from "./normalize-document.js";

type ContentContext = "block" | "inline";

const KNOWN_NODE_TYPES = new Set([
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
]);

function childContext(node: TiptapJsonNode): ContentContext {
  return node.type === "paragraph" || node.type === "heading" || node.type === "codeBlock"
    ? "inline"
    : "block";
}

function opaqueNode(node: TiptapJsonNode, context: ContentContext): TiptapJsonNode {
  return {
    type: context === "inline" ? "unknownInline" : "unknownBlock",
    attrs: {
      originalNode: stableStringify(node),
    },
  };
}

function prepareNode(node: TiptapJsonNode, context: ContentContext): TiptapJsonNode {
  if (!KNOWN_NODE_TYPES.has(node.type)) {
    return opaqueNode(node, context);
  }

  if (node.content === undefined) {
    return node;
  }

  const contextForChildren = childContext(node);
  return {
    ...node,
    content: node.content.map((child) => prepareNode(child, contextForChildren)),
  };
}

function parseOpaqueNode(node: TiptapJsonNode): TiptapJsonNode | null {
  const payload = node.attrs?.originalNode;
  if (typeof payload !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    return isJsonObject(parsed) && typeof parsed.type === "string"
      ? (parsed as TiptapJsonNode)
      : null;
  } catch {
    return null;
  }
}

function restoreNode(node: TiptapJsonNode): TiptapJsonNode {
  if (node.type === "unknownBlock" || node.type === "unknownInline") {
    return parseOpaqueNode(node) ?? node;
  }

  if (node.content === undefined) {
    return node;
  }

  return {
    ...node,
    content: node.content.map(restoreNode),
  };
}

export function editorContentFromDocument(document: TiptapJsonNode): TiptapJsonNode {
  const normalized = normalizeDocument({
    schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
    doc: document,
  }).doc;
  return prepareNode(normalized, "block");
}

export function documentFromEditorContent(document: TiptapJsonNode): TiptapJsonNode {
  return normalizeDocument({
    schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
    doc: restoreNode(document),
  }).doc;
}
