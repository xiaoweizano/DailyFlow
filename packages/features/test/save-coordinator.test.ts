import { err, ok } from "@dailyflow/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SaveCoordinator } from "../src/journal/save-coordinator.js";

interface Draft {
  readonly text: string;
}

interface Saved {
  readonly revision: number;
}

const conflictError = {
  code: "CONFLICT",
  entity: "journal",
  expectedRevision: 2,
  actualRevision: 3,
} as const;

const storageError = {
  code: "STORAGE_UNAVAILABLE",
  retryable: true,
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("SaveCoordinator", () => {
  it("debounces updates for 800ms before saving", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ok<Saved>({ revision: 1 }));
    const coordinator = new SaveCoordinator<Draft, Saved>({ save });

    coordinator.update({ text: "first" });
    coordinator.update({ text: "latest" });

    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ text: "latest" });
    expect(coordinator.getState().status).toBe("saved");
    expect(coordinator.getState().draft).toBeNull();
  });

  it("keeps a single in-flight save and preserves edits made while saving", async () => {
    vi.useFakeTimers();
    let resolveFirstSave: ((result: Awaited<ReturnType<typeof ok<Saved>>>) => void) | undefined;
    const save = vi
      .fn<(draft: Draft) => Promise<Awaited<ReturnType<typeof ok<Saved>>>>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(ok({ revision: 2 }));
    const coordinator = new SaveCoordinator<Draft, Saved>({ save });

    coordinator.update({ text: "version one" });
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().status).toBe("saving");

    coordinator.update({ text: "version two" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().draft).toEqual({ text: "version two" });
    expect(coordinator.getState().status).toBe("saving");

    resolveFirstSave?.(ok({ revision: 1 }));
    await Promise.resolve();
    expect(coordinator.getState().status).toBe("dirty");

    await vi.advanceTimersByTimeAsync(799);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ text: "version two" });
    expect(coordinator.getState().status).toBe("saved");
    expect(coordinator.getState().draft).toBeNull();
  });

  it("keeps the draft and exposes a conflict without overwriting newer content", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => err(conflictError));
    const coordinator = new SaveCoordinator<Draft, Saved>({ save });

    coordinator.update({ text: "local draft" });
    await vi.advanceTimersByTimeAsync(800);

    expect(coordinator.getState()).toMatchObject({
      status: "conflict",
      draft: { text: "local draft" },
      error: conflictError,
    });
  });

  it("keeps the draft when persistence fails", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => err(storageError));
    const coordinator = new SaveCoordinator<Draft, Saved>({ save });

    coordinator.update({ text: "unsaved body" });
    await vi.advanceTimersByTimeAsync(800);

    expect(coordinator.getState()).toMatchObject({
      status: "error",
      draft: { text: "unsaved body" },
      error: storageError,
    });
  });
});
