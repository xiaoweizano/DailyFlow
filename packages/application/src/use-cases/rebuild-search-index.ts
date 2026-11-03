import type { SearchEntityType } from "../ports/search-port.js";
import type { SearchPort, SearchRebuildOptions } from "../ports/search-port.js";

export interface RebuildSearchIndexDependencies {
  readonly search: SearchPort;
  readonly scope?: readonly SearchEntityType[];
  readonly signal?: AbortSignal;
  readonly onProgress?: SearchRebuildOptions["onProgress"];
}

export async function rebuildSearchIndex(dependencies: RebuildSearchIndexDependencies) {
  return dependencies.search.rebuild(dependencies.scope, {
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    ...(dependencies.onProgress === undefined ? {} : { onProgress: dependencies.onProgress }),
  });
}
