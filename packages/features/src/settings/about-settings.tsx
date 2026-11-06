import type { AiProviderDescriptor, SecretStoreBackend } from "@dailyflow/application";
import { BookOpenText, Bot, HardDrive, Info, Monitor } from "lucide-react";
import { Link } from "react-router-dom";

import type { SettingsMessages } from "../preferences/messages.js";
import type { ShortcutPlatform } from "../platform/command-registry.js";
import { AiSettings } from "./ai-settings.js";
import { SettingsSection } from "./settings-section.js";
import { ShortcutHelpPanel } from "./shortcut-settings.js";

export interface AboutSettingsProps {
  readonly messages: SettingsMessages;
  readonly platform: ShortcutPlatform;
  readonly storageLabel: string;
  readonly version: string;
  readonly providers: readonly AiProviderDescriptor[];
  readonly secretBackend: SecretStoreBackend;
}

export function AboutSettings({
  messages,
  platform,
  storageLabel,
  version,
  providers,
  secretBackend,
}: AboutSettingsProps): React.JSX.Element {
  const isDesktop = platform === "windows" || platform === "macos";

  return (
    <div className="grid gap-[var(--settings-row-gap)]">
      <SettingsSection
        id="about"
        eyebrow="DailyFlow"
        title={messages.about.title}
        description={messages.about.description}
        icon={Info}
      >
        <dl className="grid border-y border-border sm:grid-cols-3">
          <div className="py-3.5 sm:border-r sm:border-border sm:px-4 sm:first:pl-0">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor aria-hidden="true" className="size-3.5" />
              {messages.about.runtime}
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {isDesktop ? messages.about.desktopRuntime : messages.about.webRuntime}
            </dd>
          </div>
          <div className="border-t border-border py-3.5 sm:border-r sm:border-t-0 sm:px-4">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <HardDrive aria-hidden="true" className="size-3.5" />
              {messages.about.storage}
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{storageLabel}</dd>
          </div>
          <div className="border-t border-border py-3.5 sm:border-t-0 sm:pl-4">
            <dt className="text-xs text-muted-foreground">{messages.about.version}</dt>
            <dd className="mt-1 font-mono text-sm font-medium text-foreground">v{version}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-start gap-2.5 bg-surface-muted/55 px-3 py-2.5">
          <HardDrive aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{messages.about.localOnly}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {messages.about.localOnlyDescription}
            </p>
          </div>
        </div>
        <Link
          to="/help"
          className="mt-4 inline-flex h-9 items-center gap-2 border border-border-strong bg-surface px-3 text-sm font-medium text-foreground hover:border-primary/40"
        >
          <BookOpenText aria-hidden="true" className="size-4 text-primary" />
          打开帮助中心
        </Link>
      </SettingsSection>

      <ShortcutHelpPanel platform={platform} />

      <SettingsSection
        id="ai-settings"
        eyebrow="Optional extension"
        title="AI 扩展"
        description="AI 不参与日志保存、搜索和知识沉淀。"
        icon={Bot}
      >
        <AiSettings providers={providers} secretBackend={secretBackend} />
      </SettingsSection>
    </div>
  );
}
