import {
  isJsonObject,
  parseEntityId,
  STRUCTURED_BLOCK_TYPES,
  type EntityId,
  type JsonObject,
  type JsonValue,
  type StructuredBlockType,
} from "@dailyflow/domain";

import type { TiptapJsonNode } from "../schema/editor-types.js";

export interface EditorStructuredBlockProjection {
  readonly id: EntityId;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly orderKey: string;
  readonly renderedText: string;
}

function renderStructuredValue(value: JsonValue): string {
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
      .map(renderStructuredValue)
      .filter((part) => part.length > 0)
      .join("\n");
  }
  return Object.values(value)
    .map(renderStructuredValue)
    .filter((part) => part.length > 0)
    .join("\n");
}

function requireStructuredBlock(node: TiptapJsonNode): {
  id: EntityId;
  blockType: StructuredBlockType;
  schemaVersion: number;
  data: JsonObject;
} {
  const attrs = node.attrs;
  if (attrs === undefined || typeof attrs.id !== "string") {
    throw new TypeError("structured block id is required");
  }

  let id: EntityId;
  try {
    id = parseEntityId(attrs.id);
  } catch {
    throw new TypeError(`structured block id must be a canonical lowercase UUIDv7: ${attrs.id}`);
  }

  if (
    typeof attrs.blockType !== "string" ||
    !STRUCTURED_BLOCK_TYPES.includes(attrs.blockType as StructuredBlockType)
  ) {
    throw new TypeError(`structured block type is unsupported: ${String(attrs.blockType)}`);
  }
  if (
    typeof attrs.schemaVersion !== "number" ||
    !Number.isSafeInteger(attrs.schemaVersion) ||
    attrs.schemaVersion < 1
  ) {
    throw new TypeError("structured block schemaVersion must be a positive integer");
  }
  if (!isJsonObject(attrs.data)) {
    throw new TypeError("structured block data must be a JSON object");
  }

  return {
    id,
    blockType: attrs.blockType as StructuredBlockType,
    schemaVersion: attrs.schemaVersion,
    data: attrs.data,
  };
}

export function extractStructuredBlocks(
  doc: TiptapJsonNode,
): readonly EditorStructuredBlockProjection[] {
  const blocks: EditorStructuredBlockProjection[] = [];
  let sequence = 0;

  const visit = (node: TiptapJsonNode): void => {
    if (node.type === "structuredBlock") {
      const block = requireStructuredBlock(node);
      sequence += 1;
      blocks.push({
        ...block,
        orderKey: String(sequence).padStart(12, "0"),
        renderedText: renderStructuredValue(block.data),
      });
    }
    for (const child of node.content ?? []) {
      visit(child);
    }
  };

  visit(doc);
  return blocks;
}
