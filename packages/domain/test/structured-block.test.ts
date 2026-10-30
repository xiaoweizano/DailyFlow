import { describe, expect, it } from "vitest";

import {
  createStructuredBlock,
  updateStructuredBlock,
  type Clock,
  type IdGenerator,
} from "../src/index.js";

const ids: IdGenerator = {
  nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c26",
};

let now = "2026-10-30T03:20:11.123Z";
const clock: Clock = {
  nowUtc: () => now,
};

describe("StructuredBlock", () => {
  it("keeps the same block ID when its content and order change", () => {
    const block = createStructuredBlock(
      {
        journalId: "0198e2f4-7e34-7c70-a8b2-18c1520f9c26",
        blockType: "issue",
        schemaVersion: 1,
        data: { symptom: "启动闪退" },
        orderKey: "001",
      },
      { ids, clock },
    );

    now = "2026-10-30T03:25:00.000Z";
    const updated = updateStructuredBlock(
      block,
      {
        blockType: "solution",
        schemaVersion: 1,
        data: { symptom: "启动闪退", solution: "升级 WebView2" },
        orderKey: "002",
        renderedText: "升级 WebView2",
      },
      clock,
    );

    expect(updated.id).toBe(block.id);
    expect(updated.blockType).toBe("solution");
    expect(updated.updatedAt).toBe("2026-10-30T03:25:00.000Z");
  });
});
