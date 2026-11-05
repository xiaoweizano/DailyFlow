import type { JournalLookup, SavedJournalSnapshot } from "@dailyflow/application";
import type { JsonObject } from "@dailyflow/domain";
import type { AttachmentAttrs } from "@dailyflow/editor";
import { Button, Input, SaveStatus, type SaveState } from "@dailyflow/ui";
import type { AppError } from "@dailyflow/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import { History, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { useAppServices } from "../app-services-hooks.js";
import { useUserPreferences } from "../preferences/use-user-preferences.js";
import { AttachmentUploadPlaceholder } from "./attachment-node-view.js";
import { EditorToolbar } from "./editor-toolbar.js";
import { createJournalEditorExtensions } from "./journal-editor-extensions.js";
import { createJournalEditorStore, type JournalEditorStore } from "./journal-editor-store.js";
import { HistoryPanel } from "./history-panel.js";
import { SaveCoordinator, type SaveCoordinatorStatus } from "./save-coordinator.js";

interface JournalDraft {
  readonly title: string;
  readonly contentJson: JsonObject;
  readonly tags: readonly string[];
}

export interface JournalEditorProps {
  readonly lookup: JournalLookup;
  readonly onRestored: (snapshot: SavedJournalSnapshot) => void;
}

function toSaveState(status: SaveCoordinatorStatus): SaveState {
  return status === "conflict" ? "error" : status;
}

function parseTags(value: string): readonly string[] {
  return value
    .split(/[,，]/u)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function attachmentErrorMessage(error: AppError): string {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return Object.values(error.fields ?? {})[0] ?? "文件类型或大小不符合要求";
    case "NOT_FOUND":
      return "日志尚未保存，暂时无法添加附件";
    case "CONFLICT":
      return "日志已在其他位置更新，请先保存当前内容";
    case "STORAGE_UNAVAILABLE":
      return "附件存储暂时不可用";
    case "QUOTA_EXCEEDED":
      return "存储空间不足";
    default:
      return "附件上传失败";
  }
}

interface AttachmentUploadFailure {
  readonly file: File;
  readonly message: string;
}

