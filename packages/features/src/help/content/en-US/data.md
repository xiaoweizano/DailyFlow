# Data Management

Data Management covers legacy imports, single-journal exchange, full backups, restores, index maintenance, and storage location.

## Legacy TXT Import

1. Prepare monthly folders such as `202604` and `202605`.
2. Choose the root folder and scan.
3. Review detected dates, duplicates, invalid files, and encodings.
4. Confirm the import strategy.

UTF-8, UTF-8 BOM, and GBK are supported. A failed batch rolls back its database changes. Original text is preserved. Re-running uses incremental import instead of silently replacing existing journals.

## Export and Backup

- Export creates exchangeable Markdown or data files.
- Backup includes the database and attachments and is preferred for recovery.
- Create a fresh backup before restoring older data.

## Search and Analytics

Global search covers journals, knowledge, and tasks. Rebuild the index from Data Management if it becomes stale. Analytics provides week, month, and year reports; unsaved report drafts survive period changes.

## Desktop Features

Desktop supports moving the data directory. Migration creates a safety backup and requires a restart. Close to tray, launch at startup, and silent start are desktop-only controls. The web app uses browser-managed storage.

## Shortcuts

Use `/` or `Ctrl/Cmd + K` for global search, `Ctrl/Cmd + S` to save immediately, and `Ctrl/Cmd + ,` for settings. Open Settings > About > Shortcuts for the platform-specific list.
