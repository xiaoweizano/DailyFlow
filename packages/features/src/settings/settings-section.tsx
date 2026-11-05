import type { LucideIcon } from "lucide-react";

export interface SettingsSectionProps {
  readonly id?: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly icon: LucideIcon;
  readonly children: React.ReactNode;
}

export function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: SettingsSectionProps): React.JSX.Element {
  const titleId = id === undefined ? undefined : `${id}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 border border-border bg-surface p-[var(--panel-padding)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          {eyebrow === undefined ? null : (
            <p className="font-mono text-[10px] uppercase text-muted-foreground">{eyebrow}</p>
          )}
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description === undefined ? null : (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
