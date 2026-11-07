import type { JournalLookup, SavedJournalSnapshot } from "@dailyflow/application";
import type { EntityId, JsonObject, KnowledgeItem } from "@dailyflow/domain";
import {
  CURRENT_EDITOR_SCHEMA_VERSION,
  documentFromEditorContent,
  editorContentFromDocument,
  jsonToPlainText,
  migrateDocument,
  type AttachmentAttrs,
  type TiptapJsonNode,
} from "@dailyflow/editor";
import { Button, Input, SaveStatus, type SaveState } from "@dailyflow/ui";
import type { AppError } from "@dailyflow/shared";
import { EditorContent, useEditor } from "@tiptap/react";
import { BookPlus, History, LayoutTemplate, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "zustand";

import { useAppServices } from "../app-services-hooks.js";
import { getSaveStatusLabels, useAppText, type AppText } from "../preferences/use-app-text.js";
import { useUserPreferences } from "../preferences/use-user-preferences.js";
import { AttachmentUploadPlaceholder } from "./attachment-node-view.js";
import { EditorOutline } from "./editor-outline.js";
import { EditorToolbar } from "./editor-toolbar.js";
import { createJournalEditorExtensions } from "./journal-editor-extensions.js";
import { createJournalEditorStore, type JournalEditorStore } from "./journal-editor-store.js";
import { HistoryPanel } from "./history-panel.js";
import { JournalImportExport } from "./journal-import-export.js";
import { JournalTemplatePicker } from "./journal-template-picker.js";
import { journalTemplateEditorContent, type JournalTemplate } from "./journal-templates.js";
import { SaveCoordinator, type SaveCoordinatorStatus } from "./save-coordinator.js";
import { SlashCommandMenu, TableEditingToolbar } from "./slash-command.js";
import { KnowledgePromotionDialog } from "../knowledge/knowledge-promotion-dialog.js";
import { NodeSelection } from "@tiptap/pm/state";

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

function attachmentErrorMessage(error: AppError, text: AppText): string {
  switch (error.code) {
    case "VALIDATION_ERROR":
      return (
        Object.values(error.fields ?? {})[0] ??
        text("文件类型或大小不符合要求", "The file type or size is not supported")
      );
    case "NOT_FOUND":
      return text("日志尚未保存，暂时无法添加附件", "Save the journal before adding attachments");
    case "CONFLICT":
      return text(
        "日志已在其他位置更新，请先保存当前内容",
        "The journal changed elsewhere. Save the current draft first.",
      );
    case "STORAGE_UNAVAILABLE":
      return text("附件存储暂时不可用", "Attachment storage is temporarily unavailable");
    case "QUOTA_EXCEEDED":
      return text("存储空间不足", "There is not enough storage space");
    default:
      return text("附件上传失败", "Attachment upload failed");
  }
}

interface AttachmentUploadFailure {
  readonly file: File;
  readonly message: string;
}

export function JournalEditor({ lookup, onRestored }: JournalEditorProps): React.JSX.Element {
  const services = useAppServices();
  const text = useAppText();
  const { preferences } = useUserPreferences();
  const { journal, isPersisted } = lookup;
  const [title, setTitle] = useState(journal.title);
  const [tagsText, setTagsText] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentFailure, setAttachmentFailure] = useState<AttachmentUploadFailure | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<EntityId | null>(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionBlockId, setPromotionBlockId] = useState<EntityId | null>(null);
  const [promotedItem, setPromotedItem] = useState<KnowledgeItem | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const titleRef = useRef(title);
  const tagsTextRef = useRef(tagsText);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const storeRef = useRef<JournalEditorStore | null>(null);
  const lifecycleMountsRef = useRef(0);
  const [initialEditorContent] = useState<TiptapJsonNode>(() =>
    editorContentFromDocument(
      migrateDocument(journal.content.doc as TiptapJsonNode, journal.content.schemaVersion).doc,
    ),
  );
  const [currentMarkdown, setCurrentMarkdown] = useState(() =>
    jsonToPlainText(initialEditorContent),
  );
  const startsEmpty =
    !isPersisted && title.trim().length === 0 && currentMarkdown.trim().length === 0;
  const [initialTemplateChoicePending, setInitialTemplateChoicePending] = useState(startsEmpty);

  if (storeRef.current === null) {
    storeRef.current = createJournalEditorStore(isPersisted ? journal.revision : 0);
  }

  const store = storeRef.current;
  const saveStatus = useStore(store, (state) => state.saveStatus);
  const savedAt = useStore(store, (state) => state.savedAt);
  const expectedRevision = useStore(store, (state) => state.expectedRevision);
  const historyOpen = useStore(store, (state) => state.historyOpen);
  const canPromoteJournal = isPersisted || expectedRevision !== null;

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
          editorSchemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
          projectionVersion: journal.projectionVersion,
          expectedRevision: store.getState().expectedRevision,
          checkpoint: reason,
          tags: draft.tags,
        }),
    });
  }
  const coordinator = coordinatorRef.current;

  function currentDraft(): JournalDraft {
    const editorContent = editorRef.current?.getJSON() ?? initialEditorContent;
    return {
      title: titleRef.current,
      contentJson: documentFromEditorContent(editorContent as TiptapJsonNode),
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
    content: initialEditorContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": text("日志正文", "Journal content"),
        "aria-multiline": "true",
        class: "df-journal-prosemirror",
      },
    },
    onUpdate: () => {
      const editorContent = editor?.getJSON() as TiptapJsonNode | undefined;
      if (editorContent !== undefined) {
        setCurrentMarkdown(jsonToPlainText(editorContent));
      }
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
          message: attachmentErrorMessage(result.error, text),
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
        message: text("无法读取或保存附件", "The attachment could not be read or saved"),
      });
    } finally {
      setAttachmentBusy(false);
    }
  }

  useEffect(() => {
    coordinator.setDebounceMs(preferences.autosaveIntervalMs);
  }, [coordinator, preferences.autosaveIntervalMs]);

  useEffect(() => {
    if (editor === null) {
      return;
    }

    const refreshSelectedBlock = (): void => {
      const selection = editor.state.selection;
      const candidate =
        selection instanceof NodeSelection && selection.node.type.name === "structuredBlock"
          ? selection.node.attrs.id
          : null;
      setSelectedBlockId(typeof candidate === "string" ? (candidate as EntityId) : null);
    };

    refreshSelectedBlock();
    editor.on("selectionUpdate", refreshSelectedBlock);
    editor.on("update", refreshSelectedBlock);
    return () => {
      editor.off("selectionUpdate", refreshSelectedBlock);
      editor.off("update", refreshSelectedBlock);
    };
  }, [editor]);

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

  function applyTemplate(template: JournalTemplate | null): void {
    setInitialTemplateChoicePending(false);
    setTemplatePickerOpen(false);
    if (template === null || editor === null) {
      return;
    }

    const content = journalTemplateEditorContent(template);
    editor.commands.setContent(content, { emitUpdate: false });
    setCurrentMarkdown(jsonToPlainText(content));
    coordinator.update(currentDraft());
    void coordinator.flush("explicit");
  }

  if (initialTemplateChoicePending || templatePickerOpen) {
    return (
      <section
        aria-label={text("日志编辑器", "Journal editor")}
        className="flex h-full min-h-0 flex-col bg-surface"
        onKeyDown={handleKeyDown}
      >
        <JournalTemplatePicker
          onSelect={applyTemplate}
          {...(initialTemplateChoicePending ? {} : { onClose: () => setTemplatePickerOpen(false) })}
        />
      </section>
    );
  }

  return (
    <section
      aria-label={text("日志编辑器", "Journal editor")}
      className="flex h-full min-h-0 flex-col bg-surface"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-32 flex-1">
          <Input
            aria-label={text("日志标题", "Journal title")}
            value={title}
            maxLength={200}
            placeholder={text("给这篇日志一个标题", "Give this journal a title")}
            className="h-8 border-transparent bg-transparent px-1 text-base font-semibold shadow-none hover:border-border focus:border-primary"
            onChange={(event) => handleTitleChange(event.currentTarget.value)}
          />
        </div>
        <SaveStatus
          status={toSaveState(saveStatus)}
          labels={getSaveStatusLabels(text)}
          {...(savedAt === null ? {} : { savedAt })}
        />
        <Button variant="secondary" size="sm" onClick={() => setTemplatePickerOpen(true)}>
          <LayoutTemplate aria-hidden="true" className="size-4" />
          {text("模板", "Template")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={text("立即保存", "Save now")}
          onClick={() => {
            void coordinator.flush("explicit");
          }}
        >
          <Save aria-hidden="true" className="size-4" />
          <span className="max-[719px]:sr-only">{text("保存", "Save")}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={historyOpen}
          onClick={() => store.getState().setHistoryOpen(!historyOpen)}
        >
          <History aria-hidden="true" className="size-4" />
          {text("历史", "History")}
        </Button>
        {canPromoteJournal ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPromotionBlockId(null);
              setPromotionOpen(true);
            }}
          >
            <BookPlus aria-hidden="true" className="size-4" />
            {text("沉淀整篇日志", "Save journal to knowledge")}
          </Button>
        ) : null}
        {selectedBlockId === null || !canPromoteJournal ? null : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPromotionBlockId(selectedBlockId);
              setPromotionOpen(true);
            }}
          >
            <BookPlus aria-hidden="true" className="size-4" />
            {text("沉淀当前块", "Save current block")}
          </Button>
        )}
        {promotedItem === null ? null : (
          <Link
            to={`/knowledge/${promotedItem.id}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            {text("打开知识项", "Open knowledge item")}
          </Link>
        )}
        <JournalImportExport editor={editor} />
      </div>

      <div className="df-journal-editor-body flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {editor === null ? (
            <p className="p-6 text-sm text-muted-foreground">
              {text("正在初始化编辑器", "Initializing editor")}
            </p>
          ) : (
            <>
              <EditorToolbar
                editor={editor}
                attachmentBusy={attachmentBusy}
                onAttach={(file) => {
                  void uploadAttachment(file);
                }}
              />
              <TableEditingToolbar editor={editor} />
              {attachmentBusy ? (
                <p role="status" className="mx-3 mt-2 text-xs text-muted-foreground">
                  {text("正在上传附件", "Uploading attachment")}
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
                <SlashCommandMenu
                  editor={editor}
                  onImageUpload={(file) => {
                    void uploadAttachment(file);
                  }}
                />
              </div>
            </>
          )}
          <div className="shrink-0 border-t border-border px-4 py-2">
            <label
              htmlFor="journal-tags"
              className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground"
            >
              {text("标签", "Tags")}
            </label>
            <Input
              id="journal-tags"
              aria-label={text("日志标签", "Journal tags")}
              value={tagsText}
              placeholder={text("用逗号分隔标签", "Separate tags with commas")}
              className="h-8 border-transparent bg-surface-muted shadow-none"
              onChange={(event) => handleTagsChange(event.currentTarget.value)}
            />
          </div>
        </div>

        {editor !== null && preferences.showOutline && !historyOpen ? (
          <EditorOutline editor={editor} />
        ) : null}

        {historyOpen ? (
          <HistoryPanel
            journalId={journal.id}
            currentRevision={expectedRevision ?? journal.revision}
            currentMarkdown={currentMarkdown}
            onRestored={onRestored}
            onClose={() => store.getState().setHistoryOpen(false)}
          />
        ) : null}
      </div>

      {promotionOpen ? (
        <KnowledgePromotionDialog
          open
          journal={journal}
          {...(promotionBlockId === null ? {} : { sourceBlockId: promotionBlockId })}
          onOpenChange={setPromotionOpen}
          onPromoted={(item) => {
            setPromotedItem(item);
          }}
        />
      ) : null}
    </section>
  );
}
