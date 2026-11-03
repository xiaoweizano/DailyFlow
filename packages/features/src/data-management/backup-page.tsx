import { BackupPanel } from "./backup-panel.js";

export function BackupPage(): React.JSX.Element {
  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[10px] uppercase text-primary">Data Management / Recovery</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">备份与恢复</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          创建包含正文、历史版本、附件与导入原始字节的可移植归档。恢复前先完整校验，
          现有数据非空时自动建立安全快照。
        </p>
      </header>
      <div className="mt-5">
        <BackupPanel />
      </div>
    </div>
  );
}
