import { PortError, type SearchEntityType } from "@dailyflow/application";
import { z } from "zod";

import {
  AttachmentDataDtoSchema,
  AttachmentPutCommandDtoSchema,
  AttachmentSoftDeleteOwnerLinksDtoSchema,
  AnalyticsPeriodQueryDtoSchema,
  AnalyticsSourceDtoSchema,
  BeginImportCommitDtoSchema,
  ExportSnapshotDtoSchema,
  ExportWriteFileInputDtoSchema,
  ExportWriteFileResultDtoSchema,
  ImportCommitBatchDtoSchema,
  ImportCommitSummaryDtoSchema,
  ImportEntryDtoSchema,
  ImportExistingMatchDtoSchema,
  ImportScanResultDtoSchema,
  ImportSessionDtoSchema,
  ImportTxtFileDtoSchema,
  JournalDtoSchema,
  JournalListQueryDtoSchema,
  JournalSaveStateDtoSchema,
  JournalSummaryPageDtoSchema,
  JournalVersionDtoSchema,
  JournalVersionSummaryPageDtoSchema,
  KnowledgeItemDtoSchema,
  KnowledgeListQueryDtoSchema,
  KnowledgePageDtoSchema,
  KnowledgeSaveCommandDtoSchema,
  KnowledgeSoftDeleteCommandDtoSchema,
  ReportDtoSchema,
  ReportPeriodQueryDtoSchema,
  ReportSaveCommandDtoSchema,
  RestoreJournalVersionDtoSchema,
  RecordImportFailureDtoSchema,
  SavedJournalSnapshotDtoSchema,
  SaveJournalSnapshotDtoSchema,
  SearchQueryDtoSchema,
  SearchRebuildResultDtoSchema,
  SearchResultPageDtoSchema,
  SearchEntityTypeSchema,
  StoredAttachmentDtoSchema,
  TAURI_COMMANDS,
  TaskCompleteCommandDtoSchema,
  TaskDtoSchema,
  TaskListQueryDtoSchema,
  TaskPageDtoSchema,
  TaskSaveCommandDtoSchema,
  TaskSoftDeleteCommandDtoSchema,
  TimelineCalendarQueryDtoSchema,
  TimelineDaySummaryDtoSchema,
  TimelineDaySummaryPageDtoSchema,
  TimelineListQueryDtoSchema,
  mapTauriError,
  type AttachmentDataDto,
  type AttachmentPutCommandDto,
  type AttachmentSoftDeleteOwnerLinksDto,
  type AnalyticsPeriodQueryDto,
  type AnalyticsSourceDto,
  type BeginImportCommitDto,
  type ExportSnapshotDto,
  type ExportWriteFileInputDto,
  type ExportWriteFileResultDto,
  type ImportCommitBatchDto,
  type ImportCommitSummaryDto,
  type ImportEntryDto,
  type ImportExistingMatchDto,
  type ImportScanResultDto,
  type ImportSessionDto,
  type ImportTxtFileDto,
  type RecordImportFailureDto,
  type JournalDto,
  type JournalListQueryDto,
  type JournalSaveStateDto,
  type JournalSummaryDto,
  type JournalVersionDto,
  type JournalVersionSummaryDto,
  type KnowledgeItemDto,
  type KnowledgeListQueryDto,
  type KnowledgeSaveCommandDto,
  type KnowledgeSoftDeleteCommandDto,
  type ReportDto,
  type ReportPeriodQueryDto,
  type ReportSaveCommandDto,
  type RestoreJournalVersionDto,
  type SavedJournalSnapshotDto,
  type SaveJournalSnapshotDto,
  type SearchQueryDto,
  type SearchRebuildResultDto,
  type SearchResultPageDto,
  type StoredAttachmentDto,
  type TaskCompleteCommandDto,
  type TaskDto,
  type TaskListQueryDto,
  type TaskSaveCommandDto,
  type TaskSoftDeleteCommandDto,
  type TimelineCalendarQueryDto,
  type TimelineDaySummaryDto,
  type TimelineListQueryDto,
} from "./tauri-contracts.js";

export type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

interface TauriInternals {
  readonly invoke: TauriInvoke;
}

type TauriGlobal = typeof globalThis & {
  readonly __TAURI_INTERNALS__?: TauriInternals;
};

