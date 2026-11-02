import type { AppError, Result } from "@dailyflow/shared";

export type SaveCoordinatorStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface SaveCoordinatorState<TDraft, TSaved> {
  readonly draft: TDraft | null;
  readonly saved: TSaved | null;
  readonly status: SaveCoordinatorStatus;
  readonly error: AppError | null;
  readonly savedAt: string | null;
}

export interface SaveCoordinatorOptions<TDraft, TSaved> {
  readonly save: (draft: TDraft) => Promise<Result<TSaved, AppError>>;
  readonly debounceMs?: number;
  readonly now?: () => Date;
}

const DEFAULT_DEBOUNCE_MS = 800;

export class SaveCoordinator<TDraft, TSaved> {
  private readonly save: SaveCoordinatorOptions<TDraft, TSaved>["save"];
  private readonly debounceMs: number;
  private readonly now: () => Date;
  private readonly listeners = new Set<(state: SaveCoordinatorState<TDraft, TSaved>) => void>();

  private draft: TDraft | null = null;
  private saved: TSaved | null = null;
  private status: SaveCoordinatorStatus = "idle";
  private error: AppError | null = null;
  private savedAt: string | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(options: SaveCoordinatorOptions<TDraft, TSaved>) {
    this.save = options.save;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.now = options.now ?? (() => new Date());
  }

  getState(): SaveCoordinatorState<TDraft, TSaved> {
    return {
      draft: this.draft,
      saved: this.saved,
      status: this.status,
      error: this.error,
      savedAt: this.savedAt,
    };
  }

  subscribe(listener: (state: SaveCoordinatorState<TDraft, TSaved>) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  update(draft: TDraft): void {
    if (this.disposed) {
      return;
    }

    this.draft = draft;
    this.generation += 1;
    this.error = null;
    this.status = this.inFlight === null ? "dirty" : "saving";
    this.emit();

    if (this.inFlight === null) {
      this.scheduleSave();
    }
  }

  async flush(): Promise<void> {
    this.clearTimer();

    while (!this.disposed) {
      if (this.inFlight !== null) {
        await this.inFlight;
      } else if (this.draft !== null && this.status === "dirty") {
        await this.startSave();
      } else {
        break;
      }

      this.clearTimer();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private scheduleSave(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.startSave();
    }, this.debounceMs);
  }

  private async startSave(): Promise<void> {
    if (this.disposed || this.inFlight !== null || this.draft === null) {
      return;
    }

    const capturedGeneration = this.generation;
    const capturedDraft = this.draft;
    this.status = "saving";
    this.emit();

    const request = Promise.resolve(this.save(capturedDraft))
      .then((result) => {
        if (this.disposed) {
          return;
        }

        if (result.ok) {
          this.saved = result.value;
          this.savedAt = this.now().toISOString();
          this.error = null;

          if (capturedGeneration === this.generation) {
            this.draft = null;
            this.status = "saved";
          } else {
            this.status = "dirty";
            this.scheduleSave();
          }
        } else {
          this.error = result.error;
          this.status = result.error.code === "CONFLICT" ? "conflict" : "error";
        }

        this.emit();
      })
      .catch((error: unknown) => {
        if (this.disposed) {
          return;
        }

        this.error = {
          code: "STORAGE_UNAVAILABLE",
          retryable: true,
          cause: error instanceof Error ? error.message : String(error),
        };
        this.status = "error";
        this.emit();
      })
      .finally(() => {
        if (this.inFlight === request) {
          this.inFlight = null;
        }
      });

    this.inFlight = request;
    await request;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
