import {
  buildAnalyticsSummary,
  type AnalyticsKnowledgeSource,
  type AnalyticsPeriod,
  type AnalyticsQuery,
  type AnalyticsSource,
  type AnalyticsSummary,
} from "@dailyflow/application";
import type { EntityId } from "@dailyflow/domain";

import type { DailyFlowDb } from "./db.js";

export interface DexieAnalyticsQueryOptions {
  readonly database: DailyFlowDb;
}

async function loadTagNames(
  database: DailyFlowDb,
  journalIds: readonly EntityId[],
  knowledgeIds: readonly EntityId[],
): Promise<{
  readonly journalTags: ReadonlyMap<EntityId, readonly string[]>;
  readonly knowledgeTags: ReadonlyMap<EntityId, readonly string[]>;
}> {
  const [journalLinks, knowledgeLinks] = await Promise.all([
    journalIds.length === 0
      ? Promise.resolve([])
      : database.journalTags
          .where("journalId")
          .anyOf([...journalIds])
          .toArray(),
    knowledgeIds.length === 0
      ? Promise.resolve([])
      : database.knowledgeTags
          .where("knowledgeItemId")
          .anyOf([...knowledgeIds])
          .toArray(),
  ]);
  const tagIds = new Set<EntityId>();
  for (const link of journalLinks) {
    tagIds.add(link.tagId);
  }
  for (const link of knowledgeLinks) {
    tagIds.add(link.tagId);
  }
  const tagRows = tagIds.size === 0 ? [] : await database.tags.bulkGet([...tagIds]);
  const names = new Map<EntityId, string>();
  for (const tag of tagRows) {
    if (tag !== undefined) {
      names.set(tag.id, tag.name);
    }
  }

  const journalTags = new Map<EntityId, string[]>();
  for (const link of journalLinks) {
    const name = names.get(link.tagId);
    if (name !== undefined) {
      journalTags.set(link.journalId, [...(journalTags.get(link.journalId) ?? []), name]);
    }
  }
  const knowledgeTags = new Map<EntityId, string[]>();
  for (const link of knowledgeLinks) {
    const name = names.get(link.tagId);
    if (name !== undefined) {
      knowledgeTags.set(link.knowledgeItemId, [
        ...(knowledgeTags.get(link.knowledgeItemId) ?? []),
        name,
      ]);
    }
  }

  return { journalTags, knowledgeTags };
}

export class DexieAnalyticsQuery implements AnalyticsQuery {
  private readonly database: DailyFlowDb;

  constructor(options: DexieAnalyticsQueryOptions) {
    this.database = options.database;
  }

  async getSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary> {
    const [journalRows, taskRows, knowledgeRows] = await Promise.all([
      this.database.journals
        .where("journalDate")
        .between(period.start, period.end, true, true)
        .toArray(),
      this.database.tasks.toArray(),
      this.database.knowledgeItems.toArray(),
    ]);
    const journals = journalRows.filter(
      (journal) => journal.deletedAt === null && journal.status === "active",
    );
    const knowledge = knowledgeRows.filter(
      (item) => item.deletedAt === null && item.status === "active",
    );
    const tags = await loadTagNames(
      this.database,
      journals.map((journal) => journal.id),
      knowledge.map((item) => item.id),
    );

    const source: AnalyticsSource = {
      journals: journals.map((journal) => ({
        id: journal.id,
        journalDate: journal.journalDate,
        title: journal.title,
        contentPlainText: journal.contentPlainText,
        tags: tags.journalTags.get(journal.id) ?? [],
        deletedAt: journal.deletedAt,
      })),
      tasks: taskRows.map((task) => ({
        id: task.id,
        status: task.status,
        completedAt: task.completedAt,
        deletedAt: task.deletedAt,
      })),
      knowledge: knowledge.map((item): AnalyticsKnowledgeSource => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        createdAt: item.createdAt,
        tags: tags.knowledgeTags.get(item.id) ?? [],
        deletedAt: item.deletedAt,
      })),
    };

    return buildAnalyticsSummary(source, period);
  }
}
