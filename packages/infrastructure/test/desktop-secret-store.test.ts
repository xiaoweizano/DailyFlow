import { describe, expect, it, vi } from "vitest";

import { DesktopSecretStore } from "../src/desktop/desktop-secret-store.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";

const unavailableMessage = "系统钥匙串尚未配置，无法访问 AI 凭据。";

describe("DesktopSecretStore", () => {
  it("identifies the future OS keychain backend", () => {
    const invoke = vi.fn<TauriInvoke>();
    const store = new DesktopSecretStore({
      client: new TauriCommandClient(invoke),
    });

    expect(store.backend).toBe("os-keychain");
  });

  it("rejects all access until the V1 desktop keychain is configured", async () => {
    const invoke = vi.fn<TauriInvoke>();
    const store = new DesktopSecretStore({
      client: new TauriCommandClient(invoke),
    });

    await expect(store.get("provider/api-key")).rejects.toThrow(unavailableMessage);
    await expect(store.set("provider/api-key", "value")).rejects.toThrow(unavailableMessage);
    await expect(store.delete("provider/api-key")).rejects.toThrow(unavailableMessage);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not fall back to settings or memory storage", async () => {
    const invoke = vi.fn<TauriInvoke>();
    const store = new DesktopSecretStore({
      client: new TauriCommandClient(invoke),
    });

    await store.set("provider/api-key", "secret").catch(() => undefined);

    expect(invoke).not.toHaveBeenCalled();
    await expect(store.get("provider/api-key")).rejects.toThrow(unavailableMessage);
  });
});
