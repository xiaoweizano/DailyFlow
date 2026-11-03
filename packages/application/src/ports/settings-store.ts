export interface SettingsStore {
  read(key: string): Promise<string | null>;
  write(key: string, valueJson: string): Promise<void>;
}
