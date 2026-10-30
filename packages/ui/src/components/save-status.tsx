import { AlertCircle, Check, CircleDashed, CloudOff, LoaderCircle } from "lucide-react";

import { cn } from "../lib/cn.js";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "offline";

interface SaveStatusProps {
  status: SaveState;
  savedAt?: string;
  className?: string;
}

const statusCopy: Record<Exclude<SaveState, "saved">, string> = {
  idle: "尚未编辑",
  dirty: "有未保存更改",
  saving: "正在保存",
  error: "保存失败",
  offline: "本地存储不可用",
};

export function SaveStatus({ status, savedAt, className }: SaveStatusProps): React.JSX.Element {
  const Icon =
    status === "saved"
      ? Check
      : status === "saving"
        ? LoaderCircle
        : status === "dirty"
          ? CircleDashed
          : status === "offline"
            ? CloudOff
            : status === "error"
              ? AlertCircle
              : CircleDashed;
  const copy = status === "saved" ? `已保存${savedAt ? ` ${savedAt}` : ""}` : statusCopy[status];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap text-xs",
        status === "error" || status === "offline"
          ? "text-danger"
          : status === "dirty"
            ? "text-warning"
            : "text-muted-foreground",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", status === "saving" && "animate-spin")}
      />
      <span className="truncate">{copy}</span>
    </span>
  );
}
