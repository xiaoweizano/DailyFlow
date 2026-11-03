import {
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type Report,
} from "@dailyflow/domain";
import { describe, expect, it } from "vitest";

import {
  buildAnalyticsSummary,
  resolveAnalyticsPeriod,
  shiftAnalyticsPeriod,
  type AnalyticsSource,
} from "../src/queries/analytics-query.js";
import type { ReportRepository } from "../src/ports/report-repository.js";
import {
  createAppServices,
  type ApplicationDependencies,
} from "../src/services/app-services.js";
import { generateReportDraft } from "../src/use-cases/generate-report-draft.js";
import { saveReportDraft } from "../src/use-cases/save-report-draft.js";
import { NOW, clock } from "./support.js";

const EMPTY_SOURCE: AnalyticsSource = {
  journals: [],
  tasks: [],
  knowledge: [],
};

const SOURCE: AnalyticsSource = {
  journals: [
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c41"),
      journalDate: parseLocalDate("2026-10-26"),
      title: "Week start",
      contentPlainText: "Deploy 🚀",
      tags: ["release", "deploy", "deploy"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c42"),
      journalDate: parseLocalDate("2026-10-27"),
      title: "Same day review",
      contentPlainText: "复盘",
      tags: ["review"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c43"),
      journalDate: parseLocalDate("2026-11-01"),
      title: "Sunday notes",
      contentPlainText: "Sunday",
      tags: ["review"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c44"),
      journalDate: parseLocalDate("2026-11-02"),
      title: "Next week",
      contentPlainText: "Outside",
      tags: ["outside"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c45"),
      journalDate: parseLocalDate("2026-10-28"),
      title: "Deleted",
      contentPlainText: "Deleted",
      tags: ["deleted"],
      deletedAt: parseUtcTimestamp(NOW),
    },
  ],
  tasks: [
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c46"),
      status: "done",
      completedAt: parseUtcTimestamp("2026-10-31T16:30:00.000Z"),
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c47"),
      status: "open",
      completedAt: null,
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c48"),
      status: "done",
      completedAt: parseUtcTimestamp("2026-11-02T01:00:00.000Z"),
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c49"),
      status: "done",
      completedAt: parseUtcTimestamp("2026-10-29T08:00:00.000Z"),
      deletedAt: parseUtcTimestamp(NOW),
    },
  ],
  knowledge: [
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c4a"),
      kind: "issue",
      title: "Issue",
      createdAt: parseUtcTimestamp("2026-10-28T08:00:00.000Z"),
      tags: ["release", "incident"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c4b"),
      kind: "solution",
      title: "Solution",
      createdAt: parseUtcTimestamp("2026-10-29T08:00:00.000Z"),
      tags: ["incident"],
      deletedAt: null,
    },
    {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c4c"),
      kind: "note",
      title: "Deleted note",
      createdAt: parseUtcTimestamp("2026-10-30T08:00:00.000Z"),
      tags: ["deleted"],
      deletedAt: parseUtcTimestamp(NOW),
    },
  ],
};

class FakeReportRepository implements ReportRepository {
  report: Report | null = null;
  saved: Report | null = null;
  expectedRevision: number | null | undefined;

  async getByPeriod(): Promise<Report | null> {
    return this.report;
  }

  async save(report: Report, expectedRevision: number | null): Promise<Report> {
    this.saved = report;
    this.expectedRevision = expectedRevision;
    return report;
  }
}

describe("analytics periods", () => {
  it("normalizes week, month, and year starts with Monday as the first day", () => {
    expect(resolveAnalyticsPeriod("week", "2026-10-29", "Asia/Shanghai")).toEqual({
      periodType: "week",
      start: parseLocalDate("2026-10-26"),
      end: parseLocalDate("2026-11-01"),
      timezone: "Asia/Shanghai",
    });
    expect(resolveAnalyticsPeriod("month", "2024-02-29", "Asia/Shanghai")).toEqual({
      periodType: "month",
      start: parseLocalDate("2024-02-01"),
      end: parseLocalDate("2024-02-29"),
      timezone: "Asia/Shanghai",
    });
    expect(resolveAnalyticsPeriod("year", "2026-11-03", "Asia/Shanghai")).toEqual({
      periodType: "year",
      start: parseLocalDate("2026-01-01"),
      end: parseLocalDate("2026-12-31"),
      timezone: "Asia/Shanghai",
    });
  });

  it("moves by calendar period without relying on UTC instants", () => {
    const month = resolveAnalyticsPeriod("month", "2024-02-29", "Asia/Shanghai");
    const previous = shiftAnalyticsPeriod(month, -1);
    const next = shiftAnalyticsPeriod(previous, 1);

    expect(previous).toMatchObject({
      start: "2024-01-01",
      end: "2024-01-31",
    });
    expect(next).toEqual(month);
  });

  it("rejects invalid time zones and dates", () => {
    expect(() => resolveAnalyticsPeriod("week", "2024-02-30", "Asia/Shanghai")).toThrow(
      /Invalid LocalDate/u,
    );
    expect(() => resolveAnalyticsPeriod("week", "2024-02-29", "Mars/Olympus")).toThrow(
      /Invalid IANA timezone/u,
    );
  });
});

describe("analytics summary", () => {
  it("uses the selected time zone and excludes soft-deleted records", () => {
    const period = resolveAnalyticsPeriod("week", "2026-10-29", "Asia/Shanghai");
    const summary = buildAnalyticsSummary(SOURCE, period);

    expect(summary).toMatchObject({
      journalDays: 3,
      journalCount: 3,
      characterCount: 16,
      tasksCompleted: 1,
      issuesCreated: 1,
      solutionsCreated: 1,
      knowledgeItems: 2,
    });
    expect(summary.activeTags).toEqual([
      { name: "review", count: 2 },
      { name: "deploy", count: 1 },
      { name: "incident", count: 2 },
      { name: "release", count: 2 },
    ].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)));
    expect(summary.dailyActivity.find((day) => day.date === "2026-11-01")?.tasksCompleted).toBe(1);
    expect(summary.dailyActivity).toHaveLength(7);
  });

  it("counts Unicode characters rather than UTF-16 code units", () => {
    const period = resolveAnalyticsPeriod("month", "2026-10-01", "Asia/Shanghai");
    const summary = buildAnalyticsSummary(
      {
        ...EMPTY_SOURCE,
        journals: [
          {
            id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c51"),
            journalDate: parseLocalDate("2026-10-01"),
            title: "",
            contentPlainText: "A😀中",
            tags: [],
            deletedAt: null,
          },
        ],
      },
      period,
    );

    expect(summary.characterCount).toBe(3);
  });
});

