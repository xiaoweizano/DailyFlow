import type { SearchHit } from "@dailyflow/application";

export function searchResultPath(result: SearchHit): string {
  switch (result.entityType) {
    case "journal":
      return result.localDate === null ? "/timeline" : `/journal/${result.localDate}`;
    case "knowledge_item":
      return `/knowledge/${result.entityId}`;
    case "task":
      return `/tasks?task=${result.entityId}`;
    case "structured_block":
      return result.localDate === null
        ? "/timeline"
        : `/journal/${result.localDate}?block=${result.entityId}`;
  }
}
