import type { SettingsStore } from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopSettingsStoreOptions {
  readonly client: TauriCommandClient;
}

export class DesktopSettingsStore implements SettingsStore {
  private readonly client: TauriCommandClient;

  constructor({ client }: DesktopSettingsStoreOptions) {
    this.client = client;
  }

  read(key: string): Promise<string | null> {
    return this.client.readSetting(key);
  }

  async write(key: string, valueJson: string): Promise<void> {
    await this.client.writeSetting(key, valueJson);
  }
}
