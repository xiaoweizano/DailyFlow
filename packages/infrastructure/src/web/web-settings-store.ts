import type { SettingsStore } from "@dailyflow/application";
import type { Clock } from "@dailyflow/domain";

import type { DailyFlowDb } from "./db.js";

export interface WebSettingsStoreOptions {
  readonly database: DailyFlowDb;
  readonly clock?: Clock;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

export class WebSettingsStore implements SettingsStore {
  private readonly database: DailyFlowDb;
  private readonly clock: Clock;

  constructor({ database, clock = systemClock }: WebSettingsStoreOptions) {
    this.database = database;
    this.clock = clock;
  }

  async read(key: string): Promise<string | null> {
    const row = await this.database.settings.get(key);
    return typeof row?.value === "string" ? row.value : null;
  }

  async write(key: string, valueJson: string): Promise<void> {
    await this.database.settings.put({
      key,
      value: valueJson,
      updatedAt: this.clock.nowUtc(),
    });
  }
}
