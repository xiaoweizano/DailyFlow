import {
  DEFAULT_USER_PREFERENCES,
  PortError,
  type SaveJournalSnapshot,
} from "@dailyflow/application";
import {
  createContentDocument,
  parseContentHash,
  parseEntityId,
  parseLocalDate,
  parseRevision,
  parseUtcTimestamp,
  type JsonObject,
  type Task,
} from "@dailyflow/domain";
import { describe, expect, it, vi } from "vitest";

import { DesktopJournalRepository } from "../src/desktop/desktop-journal-repository.js";
import { DesktopSearchPort, type TauriListen } from "../src/desktop/desktop-search-port.js";
import { DesktopStorageLocationService } from "../src/desktop/desktop-storage-location.js";
import { DesktopTaskRepository } from "../src/desktop/desktop-task-repository.js";
import { DesktopTimelineQuery } from "../src/desktop/desktop-timeline-query.js";
import { TauriCommandClient, type TauriInvoke } from "../src/desktop/tauri-client.js";
import {
  TaskDtoSchema,
  TaskSaveCommandDtoSchema,
} from "../src/desktop/tauri-contracts.js";

const JOURNAL_ID = parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c26");
const CONTENT_HASH = parseContentHash(
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);
const SAVED_AT = parseUtcTimestamp("2026-10-30T03:20:11.123Z");

const taskDto = {
  id: parseEntityId("0198e2f4-7e33-7c70-a8b2-18c1520f9c29"),
  title: "补齐离线导入测试",
  descriptionJson: {
    type: "doc",
    content: [{ type: "paragraph" }],
  } as JsonObject,
  descriptionText: "确认 GBK 和 UTF-8 BOM 都能导入。",
  status: "in_progress",
  priority: "high",
  dueDate: "2026-10-30",
  completedAt: null,
  journalId: JOURNAL_ID,
  knowledgeItemId: null,
  revision: 2,
  createdAt: SAVED_AT,
  updatedAt: SAVED_AT,
  deletedAt: null,
} as const;

const timelineDto = {
  date: "2026-10-30",
  journalId: JOURNAL_ID,
  journalCount: 1,
  taskDueCount: 2,
  title: "发布复盘",
  excerpt: "修复了离线导入问题",
  updatedAt: SAVED_AT,
} as const;

const journalDto = {
  id: JOURNAL_ID,
  journalDate: "2026-10-30",
  timezone: "Asia/Shanghai",
  title: "Deploy notes",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph" }],
  },
  contentMarkdown: "Deploy notes",
  contentPlainText: "Deploy notes",
  editorSchemaVersion: 1,
  projectionVersion: 1,
  contentHash: CONTENT_HASH,
  excerpt: "Deploy notes",
  status: "active",
  revision: 1,
  createdAt: SAVED_AT,
  updatedAt: SAVED_AT,
  deletedAt: null,
  tags: ["work"],
  structuredBlocks: [],
} as const;

function createInvoke(result: unknown): ReturnType<typeof vi.fn<TauriInvoke>> {
  return vi.fn<TauriInvoke>().mockResolvedValue(result);
}

function createJournalRepository(invoke: TauriInvoke): DesktopJournalRepository {
  return new DesktopJournalRepository({
    client: new TauriCommandClient(invoke),
    clock: { nowUtc: () => SAVED_AT },
  });
}

function createTaskRepository(invoke: TauriInvoke): DesktopTaskRepository {
  return new DesktopTaskRepository({
    client: new TauriCommandClient(invoke),
    clock: { nowUtc: () => SAVED_AT },
  });
}

function makeSnapshot(expectedRevision: number | null): SaveJournalSnapshot {
  return {
    journalId: JOURNAL_ID,
    journalDate: parseLocalDate("2026-10-30"),
    timezone: "Asia/Shanghai",
    title: "Deploy notes",
    contentJson: { type: "doc", content: [] },
    editorSchemaVersion: 1,
    contentMarkdown: "Deploy notes",
    contentPlainText: "Deploy notes",
    contentHash: CONTENT_HASH,
    projectionVersion: 1,
    excerpt: "Deploy notes",
    expectedRevision,
    checkpoint: "explicit",
    tags: ["work"],
    structuredBlocks: [],
    searchDocuments: [],
    savedAt: SAVED_AT,
  };
}

