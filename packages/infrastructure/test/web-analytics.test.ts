import "fake-indexeddb/auto";

import { PortError, resolveAnalyticsPeriod } from "@dailyflow/application";
import {
  createReport,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseUtcTimestamp,
} from "@dailyflow/domain";
import { afterEach, describe, expect, it } from "vitest";

import { DailyFlowDb } from "../src/web/db.js";
import { DexieAnalyticsQuery } from "../src/web/dexie-analytics-query.js";
import { DexieReportRepository } from "../src/web/dexie-report-repository.js";
import { createWebServices } from "../src/web/web-services.js";
import { MutableClock } from "../src/testing/repository-contract.js";

const openDatabases: DailyFlowDb[] = [];
let databaseSequence = 0;

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520fa010");
const KNOWLEDGE_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520fa011");
const REPORT_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520fa012");
const TAG_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520fa013");
const NOW = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

function createDatabase(): DailyFlowDb {
  databaseSequence += 1;
  const database = new DailyFlowDb(`dailyflow-web-analytics-test-${databaseSequence}`);
  openDatabases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()));
});

describe("DexieAnalyticsQuery", () => {
  it("aggregates journal, task, knowledge, and tag data for the selected period", async () => {
    const database = createDatabase();
    const query = new DexieAnalyticsQuery({ database });
    await database.journals.bulkPut([
      {
        id: JOURNAL_ID,
        journalDate: parseLocalDate("2026-10-27"),
        timezone: "Asia/Shanghai",
        title: "Release notes",
        contentJson: "{}",
        editorSchemaVersion: 1,
        contentMarkdown: "Release notes",
        contentPlainText: "Release 🚀",
        contentHash: parseContentHash("a".repeat(64)),
        projectionVersion: 1,
        excerpt: "Release",
        status: "active",
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
    ]);
    await database.tasks.bulkPut([
      {
        id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520fa014"),
        title: "Ship release",
        descriptionJson: null,
        descriptionText: "",
        status: "done",
        priority: "normal",
        dueDate: null,
        completedAt: parseUtcTimestamp("2026-10-27T08:00:00.000Z"),
        journalId: null,
        knowledgeItemId: null,
        revision: 2,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
    ]);
    await database.knowledgeItems.bulkPut([
      {
        id: KNOWLEDGE_ID,
        kind: "solution",
        status: "active",
        title: "Release rollback",
        contentJson: "{}",
        editorSchemaVersion: 1,
        contentHash: null,
        projectionVersion: 1,
        summary: "Rollback safely",
        revision: 1,
        sourceJournalId: null,
        sourceBlockId: null,
        createdAt: parseUtcTimestamp("2026-10-28T08:00:00.000Z"),
        updatedAt: NOW,
        deletedAt: null,
      },
    ]);
    await database.tags.put({
      id: TAG_ID,
      name: "release",
      nameNormalized: "release",
      color: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await database.journalTags.put({ journalId: JOURNAL_ID, tagId: TAG_ID });
    await database.knowledgeTags.put({ knowledgeItemId: KNOWLEDGE_ID, tagId: TAG_ID });

    const summary = await query.getSummary(
      resolveAnalyticsPeriod("week", "2026-10-27", "Asia/Shanghai"),
    );

    expect(summary).toMatchObject({
      journalDays: 1,
      journalCount: 1,
      characterCount: 9,
      tasksCompleted: 1,
      solutionsCreated: 1,
      knowledgeItems: 1,
    });
    expect(summary.activeTags).toEqual([{ name: "release", count: 2 }]);
  });
});

describe("DexieReportRepository", () => {
  it("persists canonical Tiptap JSON with derived text projections and optimistic revision", async () => {
    const database = createDatabase();
    const clock = new MutableClock();
    const repository = new DexieReportRepository({ database, clock });
    const report = createReport(
      {
        periodType: "week",
        periodStart: "2026-10-26",
        periodEnd: "2026-11-01",
        timezone: "Asia/Shanghai",
        title: "Weekly report",
        content: {
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Release notes" }],
              },
            ],
          },
        },
        projectionVersion: 1,
        stats: { journalCount: 1 },
      },
      {
        clock,
        ids: { nextId: () => REPORT_ID },
      },
    );

    const saved = await repository.save(report, null);
    const row = await database.reports.get(REPORT_ID);

    expect(saved.revision).toBe(1);
    expect(row).toMatchObject({
      contentMarkdown: "Release notes\n",
      contentPlainText: "Release notes\n",
      revision: 1,
      statsJson: '{"journalCount":1}',
    });
    expect(JSON.parse(row?.contentJson ?? "null")).toEqual(report.content.doc);
    await expect(repository.getByPeriod(saved)).resolves.toMatchObject({
      id: REPORT_ID,
      revision: 1,
    });

    const conflict = repository
      .save({ ...saved, title: "Stale update" }, 0)
      .catch((error: unknown) => error);
    await expect(conflict).resolves.toBeInstanceOf(PortError);
    await expect(conflict).resolves.toMatchObject({ code: "CONFLICT" });
  });

  it("is exposed with analytics through the Web composition root", () => {
    const services = createWebServices({
      database: createDatabase(),
      clock: new MutableClock(),
    });

    expect(services.analytics).toBeInstanceOf(DexieAnalyticsQuery);
    expect(services.reports).toBeInstanceOf(DexieReportRepository);
  });
});