describe("report drafts", () => {
  it("creates a deterministic local draft with a visible stats snapshot", () => {
    const period = resolveAnalyticsPeriod("week", "2026-10-29", "Asia/Shanghai");
    const summary = buildAnalyticsSummary(SOURCE, period);
    const draft = generateReportDraft(summary);

    expect(draft.title).toBe("2026-10-26 至 2026-11-01 周报");
    expect(draft.content.schemaVersion).toBe(1);
    expect(draft.stats).toMatchObject({
      periodType: "week",
      periodStart: "2026-10-26",
      periodEnd: "2026-11-01",
      timezone: "Asia/Shanghai",
      journalDays: 3,
      tasksCompleted: 1,
    });
    expect(JSON.stringify(draft.content)).toContain("统计周期：2026-10-26 至 2026-11-01");
  });

  it("saves the generated stats snapshot without depending on AI", async () => {
    const period = resolveAnalyticsPeriod("week", "2026-10-29", "Asia/Shanghai");
    const summary = buildAnalyticsSummary(SOURCE, period);
    const draft = generateReportDraft(summary);
    const reports = new FakeReportRepository();

    const result = await saveReportDraft(
      {
        reports,
        ids: {
          nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c61",
        },
        clock,
      },
      {
        periodType: period.periodType,
        periodStart: period.start,
        periodEnd: period.end,
        timezone: period.timezone,
        title: draft.title,
        content: draft.content,
        projectionVersion: 1,
        stats: draft.stats,
        expectedRevision: null,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected report save to succeed");
    }
    expect(result.value.generatedBy).toBe("local");
    expect(result.value.stats).toEqual(draft.stats);
    expect(reports.saved).toEqual(result.value);
    expect(reports.expectedRevision).toBeNull();
  });

  it("updates an existing period report with optimistic concurrency", async () => {
    const period = resolveAnalyticsPeriod("month", "2026-10-01", "Asia/Shanghai");
    const draft = generateReportDraft(buildAnalyticsSummary(SOURCE, period));
    const reports = new FakeReportRepository();
    reports.report = {
      id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c62"),
      periodType: period.periodType,
      periodStart: period.start,
      periodEnd: period.end,
      timezone: period.timezone,
      title: "Old title",
      content: draft.content,
      projectionVersion: 1,
      stats: { journalDays: 0 },
      generatedBy: "local",
      sourceWatermark: parseUtcTimestamp(NOW),
      revision: parseRevision(2),
      createdAt: parseUtcTimestamp(NOW),
      updatedAt: parseUtcTimestamp(NOW),
      deletedAt: null,
    };

    const result = await saveReportDraft(
      {
        reports,
        ids: {
          nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c63",
        },
        clock,
      },
      {
        periodType: period.periodType,
        periodStart: period.start,
        periodEnd: period.end,
        timezone: period.timezone,
        title: draft.title,
        content: draft.content,
        projectionVersion: 1,
        stats: draft.stats,
        expectedRevision: 2,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected report update to succeed");
    }
    expect(result.value.id).toBe(reports.report.id);
    expect(result.value.title).toBe(draft.title);
    expect(result.value.revision).toBe(2);
    expect(result.value.sourceWatermark).toBe(NOW);
    expect(reports.expectedRevision).toBe(2);
  });
});

describe("analytics application wiring", () => {
  it("exposes analytics queries and report draft saves through app services", async () => {
    const analytics = {
      getSummary: async () => buildAnalyticsSummary(EMPTY_SOURCE, {
        periodType: "week" as const,
        start: parseLocalDate("2026-10-26"),
        end: parseLocalDate("2026-11-01"),
        timezone: "Asia/Shanghai",
      }),
    };
    const reports = new FakeReportRepository();
    const services = createAppServices({
      analytics,
      reports,
      clock,
      ids: {
        nextId: () => "0198e2f4-7e33-7c70-a8b2-18c1520f9c64",
      },
    } as unknown as ApplicationDependencies);

    expect(services.analytics).toBe(analytics);
    expect(services.useCases.saveReportDraft).toBeTypeOf("function");

    const result = await services.useCases.saveReportDraft({
      periodType: "week",
      periodStart: "2026-10-26",
      periodEnd: "2026-11-01",
      timezone: "Asia/Shanghai",
      title: "Weekly report",
      content: {
        schemaVersion: 1,
        doc: { type: "doc", content: [] },
      },
      projectionVersion: 1,
      stats: { journalCount: 0 },
      expectedRevision: null,
    });

    expect(result.ok).toBe(true);
    expect(reports.saved?.generatedBy).toBe("local");
  });
});
