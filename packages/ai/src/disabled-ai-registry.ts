import type {
  AiProviderDescriptor,
  AiProviderPort,
  AiProviderRegistry,
} from "@dailyflow/application";

import { DISABLED_AI_PROVIDER_ID } from "./provider-registry.js";

const disabledDescriptor: AiProviderDescriptor = Object.freeze({
  id: DISABLED_AI_PROVIDER_ID,
  displayName: "未配置",
  capabilities: Object.freeze([]),
  sendsDataOffDevice: false,
});

const descriptors = Object.freeze([disabledDescriptor]);

export class DisabledAiRegistry implements AiProviderRegistry {
  list(): readonly AiProviderDescriptor[] {
    return descriptors;
  }

  resolve(providerId: string): AiProviderPort | null {
    void providerId;
    return null;
  }
}
