import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-[var(--control-height)] w-full min-w-0 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors hover:border-primary/35 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
});
