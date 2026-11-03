import type { SecretStore, SecretStoreBackend } from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopSecretStoreOptions {
  readonly client: TauriCommandClient;
}

const unavailableMessage = "系统钥匙串尚未配置，无法访问 AI 凭据。";

export class DesktopSecretStore implements SecretStore {
  readonly backend: SecretStoreBackend = "os-keychain";

  constructor(options: DesktopSecretStoreOptions) {
    void options;
  }

  async get(secretRef: string): Promise<string | null> {
    void secretRef;
    throw new Error(unavailableMessage);
  }

  async set(secretRef: string, value: string): Promise<void> {
    void secretRef;
    void value;
    throw new Error(unavailableMessage);
  }

  async delete(secretRef: string): Promise<void> {
    void secretRef;
    throw new Error(unavailableMessage);
  }
}
