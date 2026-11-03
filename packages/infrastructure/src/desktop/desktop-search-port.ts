import {
  type SearchPort,
  type SearchQuery,
  type SearchRebuildResult,
  type SearchResultPage,
} from "@dailyflow/application";
import { createUuidV7 } from "@dailyflow/shared";

import type { TauriCommandClient } from "./tauri-client.js";
import {
  SEARCH_REBUILD_PROGRESS_EVENT,
  SearchRebuildProgressEventDtoSchema,
  type SearchQueryDto,
  type SearchRebuildProgressEventDto,
} from "./tauri-contracts.js";

export type TauriListen = <T>(event: string, handler: (payload: T) => void) => Promise<() => void>;

export interface DesktopSearchPortOptions {
  readonly client: TauriCommandClient;
  readonly listen?: TauriListen;
}

function toSearchQueryDto(query: SearchQuery): SearchQueryDto {
  return {
    text: query.text,
    ...(query.entityTypes === undefined ? {} : { entityTypes: [...query.entityTypes] }),
    ...(query.fromDate === undefined ? {} : { fromDate: query.fromDate }),
    ...(query.toDate === undefined ? {} : { toDate: query.toDate }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

export class DesktopSearchPort implements SearchPort {
  private readonly client: TauriCommandClient;
  private readonly listen: TauriListen | undefined;

  constructor(options: DesktopSearchPortOptions) {
    this.client = options.client;
    this.listen = options.listen;
  }

  async query(input: SearchQuery): Promise<SearchResultPage> {
    const page = await this.client.search(toSearchQueryDto(input));
    return {
      items: page.items.map((item) => ({
        entityType: item.entityType,
        entityId: item.entityId,
        title: item.title,
        snippet: item.snippet,
        localDate: item.localDate,
        score: item.score,
      })),
      nextCursor: page.nextCursor,
      indexState: page.indexState,
    };
  }

  async rebuild(
    scope?: Parameters<SearchPort["rebuild"]>[0],
    options?: Parameters<SearchPort["rebuild"]>[1],
  ): Promise<SearchRebuildResult> {
    const requestId = createUuidV7();
    let unlisten: (() => void) | undefined;
    if (options?.onProgress !== undefined && this.listen !== undefined) {
      unlisten = await this.listen<SearchRebuildProgressEventDto>(
        SEARCH_REBUILD_PROGRESS_EVENT,
        (payload) => {
          const event = SearchRebuildProgressEventDtoSchema.safeParse(payload);
          if (!event.success || event.data.requestId !== requestId) {
            return;
          }
          options.onProgress?.({
            phase: event.data.phase,
            processedCount: event.data.processedCount,
            totalCount: event.data.totalCount,
          });
        },
      );
    }
    const onAbort = (): void => {
      void this.client.cancelSearchRebuild(requestId).catch(() => undefined);
    };
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      return await this.client.rebuildSearch(requestId, scope);
    } finally {
      options?.signal?.removeEventListener("abort", onAbort);
      unlisten?.();
    }
  }
}
