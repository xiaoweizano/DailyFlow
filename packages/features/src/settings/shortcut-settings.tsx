import { AlertTriangle, Keyboard } from "lucide-react";

import {
  defaultShortcutCommands,
  formatShortcut,
  type ShortcutCommand,
  type ShortcutConflict,
  type ShortcutPlatform,
} from "../platform/command-registry.js";

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
  return (
    <section
      id="shortcut-help"
      role="region"
      aria-labelledby="shortcut-help-title"
      className="rounded-[var(--radius-panel)] border border-border bg-surface p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
          <Keyboard aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 id="shortcut-help-title" className="text-sm font-semibold text-foreground">
            快捷键
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            输入框、代码块和对话框内始终优先保留文本编辑。
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
            快捷键冲突
          </span>
          <p className="mt-1 text-muted-foreground">
            冲突命令已暂停触发，请调整绑定后再使用。
          </p>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3">
        {commands.map((command) => (
          <div
            key={command.id}
            className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <dt className="text-sm font-medium text-foreground">{command.label}</dt>
              {command.description === undefined ? null : (
                <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {command.description}
                </dd>
              )}
            </div>
            <dd className="shrink-0 font-mono text-xs text-foreground">
              {formatShortcut(command.shortcut, platform).join("+")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
