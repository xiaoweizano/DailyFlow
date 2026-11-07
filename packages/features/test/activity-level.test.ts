import { describe, expect, it } from "vitest";

import { activityLevelClass, levelForCount } from "../src/timeline/activity-level.js";

describe("activity heatmap levels", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 4],
    [11, 4],
    [12, 5],
    [40, 5],
  ])("maps %i journals to level %i", (count, level) => {
    expect(levelForCount(count)).toBe(level);
  });

  it("uses a semantic green class for each non-empty level", () => {
    expect(activityLevelClass(12)).toBe("df-activity-green-5");
  });
});
