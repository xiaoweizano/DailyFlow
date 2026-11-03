import { ImportWizard } from "./import-wizard.js";

export function ImportPage(): React.JSX.Element {
  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[10px] uppercase text-primary">Data Management / Migration</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">导入 TXT 日志</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          将现有按月份组织的每日 TXT 文件批量迁移到
          DailyFlow。原始文本、编码识别、冲突检测和失败回滚在同一套本地流程中完成。
        </p>
      </header>
      <div className="mt-5">
        <ImportWizard />
      </div>
    </div>
  );
}
