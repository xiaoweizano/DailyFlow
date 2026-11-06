// @vitest-environment jsdom

import "./setup-dom.js";

import type { JournalLookup, SavedJournalSnapshot, StoredAttachment } from "@dailyflow/application";
import { createJournal, parseEntityId, parseRevision, parseUtcTimestamp } from "@dailyflow/domain";
import { err, ok, type AppError, type Result } from "@dailyflow/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BrowserRouter,
  HashRouter,
  MemoryRouter,
  useRoutes,
  type RouteObject,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnalyticsServicesStub } from "./analytics-stub.js";
import { createBackupServicesStub } from "./backup-stub.js";
import { createExportServicesStub } from "./export-stub.js";
import { createImportServicesStub } from "./import-stub.js";
import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";
import { AppServicesProvider } from "../src/app-services-provider.js";
import type { AppRuntimeServices } from "../src/app-services-context.js";
import { createAppRoutes } from "../src/routes.js";

const journalId = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const savedAt = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

function createLookup(date: string): JournalLookup {
  return {
    journal: createJournal(
      {
        journalDate: date,
        timezone: "Asia/Shanghai",
        title: `${date} 日志`,
        content: {
          schemaVersion: 1,
          doc: { type: "doc", content: [{ type: "paragraph" }] },
        },
        projectionVersion: 1,
      },
      {
        ids: { nextId: () => journalId },
        clock: { nowUtc: () => savedAt },
      },
    ),
    isPersisted: true,
  };
}

function createServices(error?: AppError) {
  return {
    ...createRuntimeSettingsStub(),
    analytics: createAnalyticsServicesStub(),
    backups: createBackupServicesStub(),
    exports: createExportServicesStub(),
    imports: createImportServicesStub(),
    knowledge: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      get: vi.fn(async () => null),
      promote: vi.fn(),
    },
    journal: {
      get: vi.fn(async (input: unknown): Promise<Result<JournalLookup, AppError>> => {
        const date = (input as { journalDate: string }).journalDate;
        if (error !== undefined) {
          return err(error);
        }
        return ok({
          ...createLookup(date),
          journal: {
            ...createLookup(date).journal,
            revision: parseRevision(1),
          },
        });
      }),
      save: vi.fn(async (): Promise<Result<SavedJournalSnapshot, AppError>> => {
        throw new Error("not used");
      }),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      listVersions: vi.fn(async () => ({ items: [], nextCursor: null })),
      getVersion: vi.fn(async () => null),
      restore: vi.fn(),
    },
    search: {
      query: vi.fn(),
      rebuild: vi.fn(),
    },
    lifecycle: {
      register: vi.fn(() => () => undefined),
      flushAll: vi.fn(async () => true),
    },
    attachments: {
      add: vi.fn(async (): Promise<Result<StoredAttachment, AppError>> => {
        throw new Error("not used");
      }),
      read: vi.fn(async () => new Uint8Array()),
    },
    tasks: {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      create: vi.fn(),
      complete: vi.fn(),
      reopen: vi.fn(),
      update: vi.fn(),
    },
    timeline: {
      getCalendar: vi.fn(async () => []),
      getAnnualActivity: vi.fn(async () => []),
      listEntries: vi.fn(async () => ({ items: [], nextCursor: null })),
    },
  } satisfies AppRuntimeServices;
}

function SharedAppRoutes({ routes }: { readonly routes: RouteObject[] }): React.JSX.Element | null {
  return useRoutes(routes);
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("journal routing", () => {
  it("moves to the previous and next dates and supports historical backfill", async () => {
    const services = createServices();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/journal/2026-10-30"]}>
        <AppServicesProvider services={services}>
          <SharedAppRoutes
            routes={createAppRoutes({
              platform: "web",
              storageLabel: "IndexedDB",
              version: "0.1.0",
              services,
            })}
          />
        </AppServicesProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue("2026-10-30")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "前一天" }));
    await waitFor(() =>
      expect(services.journal.get).toHaveBeenCalledWith(
        expect.objectContaining({ journalDate: "2026-10-29" }),
      ),
    );
    expect(screen.getByLabelText("选择日志日期")).toHaveValue("2026-10-29");

    await user.click(screen.getByRole("button", { name: "后一天" }));
    await waitFor(() =>
      expect(services.journal.get).toHaveBeenCalledWith(
        expect.objectContaining({ journalDate: "2026-10-30" }),
      ),
    );

    const dateInput = screen.getByLabelText("选择日志日期");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-10-01");
    await waitFor(() =>
      expect(services.journal.get).toHaveBeenCalledWith(
        expect.objectContaining({ journalDate: "2026-10-01" }),
      ),
    );
  });

  it("shows an inline validation error for an impossible historical date", async () => {
    const services = createServices({
      code: "VALIDATION_ERROR",
      message: "日志日期无效",
      fields: { journalDate: "日期无效" },
    });

    render(
      <MemoryRouter initialEntries={["/journal/2026-02-30"]}>
        <AppServicesProvider services={services}>
          <SharedAppRoutes
            routes={createAppRoutes({
              platform: "web",
              storageLabel: "IndexedDB",
              version: "0.1.0",
              services,
            })}
          />
        </AppServicesProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("日志日期无效");
    expect(screen.getByRole("link", { name: "返回今天" })).toHaveAttribute("href", "/");
  });

  it("enters journal routes through both BrowserRouter and HashRouter", async () => {
    const browserServices = createServices({
      code: "VALIDATION_ERROR",
      message: "日志日期无效",
      fields: { journalDate: "日期无效" },
    });
    window.history.replaceState(null, "", "/journal/not-a-date");

    const browserRender = render(
      <BrowserRouter>
        <SharedAppRoutes
          routes={createAppRoutes({
            platform: "web",
            storageLabel: "IndexedDB",
            version: "0.1.0",
            services: browserServices,
          })}
        />
      </BrowserRouter>,
    );

    expect(await screen.findByText("无法打开日志")).toBeTruthy();
    browserRender.unmount();

    const desktopServices = createServices();
    window.history.replaceState(null, "", "/#/journal/2026-10-30");
    render(
      <HashRouter>
        <SharedAppRoutes
          routes={createAppRoutes({
            platform: "desktop",
            storageLabel: "SQLite",
            version: "0.1.0",
            services: desktopServices,
          })}
        />
      </HashRouter>,
    );

    expect(await screen.findByLabelText("选择日志日期")).toHaveValue("2026-10-30");
    expect(desktopServices.journal.get).toHaveBeenCalledWith(
      expect.objectContaining({ journalDate: "2026-10-30" }),
    );
  });
});
