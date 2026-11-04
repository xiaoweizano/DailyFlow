import type { EntityId } from "@dailyflow/domain";
import { err, ok, type Result } from "@dailyflow/shared";
import { z } from "zod";

import { validationError } from "../errors.js";
import type {
  AiCompletionRequest,
  AiContextPart,
  AiProviderDescriptor,
  AiProviderPort,
  AiProviderRegistry,
  AiPurpose,
} from "../ports/ai-provider.js";
import type { AppError } from "@dailyflow/shared";

const MAX_CONTEXT_CHARACTERS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const ENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const AiAssistPartInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("selected-text"),
      label: z.string().trim().min(1).max(100),
      text: z.string().min(1),
      sourceEntityId: z.string().regex(ENTITY_ID_PATTERN).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("report-stats"),
      label: z.string().trim().min(1).max(100),
      text: z.string().min(1),
      sourceEntityId: z.string().regex(ENTITY_ID_PATTERN).optional(),
    })
    .strict(),
]);

const PrepareAiAssistInputSchema = z
  .object({
    providerId: z.string().trim().min(1).max(100),
    purpose: z.enum(["report-summary", "selection-explain"]),
    locale: z.string().trim().min(2).max(35),
    maxOutputTokens: z.number().int().min(1).max(4096),
    parts: z.array(AiAssistPartInputSchema).min(1).max(8),
  })
  .strict();

const RunAiAssistOptionsSchema = z
  .object({
    signal: z.instanceof(AbortSignal).optional(),
    timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional(),
  })
  .strict();

export interface AiAssistPreviewPart {
  readonly kind: "selected-text" | "report-stats";
  readonly label: string;
  readonly text: string;
  readonly characterCount: number;
  readonly sourceEntityId?: EntityId;
}

export interface AiAssistPreview {
  readonly provider: AiProviderDescriptor;
  readonly purpose: AiPurpose;
  readonly locale: string;
  readonly parts: readonly AiAssistPreviewPart[];
  readonly characterCount: number;
  readonly maxOutputTokens: number;
  readonly codeBlockCount: 0;
  readonly target: "external-service" | "on-device";
}

export interface AiAssistDraft {
  readonly providerId: string;
  readonly purpose: AiPurpose;
  readonly text: string;
  readonly finishReason: "stop" | "length";
}

export type AiAssistOutcome =
  | { readonly status: "completed"; readonly draft: AiAssistDraft }
  | { readonly status: "cancelled" }
  | { readonly status: "timed_out" };

export interface PrepareAiAssistDependencies {
  readonly registry: AiProviderRegistry;
}

export interface RunAiAssistDependencies {
  readonly registry: AiProviderRegistry;
}

export interface RunAiAssistOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

interface PreparedRequestBinding {
  readonly provider: AiProviderPort;
  readonly request: AiCompletionRequest;
}

const preparedRequests = new WeakMap<AiAssistPreview, PreparedRequestBinding>();

