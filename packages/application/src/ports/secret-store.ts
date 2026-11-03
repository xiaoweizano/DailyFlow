export type SecretStoreBackend = "os-keychain" | "session-memory";

export interface SecretStore {
  readonly backend: SecretStoreBackend;
  get(secretRef: string): Promise<string | null>;
  set(secretRef: string, value: string): Promise<void>;
  delete(secretRef: string): Promise<void>;
}
