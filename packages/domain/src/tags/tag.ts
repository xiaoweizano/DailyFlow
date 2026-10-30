import type { DomainDependencies } from "../shared/ports.js";
import {
  createTagName,
  nextEntityId,
  nowUtc,
  type EntityId,
  type TagName,
  type UtcTimestamp,
} from "../shared/value-objects.js";

export interface Tag {
  readonly id: EntityId;
  readonly name: TagName;
  readonly color: string | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface CreateTagInput {
  readonly name: string;
  readonly color?: string | null;
}

export function createTag(input: CreateTagInput, dependencies: DomainDependencies): Tag {
  const createdAt = nowUtc(dependencies.clock);

  return {
    id: nextEntityId(dependencies.ids),
    name: createTagName(input.name),
    color: input.color ?? null,
    createdAt,
    updatedAt: createdAt,
  };
}