export type TauriPage<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};

export const invokeTauriBridge: TauriInvoke = (command, args) => {
  const internals = (globalThis as TauriGlobal).__TAURI_INTERNALS__;
  if (internals === undefined) {
    throw new PortError("STORAGE_UNAVAILABLE", {
      message: "Tauri IPC is not available in this runtime",
      retryable: false,
    });
  }

  return internals.invoke(command, args);
};

export class TauriCommandClient {
  constructor(private readonly invoke: TauriInvoke = invokeTauriBridge) {}

  async getJournalByDate(journalDate: string): Promise<JournalDto | null> {
    return this.request(
      TAURI_COMMANDS.journalGetByDate,
      { journalDate },
      JournalDtoSchema.nullable(),
    );
  }

  async getJournalById(journalId: string): Promise<JournalDto | null> {
    return this.request(TAURI_COMMANDS.journalGetById, { journalId }, JournalDtoSchema.nullable());
  }

  async getJournalSaveState(journalId: string): Promise<JournalSaveStateDto | null> {
    return this.request(
      TAURI_COMMANDS.journalGetSaveState,
      { journalId },
      JournalSaveStateDtoSchema.nullable(),
    );
  }

  async listJournalSummaries(query: JournalListQueryDto): Promise<TauriPage<JournalSummaryDto>> {
    return this.request(
      TAURI_COMMANDS.journalListSummaries,
      { query },
      JournalSummaryPageDtoSchema,
      z.object({ query: JournalListQueryDtoSchema }),
    );
  }

  async saveJournalSnapshot(input: SaveJournalSnapshotDto): Promise<SavedJournalSnapshotDto> {
    return this.request(
      TAURI_COMMANDS.journalSaveSnapshot,
      { input },
      SavedJournalSnapshotDtoSchema,
      z.object({ input: SaveJournalSnapshotDtoSchema }),
    );
  }

  async listJournalVersions(
    journalId: string,
    limit?: number,
    cursor?: string,
  ): Promise<TauriPage<JournalVersionSummaryDto>> {
    const args: Record<string, unknown> = { journalId };
    if (limit !== undefined) {
      args.limit = limit;
    }
    if (cursor !== undefined) {
      args.cursor = cursor;
    }

    return this.request(
      TAURI_COMMANDS.journalListVersions,
      args,
      JournalVersionSummaryPageDtoSchema,
    );
  }

  async getJournalVersion(journalId: string, revision: number): Promise<JournalVersionDto | null> {
    return this.request(
      TAURI_COMMANDS.journalGetVersion,
      { journalId, revision },
      JournalVersionDtoSchema.nullable(),
    );
  }

  async restoreJournalVersion(input: RestoreJournalVersionDto): Promise<SavedJournalSnapshotDto> {
    return this.request(
      TAURI_COMMANDS.journalRestoreVersion,
      { input },
      SavedJournalSnapshotDtoSchema,
      z.object({ input: RestoreJournalVersionDtoSchema }),
    );
  }

  async softDeleteJournal(
    journalId: string,
    expectedRevision: number,
    deletedAt: string,
  ): Promise<void> {
    await this.request(
      TAURI_COMMANDS.journalSoftDelete,
      { journalId, expectedRevision, deletedAt },
      z.union([z.null(), z.undefined()]),
    );
  }

  async getTaskById(taskId: string): Promise<TaskDto | null> {
    return this.request(TAURI_COMMANDS.taskGetById, { taskId }, TaskDtoSchema.nullable());
  }

  async listTasks(query: TaskListQueryDto): Promise<TauriPage<TaskDto>> {
    return this.request(
      TAURI_COMMANDS.taskList,
      { query },
      TaskPageDtoSchema,
      z.object({ query: TaskListQueryDtoSchema }),
    );
  }

  async saveTask(input: TaskSaveCommandDto): Promise<TaskDto> {
    return this.request(
      TAURI_COMMANDS.taskSave,
      { input },
      TaskDtoSchema,
      z.object({ input: TaskSaveCommandDtoSchema }),
    );
  }

  async completeTask(input: TaskCompleteCommandDto): Promise<TaskDto> {
    return this.request(
      TAURI_COMMANDS.taskComplete,
      { input },
      TaskDtoSchema,
      z.object({ input: TaskCompleteCommandDtoSchema }),
    );
  }

