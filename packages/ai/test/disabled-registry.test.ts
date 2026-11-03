import { describe, expect, it, vi } from "vitest";

import { DisabledAiRegistry } from "../src/index.js";

describe("DisabledAiRegistry", () => {
  it("advertises one unconfigured provider without enabling any capability", () => {
    const registry = new DisabledAiRegistry();

    expect(registry.list()).toEqual([
      {
        id: "disabled",
        displayName: "未配置",
        capabilities: [],
        sendsDataOffDevice: false,
      },
    ]);
  });

  it("cannot resolve a runnable provider or issue a network request", () => {
    const fetchReplacement = vi.fn();
    const registry = new DisabledAiRegistry();

    expect(registry.resolve("disabled")).toBeNull();
    expect(registry.resolve("any-other-provider")).toBeNull();
    expect(fetchReplacement).not.toHaveBeenCalled();
  });

  it("returns a stable immutable descriptor list", () => {
    const registry = new DisabledAiRegistry();

    expect(registry.list()).toBe(registry.list());
    expect(Object.isFrozen(registry.list())).toBe(true);
  });
});
