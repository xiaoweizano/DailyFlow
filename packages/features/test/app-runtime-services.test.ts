import type {
  ImportRepository,
  ImportService,
  ImportSource,
  ImportTxtAnalyzer,
  TxtDocumentConverter,
} from "@dailyflow/application";
import { describe, expect, it, vi } from "vitest";

import {
  createAppRuntimeServices,
  type CreateAppRuntimeServicesOptions,
} from "../src/app-runtime-services.js";

describe("createAppRuntimeServices", () => {
  it("composes the import service from injected storage adapters", async () => {
    const root = { label: "logs", handle: { id: "root" } };
    const source: ImportSource = {
      selectRoot: vi.fn(async () => root),
      scan: vi.fn(async function* () {
        yield* [];
      }),
    };
    const repository = {} as ImportRepository;
    const analyzer: ImportTxtAnalyzer = {
      analyze: vi.fn(async () => ({
        encoding: "utf8" as const,
        text: "entry",
        newlineStyle: "lf" as const,
      })),
    };
    const converter: TxtDocumentConverter = {
      toContent: vi.fn(),
    };
    const options = {
      analytics: {},
      attachments: {},
      exportStorage: {
        source: {},
        target: {},
      },
      importStorage: { analyzer, converter, repository, source },
      journals: {},
      knowledge: {},
      reports: {},
      search: {},
      tasks: {},
      timeline: {},
    } as unknown as CreateAppRuntimeServicesOptions;

    const services = createAppRuntimeServices(options);
    const imports = (services as unknown as { imports: ImportService }).imports;

    await expect(imports.selectRoot()).resolves.toBe(root);
    expect(source.selectRoot).toHaveBeenCalledOnce();
  });
});
