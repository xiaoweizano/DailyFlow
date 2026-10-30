import {
  MemoryJournalRepository,
  MemoryKnowledgeRepository,
  MemorySearchPort,
  MemoryTaskRepository,
} from "../src/index.js";
import {
  MutableClock,
  SequenceIdGenerator,
  describeJournalRepositoryContract,
  describeKnowledgeRepositoryContract,
  describeTaskRepositoryContract,
} from "../src/testing/repository-contract.js";

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
