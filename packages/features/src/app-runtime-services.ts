import type { AppServices, TimelineQuery } from "@dailyflow/application";
import type { Clock, IdGenerator, LocalDate } from "@dailyflow/domain";
import { createUuidV7 } from "@dailyflow/shared";

import type { AppRuntimeServices } from "./app-services-context.js";
import { createAnalyticsRuntimeServices } from "./analytics/analytics-services.js";
import { createAttachmentRuntimeServices } from "./attachments/attachment-services.js";
import { EditorContentProjector } from "./journal/content-projector.js";
import { createJournalRuntimeServices } from "./journal/journal-services.js";
import { createKnowledgeRuntimeServices } from "./knowledge/knowledge-services.js";
import { createSaveLifecycle, type SaveLifecycle } from "./lifecycle/save-lifecycle.js";
import { createTaskRuntimeServices } from "./tasks/task-services.js";

export interface CreateAppRuntimeServicesOptions extends Pick<
  AppServices,
  "journals" | "knowledge" | "tasks" | "attachments" | "search" | "analytics" | "reports"
> {
  readonly timeline: TimelineQuery;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly lifecycle?: SaveLifecycle;
  readonly today?: () => LocalDate;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

const systemIds: IdGenerator = {
  nextId: createUuidV7,
};

function systemLocalDate(): LocalDate {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as LocalDate;
}

export function createAppRuntimeServices(
  options: CreateAppRuntimeServicesOptions,
): AppRuntimeServices {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? systemIds;
  const projector = new EditorContentProjector();

  return {
    analytics: createAnalyticsRuntimeServices({
      analytics: options.analytics,
      reports: options.reports,
      clock,
      ids,
    }),
    attachments: createAttachmentRuntimeServices({
      attachments: options.attachments,
    }),
    journal: createJournalRuntimeServices({
      journals: options.journals,
      projector,
      clock,
      ids,
    }),
    knowledge: createKnowledgeRuntimeServices({
      journals: options.journals,
      knowledge: options.knowledge,
      projector,
      clock,
      ids,
    }),
    search: options.search,
    lifecycle: options.lifecycle ?? createSaveLifecycle(),
    tasks: createTaskRuntimeServices({
      tasks: options.tasks,
      clock,
      today: options.today ?? systemLocalDate,
    }),
    timeline: options.timeline,
  };
}
