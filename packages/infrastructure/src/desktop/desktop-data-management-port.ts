import type { DataHealthSnapshot, DataManagementPort } from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";

export interface DesktopDataManagementPortOptions {
  readonly client: TauriCommandClient;
}

export class DesktopDataManagementPort implements DataManagementPort {
  private readonly client: TauriCommandClient;

  constructor(options: DesktopDataManagementPortOptions) {
    this.client = options.client;
  }

  async inspect(): Promise<DataHealthSnapshot> {
    return this.client.inspectDataHealth();
  }
}
