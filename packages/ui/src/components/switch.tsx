import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-checked" | "role"> {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, className, onClick, onCheckedChange, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border-strong bg-surface-muted",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onCheckedChange(!checked);
        }
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
});
