import type { Clock, DomainDependencies } from "../shared/ports.js";
import { isJsonObject, parsePositiveInteger, type JsonObject } from "../shared/content.js";
import { DomainRuleError } from "../shared/errors.js";
import {
  nextEntityId,
  nowUtc,
  parseEntityId,
  requireNonEmptyString,
  type EntityId,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export const STRUCTURED_BLOCK_TYPES = ["issue", "solution", "decision", "note", "todo"] as const;
export type StructuredBlockType = (typeof STRUCTURED_BLOCK_TYPES)[number];

export interface StructuredBlock {
  readonly id: EntityId;
  readonly journalId: EntityId;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly orderKey: string;
  readonly renderedText: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly deletedAt: UtcTimestamp | null;
}

export interface CreateStructuredBlockInput {
  readonly journalId: string;
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly orderKey: string;
  readonly renderedText?: string;
}

export interface UpdateStructuredBlockInput {
  readonly blockType: StructuredBlockType;
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly orderKey: string;
  readonly renderedText: string;
}

function validateBlockFields(input: UpdateStructuredBlockInput): void {
  if (!STRUCTURED_BLOCK_TYPES.includes(input.blockType)) {
    throw new DomainRuleError("blockType", `Unsupported structured block type: ${input.blockType}`);
  }
  parsePositiveInteger(input.schemaVersion, "schemaVersion");
  if (!isJsonObject(input.data)) {
    throw new DomainRuleError("data", "StructuredBlock data must be a JSON object");
  }
  requireNonEmptyString(input.orderKey, "orderKey");
}

export function createStructuredBlock(
  input: CreateStructuredBlockInput,
  dependencies: DomainDependencies,
): StructuredBlock {
  const fields: UpdateStructuredBlockInput = {
    blockType: input.blockType,
    schemaVersion: input.schemaVersion,
    data: input.data,
    orderKey: input.orderKey,
    renderedText: input.renderedText ?? "",
  };
  validateBlockFields(fields);
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    journalId: parseEntityId(input.journalId),
    ...fields,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

export function updateStructuredBlock(
  block: StructuredBlock,
  input: UpdateStructuredBlockInput,
  clock: Clock,
): StructuredBlock {
  validateBlockFields(input);

  return {
    ...block,
    ...input,
    updatedAt: nowUtc(clock),
  };
}
