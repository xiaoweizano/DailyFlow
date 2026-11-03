export { AppShell, type AppShellProps } from "./app-shell.js";
export {
  type AppRuntimeServices,
  type AiRuntimeServices,
  type DataManagementRuntimeServices,
  type SettingsRuntimeServices,
} from "./app-services-context.js";
export { useAppServices } from "./app-services-hooks.js";
export { AppServicesProvider, type AppServicesProviderProps } from "./app-services-provider.js";
export { applyVisualPreferences } from "./preferences/apply-visual-preferences.js";
export {
  UserPreferencesProvider,
  type UserPreferencesProviderProps,
} from "./preferences/user-preferences-context.js";
export { type UserPreferencesRuntime } from "./preferences/user-preferences-runtime.js";
export { useUserPreferences } from "./preferences/use-user-preferences.js";
export {
  createAttachmentRuntimeServices,
  type AttachmentRuntimeDependencies,
  type AttachmentRuntimeServices,
} from "./attachments/attachment-services.js";
export {
  createAnalyticsRuntimeServices,
  type AnalyticsRuntimeDependencies,
  type AnalyticsRuntimeServices,
  type ReportEditorModel,
  type SaveAnalyticsReportInput,
} from "./analytics/analytics-services.js";
export { AnalyticsPage, type AnalyticsPageProps } from "./analytics/analytics-page.js";
export { ReportEditor, type ReportEditorProps } from "./analytics/report-editor.js";
export { StatTile, type StatTileProps } from "./analytics/stat-tile.js";
export {
  createAppRuntimeServices,
  type BackupRuntimeServices,
  type CreateAppRuntimeServicesOptions,
  type ExportRuntimeServices,
  type ExportStorageServices,
  type ImportStorageServices,
} from "./app-runtime-services.js";
export type {
  DataHealthIssue,
  DataHealthReport,
  SearchRebuildProgress,
  SearchRebuildResult,
} from "@dailyflow/application";
export { ActivityHeatmap, type ActivityHeatmapProps } from "./dashboard/activity-heatmap.js";
export { ImportPage } from "./data-management/import-page.js";
export { ExportPage } from "./data-management/export-page.js";
export { ExportPanel } from "./data-management/export-panel.js";
export { BackupPage } from "./data-management/backup-page.js";
export { BackupPanel } from "./data-management/backup-panel.js";
export { DataManagementPage } from "./data-management/data-management-page.js";
export {
  createBackupRuntimeServices,
  type BackupRuntimeDependencies,
  type BackupRuntimeServices as BackupServices,
  type BackupSource,
  type BackupSourceFile,
  type BackupStorageServices,
} from "./data-management/backup-services.js";
export {
  createExportRuntimeServices,
  type ExportRuntimeDependencies,
  type ExportRuntimeServices as ExportServices,
} from "./data-management/export-services.js";
export {
  ImportPreviewTable,
  type ImportPreviewTableProps,
} from "./data-management/import-preview-table.js";
export { ImportResult, type ImportResultProps } from "./data-management/import-result.js";
export { ImportWizard } from "./data-management/import-wizard.js";
export { HealthReport, type HealthReportProps } from "./data-management/health-report.js";
export {
  IndexMaintenance,
  type IndexMaintenanceProps,
} from "./data-management/index-maintenance.js";
export { StorageOverview, type StorageOverviewProps } from "./data-management/storage-overview.js";
export { DashboardPage, type DashboardPageProps } from "./dashboard/dashboard-page.js";
export { TodayJournalPanel, type TodayJournalPanelProps } from "./dashboard/today-journal-panel.js";
export { TodayTasksPanel } from "./dashboard/today-tasks-panel.js";
export {
  appModules,
  mainNavigation,
  routePaths,
  type AppModule,
  type AppModuleId,
  type AppRouteOptions,
} from "./app-modules.js";
export { ModulePage, NotFoundPage } from "./module-page.js";
export { createAppRoutes } from "./routes.js";
export {
  createCommandRegistry,
  defaultShortcutCommands,
  detectShortcutPlatform,
  formatShortcut,
  isShortcutBlockedTarget,
  type CommandRegistry,
  type ShortcutCommand,
  type ShortcutConflict,
  type ShortcutPlatform,
} from "./platform/command-registry.js";
export { AiSettings, type AiSettingsProps } from "./settings/ai-settings.js";
export { SettingsPage, type SettingsPageProps } from "./settings/settings-page.js";
export { ShortcutHelpPanel, type ShortcutHelpPanelProps } from "./settings/shortcut-settings.js";
export {
  createSaveLifecycle,
  type SaveFlushHandler,
  type SaveLifecycle,
} from "./lifecycle/save-lifecycle.js";
export { HistoryPanel, type HistoryPanelProps } from "./journal/history-panel.js";
export {
  AttachmentPreview,
  AttachmentUploadPlaceholder,
  type AttachmentPreviewProps,
  type AttachmentUploadPlaceholderProps,
} from "./journal/attachment-node-view.js";
export { JournalEditor, type JournalEditorProps } from "./journal/journal-editor.js";
export { JournalList, type JournalListProps } from "./journal/journal-list.js";
export { JournalPage, type JournalPageProps } from "./journal/journal-page.js";
export { TasksPage, type TasksPageProps } from "./tasks/tasks-page.js";
export {
  ActivityHeatmap as TimelineActivityHeatmap,
  type ActivityHeatmapProps as TimelineActivityHeatmapProps,
} from "./timeline/activity-heatmap.js";
export { MonthCalendar, type MonthCalendarProps } from "./timeline/month-calendar.js";
export { TimelinePage, type TimelinePageProps } from "./timeline/timeline-page.js";
