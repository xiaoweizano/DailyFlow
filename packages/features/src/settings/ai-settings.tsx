import type { AiProviderDescriptor, SecretStoreBackend } from "@dailyflow/application";
import { Bot, KeyRound, ShieldCheck } from "lucide-react";

export interface AiSettingsProps {
  readonly providers: readonly AiProviderDescriptor[];
  readonly secretBackend: SecretStoreBackend;
}

export function AiSettings({ providers, secretBackend }: AiSettingsProps): React.JSX.Element {
  return (
    <section aria-labelledby="ai-settings-title">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-border bg-surface-muted text-primary">
          <Bot aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Optional extension</p>
          <h2 id="ai-settings-title" className="mt-0.5 text-base font-semibold text-foreground">
            AI 辅助
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            AI 是可选的显式扩展，不参与日志保存、搜索和知识沉淀。
          </p>
        </div>
      </div>

      <div className="mt-5 border-y border-border">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">当前 Provider</p>
            <p className="mt-0.5 text-xs text-muted-foreground">V1 不包含真实厂商配置或网络请求。</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-border-strong" aria-hidden="true" />
            {providers[0]?.displayName ?? "未配置"}
          </span>
        </div>

        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-border py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">凭据存储</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {secretBackend === "os-keychain"
                  ? "桌面端预留给操作系统钥匙串；启用前不会保存 AI 凭据。"
                  : "Web 凭据仅保存在当前标签页内存，关闭标签页即丢失。"}
              </p>
            </div>
          </div>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {secretBackend}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 bg-surface-muted/55 px-3 py-2.5">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          凭据不会写入设置、备份、日志或 IndexedDB。未来请求必须先展示待发送内容，并由你明确确认。
        </p>
      </div>
    </section>
  );
}
