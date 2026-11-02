import {
  MemoryJournalRepository,
  MemoryKnowledgeRepository,
  MemorySearchPort,
  MemoryTaskRepository,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

import {
  MutableClock,
  SequenceIdGenerator,
  describeJournalRepositoryContract,
  describeJournalRepositoryParityContract,
  describeKnowledgeRepositoryContract,
  describeTaskRepositoryContract,
} from "../src/testing/repository-contract.js";
import {
  JournalChangeSourceSchema,
  JournalSaveCheckpointSchema,
  SearchEntityTypeSchema,
  StorageErrorDtoSchema,
} from "../src/desktop/tauri-contracts.js";
import { parityContractFixture, parityFixture } from "./parity-fixtures.js";

describeJournalRepositoryContract("JournalRepository contract", () => {
  const clock = new MutableClock();
  const search = new MemorySearchPort({ clock });
  return {
    journals: new MemoryJournalRepository({
      ids: new SequenceIdGenerator(),
      clock,
      search,
    }),
    search,
    clock,
  };
});

describeJournalRepositoryParityContract(
  "JournalRepository shared fixture contract",
  () => {
    const clock = new MutableClock();
    const search = new MemorySearchPort({ clock });
    return {
      journals: new MemoryJournalRepository({
        ids: new SequenceIdGenerator(),
        clock,
        search,
      }),
      search,
      clock,
    };
  },
  parityContractFixture,
);

describe("shared repository fixture enums", () => {
  it("matches the TypeScript DTO schemas", () => {
    expect(JournalSaveCheckpointSchema.options).toEqual(parityFixture.enums.checkpoint);
    expect(JournalChangeSourceSchema.options).toEqual(parityFixture.enums.changeSource);
    expect(SearchEntityTypeSchema.options).toEqual(parityFixture.enums.searchEntityType);
    expect(StorageErrorDtoSchema.shape.code.options).toEqual(parityFixture.enums.storageErrorCode);
  });
});

describeKnowledgeRepositoryContract("KnowledgeRepository contract", () => {
  const clock = new MutableClock();
  return {
    knowledge: new MemoryKnowledgeRepository({ clock }),
    clock,
  };
});

describeTaskRepositoryContract("TaskRepository contract", () => {
  const clock = new MutableClock();
  return {
    tasks: new MemoryTaskRepository({ clock }),
    clock,
  };
});
