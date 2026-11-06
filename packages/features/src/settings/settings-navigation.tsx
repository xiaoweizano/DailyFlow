import { Database, Info, Palette, PenLine, Settings2, type LucideIcon } from "lucide-react";
import { useRef } from "react";

import type { SettingsMessages } from "../preferences/messages.js";

export type SettingsSectionId = "general" | "appearance" | "editor" | "data" | "about";

interface NavigationItem {
  readonly id: SettingsSectionId;
  readonly label: string;
  readonly icon: LucideIcon;
}

export interface SettingsNavigationProps {
  readonly activeId: SettingsSectionId;
  readonly messages: SettingsMessages;
  readonly onChange: (id: SettingsSectionId) => void;
}

export function SettingsNavigation({
  activeId,
  messages,
  onChange,
}: SettingsNavigationProps): React.JSX.Element {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const items: readonly NavigationItem[] = [
    { id: "general", label: messages.categories.general, icon: Settings2 },
    { id: "appearance", label: messages.categories.appearance, icon: Palette },
    { id: "editor", label: messages.categories.editor, icon: PenLine },
    { id: "data", label: messages.categories.data, icon: Database },
    { id: "about", label: messages.categories.about, icon: Info },
  ];

  function moveFocus(currentIndex: number, direction: 1 | -1): void {
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    const next = items[nextIndex];
    if (next === undefined) {
      return;
    }
    onChange(next.id);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={messages.categoriesLabel}
      aria-orientation="vertical"
      className="grid content-start gap-1"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = activeId === item.id;

        return (
          <button
            key={item.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`settings-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`settings-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                event.preventDefault();
                moveFocus(index, 1);
              } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                event.preventDefault();
                moveFocus(index, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                const first = items[0];
                if (first === undefined) {
                  return;
                }
                onChange(first.id);
                buttons.current[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                const last = items.length - 1;
                const finalItem = items[last];
                if (finalItem === undefined) {
                  return;
                }
                onChange(finalItem.id);
                buttons.current[last]?.focus();
              }
            }}
            className={[
              "inline-flex h-[var(--control-height)] min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] border px-3 text-left text-sm font-medium transition-colors",
              selected
                ? "border-border-strong bg-surface text-primary shadow-sm"
                : "border-transparent text-muted-foreground hover:bg-surface/75 hover:text-foreground",
            ].join(" ")}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
