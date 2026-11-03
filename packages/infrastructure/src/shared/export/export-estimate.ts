import type { ExportDataset, ExportEstimate, ExportOptions } from "@dailyflow/application";

function selectedCount<T>(
  records: readonly T[],
  includeDeleted: boolean,
  deletedAt: (record: T) => string | null,
): number {
  return includeDeleted
    ? records.length
    : records.filter((record) => deletedAt(record) === null).length;
}

export function estimateExportDataset(
  dataset: ExportDataset,
  options: ExportOptions,
): ExportEstimate {
  const includeJournals = options.scope === "all" || options.scope === "journals";
  const includeKnowledge = options.scope === "all" || options.scope === "knowledge";
  const includeTasks = options.scope === "all" || options.scope === "tasks";
  const includeImports = options.scope === "all" || options.scope === "imports";
  const journals = includeJournals
    ? selectedCount(dataset.journals, options.includeDeleted, (record) => record.journal.deletedAt)
    : 0;
  const knowledge = includeKnowledge
    ? selectedCount(dataset.knowledge, options.includeDeleted, (record) => record.item.deletedAt)
    : 0;
  const tasks = includeTasks
    ? selectedCount(dataset.tasks, options.includeDeleted, (task) => task.deletedAt)
    : 0;
  const attachments =
    options.includeAttachments && options.scope === "all"
      ? selectedCount(
          dataset.attachments,
          options.includeDeleted,
          (record) => record.attachment.deletedAt,
        )
      : 0;
  const importSessions = includeImports ? dataset.imports.sessions.length : 0;
  const importEntries = includeImports ? dataset.imports.entries.length : 0;
  const entityCount =
    journals + knowledge + tasks + attachments + importSessions + importEntries;
  const dataBytes =
    dataset.attachments.reduce(
      (total, record) =>
        options.includeAttachments && options.scope === "all"
          ? total + record.bytes.byteLength
          : total,
      0,
    ) +
    (options.includeImportRawBytes
      ? dataset.imports.entries.reduce(
          (total, record) => total + (record.entry.rawBytes?.byteLength ?? 0),
          0,
        )
      : 0);
  const fileCount =
    journals +
    knowledge +
    attachments +
    (includeKnowledge ? 1 : 0) +
    (includeTasks ? 1 : 0) +
    (attachments > 0 ? 1 : 0) +
    (includeImports ? 2 + importEntries : 0) +
    2;

  return {
    entityCount,
    fileCount,
    estimatedBytes: dataBytes + entityCount * 512 + fileCount * 256,
  };
}