  async softDeleteTask(input: TaskSoftDeleteCommandDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.taskSoftDelete,
      input,
      z.union([z.null(), z.undefined()]),
      TaskSoftDeleteCommandDtoSchema,
    );
  }

  async getKnowledgeById(knowledgeItemId: string): Promise<KnowledgeItemDto | null> {
    return this.request(
      TAURI_COMMANDS.knowledgeGetById,
      { knowledgeItemId },
      KnowledgeItemDtoSchema.nullable(),
    );
  }

  async listKnowledge(query: KnowledgeListQueryDto): Promise<TauriPage<KnowledgeItemDto>> {
    return this.request(
      TAURI_COMMANDS.knowledgeList,
      { query },
      KnowledgePageDtoSchema,
      z.object({ query: KnowledgeListQueryDtoSchema }),
    );
  }

  async saveKnowledge(input: KnowledgeSaveCommandDto): Promise<KnowledgeItemDto> {
    return this.request(
      TAURI_COMMANDS.knowledgeSave,
      { input },
      KnowledgeItemDtoSchema,
      z.object({ input: KnowledgeSaveCommandDtoSchema }),
    );
  }

  async softDeleteKnowledge(input: KnowledgeSoftDeleteCommandDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.knowledgeSoftDelete,
      input,
      z.union([z.null(), z.undefined()]),
      KnowledgeSoftDeleteCommandDtoSchema,
    );
  }

  async getTimelineCalendar(
    query: TimelineCalendarQueryDto,
  ): Promise<readonly TimelineDaySummaryDto[]> {
    return this.request(
      TAURI_COMMANDS.timelineGetCalendar,
      { query },
      z.array(TimelineDaySummaryDtoSchema),
      z.object({ query: TimelineCalendarQueryDtoSchema }),
    );
  }

  async listTimelineEntries(
    query: TimelineListQueryDto,
  ): Promise<TauriPage<TimelineDaySummaryDto>> {
    return this.request(
      TAURI_COMMANDS.timelineListEntries,
      { query },
      TimelineDaySummaryPageDtoSchema,
      z.object({ query: TimelineListQueryDtoSchema }),
    );
  }

  async getAnalyticsSource(query: AnalyticsPeriodQueryDto): Promise<AnalyticsSourceDto> {
    return this.request(
      TAURI_COMMANDS.analyticsGetSource,
      { query },
      AnalyticsSourceDtoSchema,
      z.object({ query: AnalyticsPeriodQueryDtoSchema }),
    );
  }

  async getReportByPeriod(query: ReportPeriodQueryDto): Promise<ReportDto | null> {
    return this.request(
      TAURI_COMMANDS.reportGetByPeriod,
      { query },
      ReportDtoSchema.nullable(),
      z.object({ query: ReportPeriodQueryDtoSchema }),
    );
  }

  async saveReport(input: ReportSaveCommandDto): Promise<ReportDto> {
    return this.request(
      TAURI_COMMANDS.reportSave,
      { input },
      ReportDtoSchema,
      z.object({ input: ReportSaveCommandDtoSchema }),
    );
  }

  async search(query: SearchQueryDto): Promise<SearchResultPageDto> {
    return this.request(
      TAURI_COMMANDS.searchQuery,
      { query },
      SearchResultPageDtoSchema,
      z.object({ query: SearchQueryDtoSchema }),
    );
  }

  async rebuildSearch(scope?: readonly SearchEntityType[]): Promise<SearchRebuildResultDto> {
    return this.request(
      TAURI_COMMANDS.searchRebuild,
      scope === undefined ? {} : { scope },
      SearchRebuildResultDtoSchema,
      z.object({
        scope: z.array(SearchEntityTypeSchema).optional(),
      }),
    );
  }

  async putAttachment(input: AttachmentPutCommandDto): Promise<StoredAttachmentDto> {
    return this.request(
      TAURI_COMMANDS.attachmentPut,
      { input },
      StoredAttachmentDtoSchema,
      z.object({ input: AttachmentPutCommandDtoSchema }),
    );
  }

  async readAttachment(attachmentId: string): Promise<AttachmentDataDto> {
    return this.request(TAURI_COMMANDS.attachmentRead, { attachmentId }, AttachmentDataDtoSchema);
  }

  async softDeleteAttachmentOwnerLinks(input: AttachmentSoftDeleteOwnerLinksDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.attachmentSoftDeleteOwnerLinks,
      input,
      z.union([z.null(), z.undefined()]),
      AttachmentSoftDeleteOwnerLinksDtoSchema,
    );
  }

  async removeOrphanAttachment(attachmentId: string): Promise<void> {
    await this.request(
      TAURI_COMMANDS.attachmentRemoveOrphan,
      { attachmentId },
      z.union([z.null(), z.undefined()]),
    );
  }

  async scanTxtImport(rootPath: string): Promise<ImportScanResultDto> {
    return this.request(TAURI_COMMANDS.importScanTxt, { rootPath }, ImportScanResultDtoSchema);
  }

  async readTxtImport(rootPath: string, relativePath: string): Promise<ImportTxtFileDto> {
    return this.request(
      TAURI_COMMANDS.importReadTxt,
      { rootPath, relativePath },
      ImportTxtFileDtoSchema,
      z.object({ rootPath: z.string().min(1), relativePath: z.string().min(1) }),
    );
  }

  async createImportSession(input: ImportSessionDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.importCreateSession,
      { input },
      z.union([z.null(), z.undefined()]),
      z.object({ input: ImportSessionDtoSchema }),
    );
  }

  async saveImportPreview(input: ImportSessionDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.importSavePreview,
      { input },
      z.union([z.null(), z.undefined()]),
      z.object({ input: ImportSessionDtoSchema }),
    );
  }

  async findImportExistingMatches(
    entries: readonly ImportEntryDto[],
  ): Promise<readonly ImportExistingMatchDto[]> {
    return this.request(
      TAURI_COMMANDS.importFindExistingMatches,
      { entries },
      z.array(ImportExistingMatchDtoSchema),
      z.object({ entries: z.array(ImportEntryDtoSchema) }),
    );
  }

  async beginImportCommit(input: BeginImportCommitDto): Promise<ImportSessionDto> {
    return this.request(
      TAURI_COMMANDS.importBeginCommit,
      { input },
      ImportSessionDtoSchema,
      z.object({ input: BeginImportCommitDtoSchema }),
    );
  }

  async commitImportBatch(input: ImportCommitBatchDto): Promise<ImportCommitSummaryDto> {
    return this.request(
      TAURI_COMMANDS.importCommitBatch,
      { input },
      ImportCommitSummaryDtoSchema,
      z.object({ input: ImportCommitBatchDtoSchema }),
    );
  }

  async recordImportFailure(input: RecordImportFailureDto): Promise<void> {
    await this.request(
      TAURI_COMMANDS.importRecordFailure,
      { input },
      z.union([z.null(), z.undefined()]),
      z.object({ input: RecordImportFailureDtoSchema }),
    );
  }

  async exportSnapshot(): Promise<ExportSnapshotDto> {
    return this.request(TAURI_COMMANDS.exportSnapshot, {}, ExportSnapshotDtoSchema);
  }

  async writeExportFile(
    input: ExportWriteFileInputDto,
  ): Promise<ExportWriteFileResultDto> {
    return this.request(
      TAURI_COMMANDS.exportWriteFile,
      { input },
      ExportWriteFileResultDtoSchema,
      z.object({ input: ExportWriteFileInputDtoSchema }),
    );
  }

  private async request<S extends z.ZodTypeAny>(
    command: string,
    args: Record<string, unknown>,
    schema: S,
    requestSchema?: z.ZodTypeAny,
  ): Promise<z.output<S>> {
    try {
      const requestArgs = (
        requestSchema === undefined ? args : requestSchema.parse(args)
      ) as Record<string, unknown>;

      try {
        const response = await this.invoke(command, requestArgs);
        return schema.parse(response);
      } catch (error) {
        throw mapTauriError(error);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PortError("VALIDATION_ERROR", {
          message: "Desktop storage request is invalid",
          fields: Object.fromEntries(
            error.issues.map((issue) => [
              issue.path.length === 0 ? "_root" : issue.path.join("."),
              issue.message,
            ]),
          ),
        });
      }

      throw error;
    }
  }
}
