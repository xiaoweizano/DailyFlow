import {
  addAttachment,
  DEFAULT_ATTACHMENT_POLICY,
  type AttachmentPolicy,
  type AttachmentStore,
  type StoredAttachment,
} from "@dailyflow/application";
import type { EntityId } from "@dailyflow/domain";
import type { AppError, Result } from "@dailyflow/shared";

export interface AttachmentRuntimeDependencies {
  readonly attachments: AttachmentStore;
  readonly policy?: AttachmentPolicy;
}

export interface AttachmentRuntimeServices {
  readonly add: (input: unknown) => Promise<Result<StoredAttachment, AppError>>;
  readonly read: (attachmentId: EntityId) => Promise<Uint8Array>;
}

export function createAttachmentRuntimeServices(
  dependencies: AttachmentRuntimeDependencies,
): AttachmentRuntimeServices {
  return {
    add: (input) =>
      addAttachment(
        {
          attachments: dependencies.attachments,
          policy: dependencies.policy ?? DEFAULT_ATTACHMENT_POLICY,
        },
        input,
      ),
    read: (attachmentId) => dependencies.attachments.read(attachmentId),
  };
}