function aiUnavailable(providerId: string, reason: string): AppError {
  return {
    code: "AI_UNAVAILABLE",
    providerId,
    reason,
  };
}

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function containsCodeBlock(value: string): boolean {
  return /```|~~~/u.test(value);
}

function containsFilePath(value: string): boolean {
  return (
    /\b[A-Za-z]:[\\/][^\s]*/u.test(value) ||
    /(?:^|\s)\\\\[^\\\s]+\\[^\\\s]+/u.test(value) ||
    /(?:^|\s)\/(?:Users|home|root|var|tmp|private|Volumes|mnt)\//u.test(value)
  );
}

function toRequestPart(part: z.infer<typeof AiAssistPartInputSchema>): AiContextPart {
  return {
    label: part.label,
    text: part.text,
    ...(part.sourceEntityId === undefined
      ? {}
      : { sourceEntityId: part.sourceEntityId as EntityId }),
  };
}

export async function prepareAiAssist(
  { registry }: PrepareAiAssistDependencies,
  input: unknown,
): Promise<Result<AiAssistPreview, AppError>> {
  const parsed = PrepareAiAssistInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(validationError(parsed.error));
  }

  const provider = registry.resolve(parsed.data.providerId);
  if (provider === null) {
    return err(aiUnavailable(parsed.data.providerId, "provider_not_configured"));
  }
  if (!provider.descriptor.capabilities.includes(parsed.data.purpose)) {
    return err(aiUnavailable(parsed.data.providerId, "purpose_not_supported"));
  }

  const unsafePart = parsed.data.parts.find(
    (part) => containsCodeBlock(part.text) || containsFilePath(part.text),
  );
  if (unsafePart !== undefined) {
    return err({
      code: "VALIDATION_ERROR",
      message: "AI context cannot contain code blocks or file paths.",
      fields: {
        parts: "请移除代码块和本地文件路径后再预览。",
      },
    });
  }

  const characterCount = parsed.data.parts.reduce(
    (total, part) => total + countCharacters(part.text),
    0,
  );
  if (characterCount > MAX_CONTEXT_CHARACTERS) {
    return err({
      code: "VALIDATION_ERROR",
      message: "AI context exceeds the allowed character count.",
      fields: {
        parts: `AI 上下文不能超过 ${MAX_CONTEXT_CHARACTERS} 个字符。`,
      },
    });
  }

  const request: AiCompletionRequest = {
    purpose: parsed.data.purpose,
    systemPolicyVersion: 1,
    parts: parsed.data.parts.map(toRequestPart),
    locale: parsed.data.locale,
    maxOutputTokens: parsed.data.maxOutputTokens,
  };
  const preview: AiAssistPreview = {
    provider: provider.descriptor,
    purpose: parsed.data.purpose,
    locale: parsed.data.locale,
    parts: parsed.data.parts.map((part) => ({
      kind: part.kind,
      label: part.label,
      text: part.text,
      characterCount: countCharacters(part.text),
      ...(part.sourceEntityId === undefined
        ? {}
        : { sourceEntityId: part.sourceEntityId as EntityId }),
    })),
    characterCount,
    maxOutputTokens: parsed.data.maxOutputTokens,
    codeBlockCount: 0,
    target: provider.descriptor.sendsDataOffDevice ? "external-service" : "on-device",
  };

  preparedRequests.set(preview, { provider, request });
  return ok(preview);
}

class AiCancellationError extends Error {
  constructor() {
    super("AI request cancelled");
    this.name = "AiCancellationError";
  }
}

export async function runAiAssist(
  dependencies: RunAiAssistDependencies,
  preview: AiAssistPreview,
  options: RunAiAssistOptions = {},
): Promise<Result<AiAssistOutcome, AppError>> {
  void dependencies;
  const binding = preparedRequests.get(preview);
  if (binding === undefined) {
    return err({
      code: "VALIDATION_ERROR",
      message: "AI request preview is invalid.",
      fields: {
        preview: "请重新生成并确认 AI 请求预览。",
      },
    });
  }

  const parsedOptions = RunAiAssistOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return err(validationError(parsedOptions.error));
  }

  if (parsedOptions.data.signal?.aborted === true) {
    return ok({ status: "cancelled" });
  }

  const controller = new AbortController();
  let terminalStatus: "cancelled" | "timed_out" | null = null;
  const cancel = (status: "cancelled" | "timed_out"): void => {
    if (terminalStatus === null) {
      terminalStatus = status;
      controller.abort();
    }
  };
  const onCallerAbort = (): void => {
    cancel("cancelled");
  };
  parsedOptions.data.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeoutId = setTimeout(
    () => cancel("timed_out"),
    parsedOptions.data.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const cancellation = {
    get aborted(): boolean {
      return controller.signal.aborted;
    },
    throwIfAborted(): void {
      if (controller.signal.aborted) {
        throw new AiCancellationError();
      }
    },
  };

  try {
    const completionPromise = binding.provider
      .complete(binding.request, cancellation)
      .then<AiAssistOutcome>((completion) => ({
        status: "completed",
        draft: {
          providerId: binding.provider.descriptor.id,
          purpose: binding.request.purpose,
          text: completion.text,
          finishReason: completion.finishReason,
        },
      }));
    const cancellationPromise = new Promise<AiAssistOutcome>((resolve) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          resolve({
            status: terminalStatus ?? "cancelled",
          });
        },
        { once: true },
      );
    });

    return ok(await Promise.race([completionPromise, cancellationPromise]));
  } catch {
    if (terminalStatus !== null) {
      return ok({ status: terminalStatus });
    }
    if (controller.signal.aborted) {
      return ok({ status: "cancelled" });
    }
    return err(aiUnavailable(binding.provider.descriptor.id, "provider_failed"));
  } finally {
    clearTimeout(timeoutId);
    parsedOptions.data.signal?.removeEventListener("abort", onCallerAbort);
  }
}
