import { ExportPanel } from "./export-panel.js";

export function ExportPage(): React.JSX.Element {
  return (
    <div className="min-h-full bg-surface-muted/35 p-4 sm:p-6">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[10px] uppercase text-primary">Data Management / Export</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">导出与迁移归档</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          将本地日志、知识、任务和导入记录打包为可移植 ZIP。正文以权威 JSON
          重新投影，归档不暴露平台文件路径。
        </p>
      </header>
      <div className="mt-5">
        <ExportPanel />
      </div>
    </div>
  );
}
