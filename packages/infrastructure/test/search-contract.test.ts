import { MemorySearchPort } from "../src/index.js";
import { MutableClock, describeSearchPortContract } from "../src/testing/repository-contract.js";

describeSearchPortContract("SearchPort contract", () => {
  const clock = new MutableClock();
  return {
    search: new MemorySearchPort({ clock }),
    clock,
  };
});
