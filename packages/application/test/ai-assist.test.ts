import { describe, expect, it, vi } from "vitest";

import {
  prepareAiAssist,
  runAiAssist,
  type AiProviderPort,
  type AiProviderRegistry,
} from "../src/index.js";

const selectedTextRequest = {
  providerId: "fixture-provider",
  purpose: "selection-explain",
  locale: "zh-CN",
  maxOutputTokens: 512,
  parts: [
    {
      kind: "selected-text",
      label: "选中内容",
      text: "解释这段错误排查记录。",
      sourceEntityId: "0190f3e0-7a2b-7c4d-8e9f-123456789abc",
    },
  ],
} as const;

function createProvider(overrides: Partial<AiProviderPort["descriptor"]> = {}): AiProviderPort {
  return {
    descriptor: {
      id: "fixture-provider",
      displayName: "Fixture Provider",
      capabilities: ["selection-explain"],
      sendsDataOffDevice: true,
      ...overrides,
    },
    complete: vi.fn(async () => ({
      text: "这是一个可编辑的草稿。",
      finishReason: "stop" as const,
    })),
  };
}

function createRegistry(provider: AiProviderPort | null): AiProviderRegistry {
  return {
    list: () => (provider === null ? [] : [provider.descriptor]),
    resolve: (providerId) => (provider?.descriptor.id === providerId ? provider : null),
  };
}

describe("AI assist safety boundary", () => {
  it("reports an unavailable provider without calling a network replacement", async () => {
    const fetchReplacement = vi.fn();
    const result = await prepareAiAssist({ registry: createRegistry(null) }, selectedTextRequest);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AI_UNAVAILABLE",
        providerId: "fixture-provider",
        reason: "provider_not_configured",
      },
    });
    expect(fetchReplacement).not.toHaveBeenCalled();
  });

  it.each([
    ["a fenced code block", "```ts\nconst token = 'secret';\n```"],
    ["a Windows path", "读取 C:\\Users\\office\\private.txt 后失败"],
    ["a macOS path", "文件位于 /Users/office/private.txt"],
    ["a UNC path", "打开 \\\\server\\share\\private.txt"],
  ])("rejects %s before previewing an external request", async (_label, text) => {
    const provider = createProvider();
    const result = await prepareAiAssist(
      { registry: createRegistry(provider) },
      {
        ...selectedTextRequest,
        parts: [{ ...selectedTextRequest.parts[0], text }],
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("builds an exact preview without exposing paths or attachment payloads", async () => {
    const provider = createProvider();
    const result = await prepareAiAssist(
      { registry: createRegistry(provider) },
      selectedTextRequest,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        provider: provider.descriptor,
        purpose: "selection-explain",
        locale: "zh-CN",
        parts: [
          {
            kind: "selected-text",
            label: "选中内容",
            text: "解释这段错误排查记录。",
            characterCount: 11,
            sourceEntityId: "0190f3e0-7a2b-7c4d-8e9f-123456789abc",
          },
        ],
        characterCount: 11,
        maxOutputTokens: 512,
        codeBlockCount: 0,
        target: "external-service",
      },
    });
  });

  it("runs only the exact reviewed request and returns an unsaved draft", async () => {
    const provider = createProvider({
      capabilities: ["selection-explain", "report-summary"],
    });
    const prepared = await prepareAiAssist(
      { registry: createRegistry(provider) },
      {
        ...selectedTextRequest,
        purpose: "report-summary",
        parts: [
          {
            kind: "report-stats",
            label: "周报统计",
            text: "记录 5 天，完成任务 8 个。",
          },
        ],
      },
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = await runAiAssist({ registry: createRegistry(provider) }, prepared.value, {
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        status: "completed",
        draft: {
          providerId: "fixture-provider",
          purpose: "report-summary",
          text: "这是一个可编辑的草稿。",
          finishReason: "stop",
        },
      },
    });
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledWith(
      {
        purpose: "report-summary",
        systemPolicyVersion: 1,
        parts: [
          {
            label: "周报统计",
            text: "记录 5 天，完成任务 8 个。",
          },
        ],
        locale: "zh-CN",
        maxOutputTokens: 512,
      },
      expect.objectContaining({ aborted: false }),
    );
  });

  it("returns cancelled without calling a provider after caller cancellation", async () => {
    const provider = createProvider();
    const prepared = await prepareAiAssist(
      { registry: createRegistry(provider) },
      selectedTextRequest,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const controller = new AbortController();
    controller.abort();
    const result = await runAiAssist({ registry: createRegistry(provider) }, prepared.value, {
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: true, value: { status: "cancelled" } });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("times out a provider that does not settle", async () => {
    const provider = createProvider();
    provider.complete = vi.fn(async () => await new Promise<never>(() => undefined));
    const prepared = await prepareAiAssist(
      { registry: createRegistry(provider) },
      selectedTextRequest,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = await runAiAssist({ registry: createRegistry(provider) }, prepared.value, {
      timeoutMs: 20,
    });

    expect(result).toEqual({ ok: true, value: { status: "timed_out" } });
  });

  it("maps provider errors to a stable code without echoing sensitive text", async () => {
    const provider = createProvider();
    provider.complete = vi.fn(async () => {
      throw new Error("API key sk-secret failed at C:\\private\\config");
    });
    const prepared = await prepareAiAssist(
      { registry: createRegistry(provider) },
      selectedTextRequest,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const result = await runAiAssist({ registry: createRegistry(provider) }, prepared.value);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AI_UNAVAILABLE",
        providerId: "fixture-provider",
        reason: "provider_failed",
      },
    });
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(result)).not.toContain("C:\\\\private");
  });
});
