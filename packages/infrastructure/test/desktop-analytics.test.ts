import { resolveAnalyticsPeriod } from "@dailyflow/application";
import { createReport, parseEntityId, parseLocalDate, parseUtcTimestamp } from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopAnalyticsQuery } from "../src/desktop/desktop-analytics-query.js";
import { DesktopReportRepository } from "../src/desktop/desktop-report-repository.js";
import { createDesktopServices } from "../src/desktop/desktop-services.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";
import type { ReportDto } from "../src/desktop/tauri-contracts.js";

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d01");
const KNOWLEDGE_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d02");
const TASK_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d03");
const REPORT_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9d04");
const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const reportDto: ReportDto = {
  id: REPORT_ID,
  periodType: "week",
  periodStart: parseLocalDate("2026-10-26"),
  periodEnd: parseLocalDate("2026-11-01"),
  timezone: "Asia/Shanghai",
  title: "Weekly report",
  contentJson: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Release notes" }],
      },
    ],
  },
  editorSchemaVersion: 1,
  contentMarkdown: "Release notes\n",
  contentPlainText: "Release notes\n",
  projectionVersion: 1,
  statsJson: '{"journalCount":1}',
  generatedBy: "local",
  sourceWatermark: null,
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
};

describe("DesktopAnalyticsQuery", () => {
  it("loads raw desktop sources and uses the authoritative application aggregation", async () => {
    const invoke = vi.fn<TauriInvoke>().mockResolvedValue({
      journals: [
        {
          id: JOURNAL_ID,
          journalDate: "2026-10-27",
          title: "Release notes",
          contentPlainText: "Release 🚀",
          tags: ["release"],
          deletedAt: null,
        },
      ],
      tasks: [
        {
          id: TASK_ID,
          status: "done",
          completedAt: "2026-10-27T08:00:00.000Z",
          deletedAt: null,
        },
      ],
      knowledge: [
        {
          id: KNOWLEDGE_ID,
          kind: "solution",
          title: "Release rollback",
          createdAt: "2026-10-28T08:00:00.000Z",
          tags: ["release"],
          deletedAt: null,
        },
      ],
    });
    const analytics = new DesktopAnalyticsQuery({
      client: new TauriCommandClient(invoke),
    });
    const period = resolveAnalyticsPeriod("week", "2026-10-27", "Asia/Shanghai");

    const summary = await analytics.getSummary(period);

    expect(invoke).toHaveBeenCalledWith("analytics_get_source", {
      query: {
        start: "2026-10-26",
        end: "2026-11-01",
        timezone: "Asia/Shanghai",
      },
    });
    expect(summary).toMatchObject({
      journalDays: 1,
      journalCount: 1,
      characterCount: 9,
      tasksCompleted: 1,
      solutionsCreated: 1,
      activeTags: [{ name: "release", count: 2 }],
    });
  });
});
describe("DesktopReportRepository", () => {
  it("maps report DTOs and revision-checked Tauri commands", async () => {
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce(reportDto)
      .mockResolvedValueOnce({ ...reportDto, revision: 2 });
    const reports = new DesktopReportRepository({
      client: new TauriCommandClient(invoke),
      clock: { nowUtc: () => NOW },
    });
    const period = {
      periodType: "week" as const,
      periodStart: parseLocalDate("2026-10-26"),
      periodEnd: parseLocalDate("2026-11-01"),
      timezone: "Asia/Shanghai",
    };
    const existing = await reports.getByPeriod(period);
    const draft = createReport(
      {
        periodType: period.periodType,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        timezone: period.timezone,
        title: "Weekly report",
        content: {
          schemaVersion: 1,
          doc: reportDto.contentJson,
        },
        projectionVersion: 1,
        stats: { journalCount: 1 },
      },
      {
        ids: { nextId: () => REPORT_ID },
        clock: { nowUtc: () => NOW },
      },
    );

    expect(existing).toMatchObject({
      id: REPORT_ID,
      revision: 1,
      content: { schemaVersion: 1, doc: reportDto.contentJson },
    });
    const saved = await reports.save({ ...draft, title: "Edited report" }, 1);

    expect(invoke).toHaveBeenNthCalledWith(1, "report_get_by_period", {
      query: {
        periodType: "week",
        periodStart: "2026-10-26",
        periodEnd: "2026-11-01",
        timezone: "Asia/Shanghai",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "report_save", {
      command: {
        report: expect.objectContaining({
          id: REPORT_ID,
          title: "Edited report",
          contentJson: reportDto.contentJson,
          contentMarkdown: reportDto.contentMarkdown,
          contentPlainText: reportDto.contentPlainText,
          statsJson: '{"journalCount":1}',
        }),
        expectedRevision: 1,
      },
    });
    expect(saved.revision).toBe(2);
  });

  it("is exposed with analytics through the Desktop composition root", () => {
    const services = createDesktopServices({ invoke: vi.fn<TauriInvoke>() });

    expect(services.analytics).toBeInstanceOf(DesktopAnalyticsQuery);
    expect(services.reports).toBeInstanceOf(DesktopReportRepository);
  });
});
