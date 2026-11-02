import { PortError } from "@dailyflow/application";
import { z } from "zod";

import {
  JournalDtoSchema,
  JournalListQueryDtoSchema,
  JournalSaveStateDtoSchema,
  JournalSummaryPageDtoSchema,
  JournalVersionDtoSchema,
  JournalVersionSummaryPageDtoSchema,
  RestoreJournalVersionDtoSchema,
  SavedJournalSnapshotDtoSchema,
  SaveJournalSnapshotDtoSchema,
  SearchQueryDtoSchema,
  SearchResultPageDtoSchema,
  TAURI_COMMANDS,
  mapTauriError,
  type JournalDto,
  type JournalListQueryDto,
  type JournalSaveStateDto,
  type JournalSummaryDto,
  type JournalVersionDto,
  type JournalVersionSummaryDto,
  type RestoreJournalVersionDto,
  type SavedJournalSnapshotDto,
  type SaveJournalSnapshotDto,
  type SearchQueryDto,
  type SearchResultPageDto,
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

  async search(query: SearchQueryDto): Promise<SearchResultPageDto> {
    return this.request(
      TAURI_COMMANDS.searchQuery,
      { query },
      SearchResultPageDtoSchema,
      z.object({ query: SearchQueryDtoSchema }),
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
