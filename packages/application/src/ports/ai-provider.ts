import type { EntityId } from "@dailyflow/domain";

export type AiPurpose = "report-summary" | "selection-explain";

export interface AiContextPart {
  readonly label: string;
  readonly text: string;
  readonly sourceEntityId?: EntityId;
}

export interface AiCompletionRequest {
  readonly purpose: AiPurpose;
  readonly systemPolicyVersion: number;
  readonly parts: readonly AiContextPart[];
  readonly locale: string;
  readonly maxOutputTokens: number;
}

export interface AiProviderDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly AiPurpose[];
  readonly sendsDataOffDevice: boolean;
}

export interface AiCancellation {
  readonly aborted: boolean;
  throwIfAborted(): void;
}

export interface AiProviderPort {
  readonly descriptor: AiProviderDescriptor;
  complete(
    request: AiCompletionRequest,
    cancellation: AiCancellation,
  ): Promise<{
    readonly text: string;
    readonly finishReason: "stop" | "length";
  }>;
}

export interface AiProviderRegistry {
  list(): readonly AiProviderDescriptor[];
  resolve(providerId: string): AiProviderPort | null;
}
