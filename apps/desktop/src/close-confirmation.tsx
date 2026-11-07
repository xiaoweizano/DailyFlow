import type { CloseBehavior } from "@dailyflow/application";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dailyflow/ui";
import { invoke } from "@tauri-apps/api/core";
import { useAppServices, useAppText, useUserPreferences } from "@dailyflow/features";
import { type ReactNode, useState, useSyncExternalStore } from "react";

import {
  dismissCloseConfirmation,
  getCloseConfirmationSnapshot,
  subscribeToCloseConfirmation,
} from "./close-confirmation-store.js";

export interface CloseConfirmationRuntime {
  minimize(): Promise<void>;
  quit(): Promise<void>;
}

const defaultRuntime: CloseConfirmationRuntime = {
  minimize: async () => {
    await invoke("lifecycle_hide_to_tray");
  },
  quit: async () => {
    await invoke("lifecycle_quit");
  },
};

export interface CloseConfirmationProps {
  readonly runtime?: CloseConfirmationRuntime;
}

export function CloseConfirmation({ runtime = defaultRuntime }: CloseConfirmationProps): ReactNode {
  return <CloseConfirmationDialog runtime={runtime} />;
}

function CloseConfirmationDialog({
  runtime,
}: {
  readonly runtime: CloseConfirmationRuntime;
}): React.JSX.Element {
  const open = useSyncExternalStore(
    subscribeToCloseConfirmation,
    getCloseConfirmationSnapshot,
    () => false,
  );
  const { lifecycle } = useAppServices();
  const { preferences, save } = useUserPreferences();
  const text = useAppText();
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && !busy) {
      setRemember(false);
      setFailure(null);
      dismissCloseConfirmation();
    }
  }

  async function handleAction(behavior: Exclude<CloseBehavior, "ask">): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      if (remember) {
        await save({ ...preferences, closeBehavior: behavior });
      }
      if (!(await lifecycle.flushAll())) {
        setFailure(
          text(
            "仍有内容未完成保存，请处理后再关闭。",
            "Some changes could not be saved. Please resolve them before closing.",
          ),
        );
        return;
      }

      if (behavior === "minimize") {
        await runtime.minimize();
      } else {
        await runtime.quit();
      }
      setRemember(false);
      setFailure(null);
      dismissCloseConfirmation();
    } catch {
      setFailure(
        text(
          "无法完成关闭操作，请稍后重试。",
          "The close action could not be completed. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        role="alertdialog"
        aria-labelledby="close-confirmation-title"
        aria-describedby="close-confirmation-description"
        className="max-w-[30rem]"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle id="close-confirmation-title">
            {text("关闭 DailyFlow", "Close DailyFlow")}
          </DialogTitle>
          <DialogDescription id="close-confirmation-description">
            {text(
              "选择最小化到托盘、直接退出，或取消本次操作。",
              "Minimize to tray, quit now, or cancel this action.",
            )}
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-border bg-surface-muted/55 px-3 py-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            aria-label={text("记住我的选择", "Remember my choice")}
            checked={remember}
            disabled={busy}
            onChange={(event) => setRemember(event.currentTarget.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block font-medium">{text("记住我的选择", "Remember my choice")}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {text(
                "下次点击关闭按钮时直接使用本次选择。",
                "Use this choice the next time the close button is clicked.",
              )}
            </span>
          </span>
        </label>

        {failure === null ? null : (
          <p role="alert" className="text-sm leading-6 text-danger">
            {failure}
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {text("取消", "Cancel")}
            </Button>
          </DialogClose>
          <Button variant="secondary" disabled={busy} onClick={() => void handleAction("quit")}>
            {text("直接退出", "Quit")}
          </Button>
          <Button autoFocus disabled={busy} onClick={() => void handleAction("minimize")}>
            {text("最小化", "Minimize")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
