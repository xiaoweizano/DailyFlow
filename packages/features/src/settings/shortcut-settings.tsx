import { AlertTriangle, Keyboard } from "lucide-react";

import {
  defaultShortcutCommands,
  formatShortcut,
  type ShortcutCommand,
  type ShortcutConflict,
  type ShortcutPlatform,
} from "../platform/command-registry.js";
import { useAppText } from "../preferences/use-app-text.js";

export interface ShortcutHelpPanelProps {
  readonly platform: ShortcutPlatform;
  readonly commands?: readonly ShortcutCommand[];
  readonly conflicts?: readonly ShortcutConflict[];
}

export function ShortcutHelpPanel({
  platform,
  commands = defaultShortcutCommands,
  conflicts = [],
}: ShortcutHelpPanelProps): React.JSX.Element {
  const text = useAppText();

  function commandLabel(command: ShortcutCommand): string {
    if (command.id === "global-search") {
      return text("全局搜索", "Global search");
    }
    if (command.id === "shortcut-help") {
      return text("快捷键帮助", "Keyboard shortcut help");
    }
    if (command.id === "open-settings") {
      return text("打开设置", "Open settings");
    }
    return command.label;
  }

  function commandDescription(command: ShortcutCommand): string | undefined {
    if (command.id === "global-search") {
      return text("打开搜索结果并输入关键词。", "Open search and enter keywords.");
    }
    if (command.id === "shortcut-help") {
      return text("查看当前平台可用的快捷键。", "View shortcuts available on this platform.");
    }
    if (command.id === "open-settings") {
      return text("打开 DailyFlow 设备设置。", "Open DailyFlow device settings.");
    }
    return command.description;
  }

  return (
    <div
      id="shortcut-help"
      role="region"
      aria-labelledby="shortcut-help-title"
      tabIndex={-1}
      className="rounded-[var(--radius-panel)] border border-border bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
          <Keyboard aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 id="shortcut-help-title" className="text-sm font-semibold text-foreground">
            {text("快捷键", "Keyboard shortcuts")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {text(
              "输入框、代码块和对话框内始终优先保留文本编辑。",
              "Text editing always takes priority in inputs, code blocks, and dialogs.",
            )}
          </p>
        </div>
      </div>

      {conflicts.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
            {text("快捷键冲突", "Shortcut conflict")}
          </span>
          <p className="mt-1 text-muted-foreground">
            {text(
              "冲突命令已暂停触发，请调整绑定后再使用。",
              "Conflicting commands are disabled until their bindings are changed.",
            )}
          </p>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3">
        {commands.map((command) => (
          <div
            key={command.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <dt className="min-w-0 text-sm font-medium text-foreground">{commandLabel(command)}</dt>
            {commandDescription(command) === undefined ? null : (
              <dd className="col-start-1 mt-0.5 text-xs leading-5 text-muted-foreground">
                {commandDescription(command)}
              </dd>
            )}
            <dd className="col-start-2 row-span-2 row-start-1 shrink-0 font-mono text-xs text-foreground">
              {formatShortcut(command.shortcut, platform).join("+")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
