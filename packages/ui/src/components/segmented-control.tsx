import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";

export interface SegmentedControlOption<T extends string = string> {
  label: string;
  value: T;
  icon?: ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  label: string;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[4px] px-3 text-xs font-medium transition-colors [&_svg]:size-3.5",
              selected
                ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
