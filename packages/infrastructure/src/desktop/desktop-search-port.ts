import {
  PortError,
  type SearchPort,
  type SearchQuery,
  type SearchRebuildResult,
  type SearchResultPage,
} from "@dailyflow/application";

import type { TauriCommandClient } from "./tauri-client.js";
import type { SearchQueryDto } from "./tauri-contracts.js";

export interface DesktopSearchPortOptions {
  readonly client: TauriCommandClient;
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

  constructor(options: DesktopSearchPortOptions) {
    this.client = options.client;
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

  async rebuild(): Promise<SearchRebuildResult> {
    throw new PortError("STORAGE_UNAVAILABLE", {
      message: "Desktop search index rebuild is not available in this release",
      retryable: false,
    });
  }
}
