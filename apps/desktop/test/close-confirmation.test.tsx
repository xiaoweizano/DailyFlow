// @vitest-environment jsdom

import "../../../packages/features/test/setup-dom.js";

import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
  type UserPreferencesSaveResult,
} from "@dailyflow/application";
import { AppServicesProvider, type AppRuntimeServices } from "@dailyflow/features";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "../../../packages/features/node_modules/@testing-library/react/dist/@testing-library/react.esm.js";
import userEvent from "../../../packages/features/node_modules/@testing-library/user-event/dist/esm/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloseConfirmation, type CloseConfirmationRuntime } from "../src/close-confirmation.js";
import { requestCloseConfirmation } from "../src/close-confirmation-store.js";

afterEach(cleanup);

interface Harness {
  readonly flushAll: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  readonly save: ReturnType<typeof vi.fn<(input: unknown) => Promise<UserPreferencesSaveResult>>>;
  readonly runtime: CloseConfirmationRuntime;
}

function createHarness(flushResult = true): Harness {
  let preferences: UserPreferences = DEFAULT_USER_PREFERENCES;
  const flushAll = vi.fn(async () => flushResult);
  const save = vi.fn(async (input: unknown) => {
    preferences = input as UserPreferences;
    return {
      preferences,
      persisted: true,
      warning: null,
    } satisfies UserPreferencesSaveResult;
  });
  const services = {
    settings: {
      load: async () => ({ preferences, warning: null }),
      save,
      applyRuntimePreferences: async () => undefined,
    },
    lifecycle: {
      register: () => () => undefined,
      flushAll,
    },
    ai: {
      providers: [],
      secretBackend: "session-memory",
      prepare: vi.fn(),
      run: vi.fn(),
    },
  } as unknown as AppRuntimeServices;

  return {
    flushAll,
    save,
    runtime: {
      minimize: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
    },
    services,
  } as Harness & { readonly services: AppRuntimeServices };
}

function renderConfirmation(harness: Harness): void {
  const services = (harness as Harness & { readonly services: AppRuntimeServices }).services;
  render(
    <AppServicesProvider services={services}>
      <CloseConfirmation runtime={harness.runtime} />
    </AppServicesProvider>,
  );
}

describe("close confirmation", () => {
  it("shows one dialog, focuses minimize, and ignores duplicate close requests", async () => {
    const harness = createHarness();
    renderConfirmation(harness);

    act(() => {
      requestCloseConfirmation();
      requestCloseConfirmation();
    });

    const dialog = await screen.findByRole("alertdialog", { name: "关闭 DailyFlow" });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "最小化" })).toHaveFocus();
    });

    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(harness.runtime.minimize).not.toHaveBeenCalled();
    expect(harness.runtime.quit).not.toHaveBeenCalled();
  });

  it("minimizes without changing the saved close behavior", async () => {
    const harness = createHarness();
    renderConfirmation(harness);

    act(() => requestCloseConfirmation());
    await userEvent.click(await screen.findByRole("button", { name: "最小化" }));

    expect(harness.flushAll).toHaveBeenCalledOnce();
    expect(harness.runtime.minimize).toHaveBeenCalledOnce();
    expect(harness.save).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("flushes before quitting and stays open when flushing fails", async () => {
    const harness = createHarness(false);
    renderConfirmation(harness);

    act(() => requestCloseConfirmation());
    await userEvent.click(await screen.findByRole("button", { name: "直接退出" }));

    expect(harness.flushAll).toHaveBeenCalledOnce();
    expect(harness.runtime.quit).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "取消" }));
  });

  it("persists a remembered close behavior before minimizing", async () => {
    const harness = createHarness();
    renderConfirmation(harness);

    act(() => requestCloseConfirmation());
    await userEvent.click(await screen.findByRole("checkbox", { name: "记住我的选择" }));
    await userEvent.click(screen.getByRole("button", { name: "最小化" }));

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        closeBehavior: "minimize",
      }),
    );
    expect(harness.runtime.minimize).toHaveBeenCalledOnce();
  });
});