describe("desktop Tauri contracts", () => {
  it("reads the platform-resolved data directory", async () => {
    const invoke = createInvoke({
      currentDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
      defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
      isCustom: false,
    });
    const storageLocation = new DesktopStorageLocationService({ invoke });

    await expect(storageLocation.get()).resolves.toEqual({
      currentDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
      defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
      isCustom: false,
    });
    expect(invoke).toHaveBeenCalledWith("storage_location_get");
  });

  it("migrates the complete preference document to the selected directory", async () => {
    const invoke = vi.fn<TauriInvoke>(async (command) => {
      if (command === "storage_location_get") {
        return {
          currentDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
          defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
          isCustom: false,
        };
      }
      return {
        destination: "D:\\DailyFlow",
        backupDirectory:
          "C:\\Users\\office\\AppData\\Roaming\\DailyFlow\\.dailyflow-migration-backups\\backup-1",
        restartRequired: true,
      };
    });
    const storageLocation = new DesktopStorageLocationService({
      invoke,
      picker: async () => "D:\\DailyFlow",
    });
    await storageLocation.get();

    const result = await storageLocation.migrate(DEFAULT_USER_PREFERENCES);

    expect(invoke).toHaveBeenCalledWith("storage_location_migrate", {
      destination: "D:\\DailyFlow",
      preferencesJson: JSON.stringify({
        ...DEFAULT_USER_PREFERENCES,
        customDataDirectory: "D:\\DailyFlow",
      }),
    });
    expect(result).toMatchObject({
      currentDirectory: "D:\\DailyFlow",
      defaultDirectory: "C:\\Users\\office\\AppData\\Roaming\\DailyFlow",
      isCustom: true,
      restartRequired: true,
      preferences: {
        schemaVersion: DEFAULT_USER_PREFERENCES.schemaVersion,
        customDataDirectory: "D:\\DailyFlow",
      },
    });
  });

  it("does not start a migration when the directory picker is cancelled", async () => {
    const invoke = createInvoke({});
    const storageLocation = new DesktopStorageLocationService({
      invoke,
      picker: async () => null,
    });

    await expect(storageLocation.migrate(DEFAULT_USER_PREFERENCES)).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps malformed storage responses to a validation port error", async () => {
    const storageLocation = new DesktopStorageLocationService({
      invoke: createInvoke({ currentDirectory: "", isCustom: false }),
    });

    const error = await storageLocation.get().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts a new task write with revision zero and rejects it as persisted data", () => {
    const command = {
      task: { ...taskDto, revision: 0 },
      expectedRevision: null,
    };

    expect(TaskSaveCommandDtoSchema.parse(command).task.revision).toBe(0);
    expect(() => TaskDtoSchema.parse(command.task)).toThrow();
  });

  it("rejects a response with missing required fields", async () => {
    const invoke = createInvoke({ ...journalDto, revision: undefined });
    const journals = createJournalRepository(invoke);

    const error = await journals.getById(JOURNAL_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        fields: {
          revision: expect.any(String),
        },
      },
    });
  });

  it("maps Rust storage errors to application port errors", async () => {
    const invoke = vi.fn<TauriInvoke>().mockRejectedValue({
      code: "CONFLICT",
      message: "Journal revision conflict",
    });
    const journals = createJournalRepository(invoke);

    const error = await journals.getById(JOURNAL_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Journal revision conflict",
    });
  });

  it.each([
    ["PERMISSION_DENIED", "File access was denied"],
    ["DIALOG_CANCELLED", "The save dialog was cancelled"],
  ])("preserves the stable %s desktop error", async (code, message) => {
    const invoke = vi.fn<TauriInvoke>().mockRejectedValue({ code, message });
    const tasks = createTaskRepository(invoke);

    const error = await tasks.getById(taskDto.id).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ code, message });
  });

  it("maps save input and returns the persisted revision", async () => {
    const invoke = createInvoke({
      journalId: JOURNAL_ID,
      revision: 2,
      savedAt: SAVED_AT,
      contentHash: CONTENT_HASH,
      versionCreated: true,
      searchIndexState: "ready",
    });
    const journals = createJournalRepository(invoke);

    const saved = await journals.saveSnapshot(makeSnapshot(1));

    expect(invoke).toHaveBeenCalledWith("journal_save_snapshot", {
      input: expect.objectContaining({
        journalId: JOURNAL_ID,
        expectedRevision: 1,
        checkpoint: "explicit",
        contentHash: CONTENT_HASH,
      }),
    });
    expect(saved).toMatchObject({
      journalId: JOURNAL_ID,
      revision: 2,
      versionCreated: true,
    });
  });

  it("preserves the opaque pagination cursor returned by Rust", async () => {
    const invoke = createInvoke({
      items: [
        {
          id: JOURNAL_ID,
          journalDate: "2026-10-30",
          title: "Deploy notes",
          excerpt: "Deploy notes",
          revision: 1,
          updatedAt: SAVED_AT,
        },
      ],
      nextCursor: "rust-cursor-2",
    });
    const journals = createJournalRepository(invoke);

    const page = await journals.listSummaries({ cursor: "rust-cursor-1", limit: 2 });

    expect(invoke).toHaveBeenCalledWith("journal_list_summaries", {
      query: {
        cursor: "rust-cursor-1",
        limit: 2,
      },
    });
    expect(page.nextCursor).toBe("rust-cursor-2");
  });

  it("maps desktop search filters, results, and pagination", async () => {
    const invoke = createInvoke({
      items: [
        {
          entityType: "journal",
          entityId: JOURNAL_ID,
          title: "Deploy notes",
          snippet: "Deployed the service",
          localDate: "2026-10-30",
          score: 1.5,
        },
      ],
      nextCursor: "search-cursor-2",
      indexState: "stale",
    });
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const page = await search.query({
      text: "deploy",
      entityTypes: ["journal", "knowledge_item"],
      fromDate: parseLocalDate("2026-10-01"),
      toDate: parseLocalDate("2026-10-31"),
      cursor: "search-cursor-1",
      limit: 20,
    });

    expect(invoke).toHaveBeenCalledWith("search_query", {
      query: {
        text: "deploy",
        entityTypes: ["journal", "knowledge_item"],
        fromDate: "2026-10-01",
        toDate: "2026-10-31",
        cursor: "search-cursor-1",
        limit: 20,
      },
    });
    expect(page).toMatchObject({
      items: [
        {
          entityType: "journal",
          entityId: JOURNAL_ID,
          localDate: "2026-10-30",
          score: 1.5,
        },
      ],
      nextCursor: "search-cursor-2",
      indexState: "stale",
    });
  });

  it("preserves a failed desktop search index state", async () => {
    const invoke = createInvoke({
      items: [],
      nextCursor: null,
      indexState: "failed",
    });
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const page = await search.query({ text: "deploy", limit: 20 });

    expect(page.indexState).toBe("failed");
  });

  it("maps invalid request payloads without invoking Tauri", async () => {
    const invoke = createInvoke([]);
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const error = await search.query({ text: 42 } as never).catch((reason: unknown) => reason);

    expect(invoke).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Desktop storage request is invalid",
      details: {
        fields: {
          "query.text": expect.any(String),
        },
      },
    });
  });

  it("rebuilds desktop search through the Tauri command", async () => {
    const invoke = createInvoke({
      indexedCount: 2,
      completedAt: SAVED_AT,
      status: "completed",
    });
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const rebuilt = await search.rebuild(["journal", "knowledge_item"]);

    expect(invoke).toHaveBeenCalledWith("search_rebuild", {
      requestId: expect.any(String),
      scope: ["journal", "knowledge_item"],
    });
    expect(rebuilt).toEqual({
      indexedCount: 2,
      completedAt: SAVED_AT,
      status: "completed",
    });
  });

  it("cancels a desktop search rebuild by request id and preserves the result", async () => {
    const controller = new AbortController();
    let finishRebuild: ((result: unknown) => void) | undefined;
    const invoke = vi.fn<TauriInvoke>(async (command, args) => {
      if (command === "search_rebuild") {
        expect(args).toMatchObject({ requestId: expect.any(String) });
        return new Promise((resolve) => {
          finishRebuild = resolve;
        });
      }
      if (command === "search_cancel_rebuild") {
        expect(args).toMatchObject({ requestId: expect.any(String) });
        finishRebuild?.({
          indexedCount: 0,
          completedAt: SAVED_AT,
          status: "cancelled",
        });
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const search = new DesktopSearchPort({ client: new TauriCommandClient(invoke) });

    const rebuildPromise = search.rebuild(undefined, { signal: controller.signal });
    const requestId = (invoke.mock.calls[0]?.[1] as { requestId: string }).requestId;
    expect(invoke).toHaveBeenNthCalledWith(1, "search_rebuild", {
      requestId,
    });

    controller.abort();
    await Promise.resolve();

    expect(invoke).toHaveBeenNthCalledWith(2, "search_cancel_rebuild", {
      requestId,
    });
    const rebuilt = await rebuildPromise;

    expect(rebuilt.status).toBe("cancelled");
  });

  it("forwards matching desktop search rebuild progress and unsubscribes", async () => {
    const progress = vi.fn();
    const unlisten = vi.fn();
    let listener:
      | ((payload: {
          requestId: string;
          phase: "reading" | "indexing" | "committing";
          processedCount: number;
          totalCount: number;
        }) => void)
      | undefined;
    const listenSpy = vi.fn();
    const listen: TauriListen = async <T>(event: string, handler: (payload: T) => void) => {
      listenSpy(event, handler);
      listener = handler as typeof listener;
      return unlisten;
    };
    const invoke = vi.fn<TauriInvoke>(async (command, args) => {
      expect(command).toBe("search_rebuild");
      expect(listenSpy).toHaveBeenCalledOnce();
      const requestId = (args as { requestId: string }).requestId;

      listener?.({
        requestId: "another-request",
        phase: "reading",
        processedCount: 99,
        totalCount: 100,
      });
      listener?.({
        requestId,
        phase: "indexing",
        processedCount: 2,
        totalCount: 4,
      });

      return {
        indexedCount: 4,
        completedAt: SAVED_AT,
        status: "completed",
      };
    });
    const search = new DesktopSearchPort({
      client: new TauriCommandClient(invoke),
      listen,
    });

    await search.rebuild(undefined, { onProgress: progress });

    expect(listenSpy).toHaveBeenCalledWith("search-rebuild-progress", expect.any(Function));
    expect(progress).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith({
      phase: "indexing",
      processedCount: 2,
      totalCount: 4,
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("accepts an empty Tauri command response", async () => {
    const invoke = createInvoke(undefined);
    const journals = createJournalRepository(invoke);

    await expect(journals.softDelete(JOURNAL_ID, 1)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("journal_soft_delete", {
      journalId: JOURNAL_ID,
      expectedRevision: 1,
      deletedAt: SAVED_AT,
    });
  });

  it("maps task DTOs and preserves list filters and pagination", async () => {
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce(taskDto)
      .mockResolvedValueOnce({
        items: [taskDto],
        nextCursor: "task-cursor-2",
      });
    const tasks = createTaskRepository(invoke);

    const task = await tasks.getById(taskDto.id);
    const page = await tasks.list({
      status: ["open", "in_progress"],
      dueFrom: parseLocalDate("2026-10-01"),
      dueTo: parseLocalDate("2026-10-31"),
      cursor: "task-cursor-1",
      limit: 10,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "task_get_by_id", {
      taskId: taskDto.id,
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "task_list", {
      query: {
        status: ["open", "in_progress"],
        dueFrom: "2026-10-01",
        dueTo: "2026-10-31",
        cursor: "task-cursor-1",
        limit: 10,
      },
    });
    expect(task).toMatchObject({
      id: taskDto.id,
      title: "补齐离线导入测试",
      descriptionText: "确认 GBK 和 UTF-8 BOM 都能导入。",
      dueDate: "2026-10-30",
      journalId: JOURNAL_ID,
      revision: 2,
    });
    expect(page).toMatchObject({
      items: [{ id: taskDto.id, revision: 2 }],
      nextCursor: "task-cursor-2",
    });
  });

  it("maps task mutations to revision-checked Tauri commands", async () => {
    const savedTaskDto = {
      ...taskDto,
      revision: 3,
      updatedAt: parseUtcTimestamp("2026-10-30T04:20:11.123Z"),
    } as const;
    const doneTaskDto = {
      ...savedTaskDto,
      status: "done",
      completedAt: parseUtcTimestamp("2026-10-30T05:20:11.123Z"),
      revision: 4,
    } as const;
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce(savedTaskDto)
      .mockResolvedValueOnce(doneTaskDto)
      .mockResolvedValueOnce(undefined);
    const tasks = createTaskRepository(invoke);
    const currentTask: Task = {
      id: taskDto.id,
      title: taskDto.title,
      description: createContentDocument(1, taskDto.descriptionJson),
      descriptionText: taskDto.descriptionText,
      status: "in_progress",
      priority: taskDto.priority,
      dueDate: parseLocalDate(taskDto.dueDate),
      completedAt: null,
      journalId: taskDto.journalId,
      knowledgeItemId: taskDto.knowledgeItemId,
      revision: parseRevision(2),
      createdAt: taskDto.createdAt,
      updatedAt: taskDto.updatedAt,
      deletedAt: taskDto.deletedAt,
    };

    const saved = await tasks.save(currentTask, 2);
    const completed = await tasks.complete(
      taskDto.id,
      parseUtcTimestamp("2026-10-30T05:20:11.123Z"),
      3,
    );
    await tasks.softDelete(taskDto.id, 4);

    expect(invoke).toHaveBeenNthCalledWith(1, "task_save", {
      input: expect.objectContaining({
        task: expect.objectContaining({
          id: taskDto.id,
          status: "in_progress",
          completedAt: null,
        }),
        expectedRevision: 2,
      }),
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "task_complete", {
      input: {
        taskId: taskDto.id,
        completedAt: "2026-10-30T05:20:11.123Z",
        expectedRevision: 3,
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "task_soft_delete", {
      taskId: taskDto.id,
      expectedRevision: 4,
      deletedAt: SAVED_AT,
    });
    expect(saved.revision).toBe(3);
    expect(completed).toMatchObject({
      status: "done",
      completedAt: "2026-10-30T05:20:11.123Z",
      revision: 4,
    });
  });

  it("maps timeline calendar and date-cursor list queries", async () => {
    const invoke = vi
      .fn<TauriInvoke>()
      .mockResolvedValueOnce([timelineDto])
      .mockResolvedValueOnce({
        items: [timelineDto],
        nextCursor: "timeline-cursor-2",
      });
    const timeline = new DesktopTimelineQuery({
      client: new TauriCommandClient(invoke),
    });

    const calendar = await timeline.getCalendar({
      from: parseLocalDate("2026-10-01"),
      to: parseLocalDate("2026-10-31"),
    });
    const page = await timeline.listEntries({
      fromDate: parseLocalDate("2026-01-01"),
      toDate: parseLocalDate("2026-12-31"),
      cursor: "timeline-cursor-1",
      limit: 30,
    });

    expect(invoke).toHaveBeenNthCalledWith(1, "timeline_get_calendar", {
      query: {
        from: "2026-10-01",
        to: "2026-10-31",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "timeline_list_entries", {
      query: {
        fromDate: "2026-01-01",
        toDate: "2026-12-31",
        cursor: "timeline-cursor-1",
        limit: 30,
      },
    });
    expect(calendar).toEqual([
      expect.objectContaining({
        date: "2026-10-30",
        journalId: JOURNAL_ID,
        journalCount: 1,
        taskDueCount: 2,
        updatedAt: SAVED_AT,
      }),
    ]);
    expect(page).toMatchObject({
      items: [{ date: "2026-10-30", title: "发布复盘" }],
      nextCursor: "timeline-cursor-2",
    });
  });

  it("rejects invalid task responses and timeline requests", async () => {
    const invoke = createInvoke({ ...taskDto, revision: undefined });
    const tasks = createTaskRepository(invoke);
    const timeline = new DesktopTimelineQuery({
      client: new TauriCommandClient(createInvoke([])),
    });

    const responseError = await tasks.getById(taskDto.id).catch((reason: unknown) => reason);
    const requestError = await timeline
      .getCalendar({
        from: parseLocalDate("2026-10-31"),
        to: parseLocalDate("2026-10-01"),
      })
      .catch((reason: unknown) => reason);

    expect(responseError).toBeInstanceOf(PortError);
    expect(responseError).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        fields: {
          revision: expect.any(String),
        },
      },
    });
    expect(requestError).toBeInstanceOf(PortError);
    expect(requestError).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Desktop storage request is invalid",
    });
  });

  it("uses the Tauri v2 IPC bridge when no invoke function is injected", async () => {
    const globals = globalThis as typeof globalThis & {
      __TAURI_INTERNALS__?: {
        readonly invoke: TauriInvoke;
      };
    };
    const original = globals.__TAURI_INTERNALS__;
    const invoke = createInvoke(journalDto);
    globals.__TAURI_INTERNALS__ = { invoke };

    try {
      const journal = await new TauriCommandClient().getJournalById(JOURNAL_ID);

      expect(invoke).toHaveBeenCalledWith("journal_get_by_id", {
        journalId: JOURNAL_ID,
      });
      expect(journal?.id).toBe(JOURNAL_ID);
    } finally {
      if (original === undefined) {
        delete globals.__TAURI_INTERNALS__;
      } else {
        globals.__TAURI_INTERNALS__ = original;
      }
    }
  });
});