export function JournalEditor({ lookup, onRestored }: JournalEditorProps): React.JSX.Element {
  const services = useAppServices();
  const { preferences } = useUserPreferences();
  const { journal, isPersisted } = lookup;
  const [title, setTitle] = useState(journal.title);
  const [tagsText, setTagsText] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentFailure, setAttachmentFailure] = useState<AttachmentUploadFailure | null>(null);
  const titleRef = useRef(title);
  const tagsTextRef = useRef(tagsText);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const storeRef = useRef<JournalEditorStore | null>(null);
  const lifecycleMountsRef = useRef(0);

  if (storeRef.current === null) {
    storeRef.current = createJournalEditorStore(isPersisted ? journal.revision : 0);
  }

  const store = storeRef.current;
  const saveStatus = useStore(store, (state) => state.saveStatus);
  const savedAt = useStore(store, (state) => state.savedAt);
  const expectedRevision = useStore(store, (state) => state.expectedRevision);
  const historyOpen = useStore(store, (state) => state.historyOpen);

  const coordinatorRef = useRef<SaveCoordinator<JournalDraft, SavedJournalSnapshot> | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = new SaveCoordinator<JournalDraft, SavedJournalSnapshot>({
      debounceMs: preferences.autosaveIntervalMs,
      save: (draft, reason) =>
        services.journal.save({
          journalId: journal.id,
          journalDate: journal.journalDate,
          timezone: journal.timezone,
          title: draft.title,
          contentJson: draft.contentJson,
          editorSchemaVersion: journal.content.schemaVersion,
          projectionVersion: journal.projectionVersion,
          expectedRevision: store.getState().expectedRevision,
          checkpoint: reason,
          tags: draft.tags,
        }),
    });
  }
  const coordinator = coordinatorRef.current;

  function currentDraft(): JournalDraft {
    return {
      title: titleRef.current,
      contentJson: (editorRef.current?.getJSON() ?? journal.content.doc) as JsonObject,
      tags: parseTags(tagsTextRef.current),
    };
  }

  async function flushNow(): Promise<boolean> {
    await coordinator.flush();
    const state = coordinator.getState();
    return state.draft === null && state.status !== "error" && state.status !== "conflict";
  }

  const editor = useEditor({
    extensions: createJournalEditorExtensions(),
    content: journal.content.doc,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "日志正文",
        "aria-multiline": "true",
        class: "df-journal-prosemirror",
      },
    },
    onUpdate: () => {
      coordinator.update(currentDraft());
    },
  });
  editorRef.current = editor;

  async function uploadAttachment(file: File): Promise<void> {
    if (editor === null) {
      return;
    }

    setAttachmentBusy(true);
    setAttachmentFailure(null);
    const mimeType = file.type || "application/octet-stream";
    const isInline = mimeType.startsWith("image/");

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await services.attachments.add({
        ownerType: "journal",
        ownerId: journal.id,
        displayName: file.name,
        mimeType,
        bytes,
        altText: file.name,
        isInline,
      });

      if (!result.ok) {
        setAttachmentFailure({
          file,
          message: attachmentErrorMessage(result.error),
        });
        return;
      }

      const attrs: AttachmentAttrs = {
        attachmentId: result.value.attachment.id,
        displayName: result.value.attachment.displayName,
        mimeType: result.value.attachment.mimeType,
        byteSize: result.value.attachment.byteSize,
        isInline: result.value.attachment.isInline,
        altText: result.value.attachment.altText,
      };
      editor.chain().focus().insertContent({ type: "attachment", attrs }).run();
    } catch {
      setAttachmentFailure({
        file,
        message: "无法读取或保存附件",
      });
    } finally {
      setAttachmentBusy(false);
    }
  }

  useEffect(() => {
    coordinator.setDebounceMs(preferences.autosaveIntervalMs);
  }, [coordinator, preferences.autosaveIntervalMs]);

  useEffect(() => {
    return coordinator.subscribe((state) => {
      store
        .getState()
        .setSaveState(state.status, state.saved?.savedAt ?? state.savedAt, state.error);
      if (state.status === "saved" && state.saved !== null) {
        store.getState().setExpectedRevision(state.saved.revision);
      }
    });
  }, [coordinator, store]);

  useEffect(() => {
    lifecycleMountsRef.current += 1;
    const unregister = services.lifecycle.register(flushNow);
    return () => {
      unregister();
      lifecycleMountsRef.current -= 1;
      void coordinator.flush().finally(() => {
        queueMicrotask(() => {
          if (lifecycleMountsRef.current === 0) {
            coordinator.dispose();
          }
        });
      });
    };
  }, [coordinator, services.lifecycle]);

  useEffect(() => {
    const flush = (): void => {
      void coordinator.flush();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (coordinator.getState().draft !== null) {
        flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [coordinator]);

  function handleTitleChange(value: string): void {
    titleRef.current = value;
    setTitle(value);
    coordinator.update(currentDraft());
  }

  function handleTagsChange(value: string): void {
    tagsTextRef.current = value;
    setTagsText(value);
    coordinator.update(currentDraft());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void coordinator.flush("explicit");
    }
  }

  return (
    <section
      aria-label="日志编辑器"
      className="flex h-full min-h-0 flex-col bg-surface"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-32 flex-1">
          <Input
            aria-label="日志标题"
            value={title}
            maxLength={200}
            placeholder="给这篇日志一个标题"
            className="h-8 border-transparent bg-transparent px-1 text-base font-semibold shadow-none hover:border-border focus:border-primary"
            onChange={(event) => handleTitleChange(event.currentTarget.value)}
          />
        </div>
        <SaveStatus status={toSaveState(saveStatus)} {...(savedAt === null ? {} : { savedAt })} />
        <Button
          variant="ghost"
          size="sm"
          aria-label="立即保存"
          onClick={() => {
            void coordinator.flush("explicit");
          }}
        >
          <Save aria-hidden="true" className="size-4" />
          <span className="max-[719px]:sr-only">保存</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={historyOpen}
          onClick={() => store.getState().setHistoryOpen(!historyOpen)}
        >
          <History aria-hidden="true" className="size-4" />
          历史
        </Button>
      </div>

      <div className="df-journal-editor-body flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {editor === null ? (
            <p className="p-6 text-sm text-muted-foreground">正在初始化编辑器</p>
          ) : (
            <>
              <EditorToolbar
                editor={editor}
                attachmentBusy={attachmentBusy}
                onAttach={(file) => {
                  void uploadAttachment(file);
                }}
              />
              {attachmentBusy ? (
                <p role="status" className="mx-3 mt-2 text-xs text-muted-foreground">
                  正在上传附件
                </p>
              ) : null}
              {attachmentFailure === null ? null : (
                <div className="mt-2">
                  <AttachmentUploadPlaceholder
                    fileName={attachmentFailure.file.name}
                    errorMessage={attachmentFailure.message}
                    onRetry={() => {
                      void uploadAttachment(attachmentFailure.file);
                    }}
                    onDismiss={() => setAttachmentFailure(null)}
                  />
                </div>
              )}
              <div className="df-journal-editor-scroll min-h-0 flex-1 overflow-y-auto">
                <EditorContent editor={editor} className="min-h-full" />
              </div>
            </>
          )}
          <div className="shrink-0 border-t border-border px-4 py-2">
            <label
              htmlFor="journal-tags"
              className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground"
            >
              Tags
            </label>
            <Input
              id="journal-tags"
              aria-label="日志标签"
              value={tagsText}
              placeholder="用逗号分隔标签"
              className="h-8 border-transparent bg-surface-muted shadow-none"
              onChange={(event) => handleTagsChange(event.currentTarget.value)}
            />
          </div>
        </div>

        {historyOpen ? (
          <HistoryPanel
            journalId={journal.id}
            currentRevision={expectedRevision ?? journal.revision}
            onRestored={onRestored}
            onClose={() => store.getState().setHistoryOpen(false)}
          />
        ) : null}
      </div>
    </section>
  );
}
