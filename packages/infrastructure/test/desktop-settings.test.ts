import { describe, expect, it, vi } from "vitest";

import { DesktopSettingsStore } from "../src/desktop/desktop-settings-store.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

function createStore(result: unknown) {
  const invoke = vi.fn<TauriInvoke>().mockResolvedValue(result);
  return {
    invoke,
    store: new DesktopSettingsStore({
      client: new TauriCommandClient(invoke),
    }),
  };
}

describe("DesktopSettingsStore", () => {
  it("reads JSON text through the Tauri settings command", async () => {
    const valueJson = JSON.stringify({ theme: "light" });
    const { invoke, store } = createStore({ valueJson });

    await expect(store.read("user-preferences")).resolves.toBe(valueJson);
    expect(invoke).toHaveBeenCalledWith("settings_read", {
      key: "user-preferences",
    });
  });

  it("writes JSON text through the Tauri settings command", async () => {
    const { invoke, store } = createStore(null);
    const valueJson = JSON.stringify({ density: "compact" });

    await store.write("user-preferences", valueJson);

    expect(invoke).toHaveBeenCalledWith("settings_write", {
      key: "user-preferences",
      valueJson,
    });
  });
});
