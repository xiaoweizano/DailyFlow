import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn.js";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  tooltip?: string;
  children: ReactNode;
  variant?: "ghost" | "secondary";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltip, children, className, type = "button", variant = "ghost", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border text-foreground transition-colors",
        variant === "ghost"
          ? "border-transparent hover:border-border hover:bg-surface-muted"
          : "border-border-strong bg-surface shadow-sm hover:bg-surface-muted",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
