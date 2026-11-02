import type { AppServices } from "@dailyflow/application";
import type { Clock, IdGenerator } from "@dailyflow/domain";
import { createUuidV7 } from "@dailyflow/shared";

import type { AppRuntimeServices } from "./app-services-context.js";
import { createAttachmentRuntimeServices } from "./attachments/attachment-services.js";
import { EditorContentProjector } from "./journal/content-projector.js";
import { createJournalRuntimeServices } from "./journal/journal-services.js";
import { createSaveLifecycle, type SaveLifecycle } from "./lifecycle/save-lifecycle.js";

export interface CreateAppRuntimeServicesOptions extends Pick<
  AppServices,
  "journals" | "attachments" | "search"
> {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly lifecycle?: SaveLifecycle;
}

const systemClock: Clock = {
  nowUtc: () => new Date().toISOString(),
};

const systemIds: IdGenerator = {
  nextId: createUuidV7,
};

export function createAppRuntimeServices(
  options: CreateAppRuntimeServicesOptions,
): AppRuntimeServices {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? systemIds;

  return {
    attachments: createAttachmentRuntimeServices({
      attachments: options.attachments,
    }),
    journal: createJournalRuntimeServices({
      journals: options.journals,
      projector: new EditorContentProjector(),
      clock,
      ids,
    }),
    search: options.search,
    lifecycle: options.lifecycle ?? createSaveLifecycle(),
  };
}
