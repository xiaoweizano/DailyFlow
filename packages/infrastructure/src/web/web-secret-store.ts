import type { SecretStore, SecretStoreBackend } from "@dailyflow/application";

export class WebSecretStore implements SecretStore {
  readonly backend: SecretStoreBackend = "session-memory";
  private readonly secrets = new Map<string, string>();

  async get(secretRef: string): Promise<string | null> {
    assertSecretRef(secretRef);
    return this.secrets.get(secretRef) ?? null;
  }

  async set(secretRef: string, value: string): Promise<void> {
    assertSecretRef(secretRef);
    if (value.trim().length === 0) {
      throw new Error("凭据内容不能为空。");
    }
    this.secrets.set(secretRef, value);
  }

  async delete(secretRef: string): Promise<void> {
    assertSecretRef(secretRef);
    this.secrets.delete(secretRef);
  }
}

function assertSecretRef(secretRef: string): void {
  if (secretRef.trim().length === 0) {
    throw new Error("凭据引用不能为空。");
  }
}
