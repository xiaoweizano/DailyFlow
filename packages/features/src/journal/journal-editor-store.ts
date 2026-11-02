import type { AppError } from "@dailyflow/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { SaveCoordinatorStatus } from "./save-coordinator.js";

export interface JournalEditorState {
  readonly saveStatus: SaveCoordinatorStatus;
  readonly savedAt: string | null;
  readonly error: AppError | null;
  readonly expectedRevision: number | null;
  readonly historyOpen: boolean;
  setSaveState: (
    status: SaveCoordinatorStatus,
    savedAt: string | null,
    error: AppError | null,
  ) => void;
  setExpectedRevision: (revision: number) => void;
  setHistoryOpen: (open: boolean) => void;
}

export type JournalEditorStore = StoreApi<JournalEditorState>;

export function createJournalEditorStore(initialRevision: number): JournalEditorStore {
  return createStore<JournalEditorState>((set) => ({
    saveStatus: "idle",
    savedAt: null,
    error: null,
    expectedRevision: initialRevision < 1 ? null : initialRevision,
    historyOpen: false,
    setSaveState: (saveStatus, savedAt, error) =>
      set({
        saveStatus,
        savedAt,
        error,
      }),
    setExpectedRevision: (revision) =>
      set({
        expectedRevision: revision < 1 ? null : revision,
      }),
    setHistoryOpen: (historyOpen) => set({ historyOpen }),
  }));
}
