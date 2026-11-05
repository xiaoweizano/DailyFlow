# DailyFlow Usability, Editor, and Desktop Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved DailyFlow usability, data reliability, editor, knowledge/help, annual heatmap, report-draft, and Windows candidate-build changes without changing the established local-first architecture.

**Architecture:** Keep Domain and Application independent of platform APIs. Fix IPC and error contracts first, then implement desktop lifecycle and preferences through typed ports, extend the Tiptap JSON schema with idempotent migration, and finish with UI workflows, E2E coverage, and CI artifacts.

**Tech Stack:** pnpm workspace, Turborepo, React 19, TypeScript, Vite, Tauri 2, Rust, SQLite, Dexie, Zod, Zustand, Tiptap 3, Vitest, Playwright.

---

## File Map

### Data reliability and IPC

- Modify: `packages/infrastructure/src/desktop/tauri-contracts.ts`
- Modify: `packages/infrastructure/src/desktop/desktop-task-repository.ts`
- Modify: `packages/application/src/ports/port-error.ts`
- Modify: `packages/infrastructure/src/desktop/tauri-client.ts`
- Modify: `packages/features/src/tasks/tasks-page.tsx`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Test: `packages/infrastructure/test/desktop-contracts.test.ts`
- Test: `packages/infrastructure/test/desktop-task-repository.test.ts`
- Test: `packages/features/test/tasks.test.tsx`
- Test: `apps/desktop/src-tauri/tests/contract_fixtures.rs`

### Desktop lifecycle, settings, and storage location

- Create: `apps/desktop/src-tauri/src/lifecycle/mod.rs`
- Create: `apps/desktop/src-tauri/src/storage_location.rs`
- Create: `packages/features/src/preferences/preferences-schema.ts`
- Create: `packages/features/src/preferences/messages.ts`
- Create: `packages/features/src/settings/settings-navigation.tsx`
- Create: `packages/features/src/settings/settings-section.tsx`
- Create: `packages/features/src/settings/data-storage-settings.tsx`
- Create: `packages/features/src/settings/about-settings.tsx`
- Create: `packages/ui/src/components/switch.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/src/install-desktop-close-guard.ts`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `packages/application/src/use-cases/settings.ts`
- Modify: `packages/features/src/settings/settings-page.tsx`
- Modify: `packages/features/src/preferences/apply-visual-preferences.ts`
- Modify: `packages/features/src/preferences/user-preferences-runtime.ts`
- Modify: `packages/ui/src/styles/globals.css`
- Test: `apps/desktop/test/desktop-close-guard.test.ts`
- Test: `packages/application/test/settings.test.ts`
- Test: `packages/features/test/settings.test.tsx`

### Editor schema and workflow

- Create: `packages/editor/src/extensions/markdown-shortcuts.ts`
- Create: `packages/editor/src/extensions/editor-blocks.ts`
- Create: `packages/editor/src/extensions/attachment-image.ts`
- Create: `packages/editor/src/serialization/migrate-document.ts`
- Create: `packages/editor/src/serialization/document-outline.ts`
- Create: `packages/editor/src/serialization/markdown-document.ts`
- Create: `packages/features/src/journal/editor-outline.tsx`
- Create: `packages/features/src/journal/slash-command.tsx`
- Create: `packages/features/src/journal/journal-import-export.tsx`
- Create: `packages/features/src/journal/version-comparison.tsx`
- Create: `packages/features/src/journal/editor-help.tsx`
- Modify: `packages/editor/src/schema/schema-version.ts`
- Modify: `packages/editor/src/schema/create-editor-schema.ts`
- Modify: `packages/editor/src/serialization/json-to-markdown.ts`
- Modify: `packages/editor/src/serialization/markdown-to-json.ts`
- Modify: `packages/editor/src/serialization/normalize-document.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/features/src/journal/journal-editor-extensions.ts`
- Modify: `packages/features/src/journal/editor-toolbar.tsx`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/history-panel.tsx`
- Test: `packages/editor/test/markdown-shortcuts.test.ts`
- Test: `packages/editor/test/schema-migration.test.ts`
- Test: `packages/editor/test/markdown-document.test.ts`
- Test: `packages/features/test/journal-editor-blocks.test.tsx`
- Test: `packages/features/test/journal-import-export.test.tsx`

### Knowledge, help, heatmap, and report drafts

- Create: `packages/features/src/help/help-content.ts`
- Create: `packages/features/src/help/help-center.tsx`
- Create: `packages/features/src/help/content/zh-CN/quick-start.md`
- Create: `packages/features/src/help/content/zh-CN/journal.md`
- Create: `packages/features/src/help/content/zh-CN/tasks.md`
- Create: `packages/features/src/help/content/zh-CN/knowledge.md`
- Create: `packages/features/src/help/content/zh-CN/data.md`
- Create: `packages/features/src/help/content/en-US/quick-start.md`
- Create: `packages/features/src/help/content/en-US/journal.md`
- Create: `packages/features/src/help/content/en-US/tasks.md`
- Create: `packages/features/src/help/content/en-US/knowledge.md`
- Create: `packages/features/src/help/content/en-US/data.md`
- Create: `packages/features/src/knowledge/knowledge-source-link.tsx`
- Create: `packages/features/src/timeline/annual-heatmap.tsx`
- Create: `packages/features/src/timeline/annual-heatmap-data.ts`
- Create: `packages/features/src/analytics/report-draft-store.ts`
- Modify: `packages/application/src/queries/timeline-query.ts`
- Modify: `packages/application/src/services/app-services.ts`
- Modify: `packages/infrastructure/src/desktop/desktop-timeline-query.ts`
- Modify: `packages/infrastructure/src/web/dexie-timeline-query.ts`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/knowledge/knowledge-detail.tsx`
- Modify: `packages/features/src/knowledge/knowledge-page.tsx`
- Modify: `packages/features/src/timeline/timeline-page.tsx`
- Modify: `packages/features/src/dashboard/activity-heatmap.tsx`
- Modify: `packages/features/src/analytics/analytics-page.tsx`
- Modify: `packages/features/src/app-shell.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/desktop/src/routes/router.tsx`
- Test: `packages/features/test/knowledge.test.tsx`
- Test: `packages/features/test/annual-heatmap.test.tsx`
- Test: `packages/features/test/analytics.test.tsx`
- Test: `packages/application/test/promote-to-knowledge.test.ts`

### End-to-end, desktop, and release

- Modify: `apps/web/e2e/journal.spec.ts`
- Modify: `apps/web/e2e/import-export.spec.ts`
- Modify: `apps/web/e2e/accessibility.spec.ts`
- Create: `apps/web/e2e/usability-workflows.spec.ts`
- Modify: `apps/desktop/e2e/smoke.spec.ts`
- Modify: `scripts/run-desktop-smoke.ps1`
- Modify: `scripts/run-desktop-smoke.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `.github/workflows/candidate-desktop.yml`
- Create: `docs/guides/USER-GUIDE.md`

---

### Task 1: Repair Task Write Contracts and Visible Errors

**Files:**
- Modify: `packages/infrastructure/src/desktop/tauri-contracts.ts`
- Modify: `packages/infrastructure/src/desktop/desktop-task-repository.ts`
- Modify: `packages/application/src/ports/port-error.ts`
- Modify: `packages/infrastructure/src/desktop/tauri-client.ts`
- Modify: `packages/features/src/tasks/tasks-page.tsx`
- Test: `packages/infrastructure/test/desktop-contracts.test.ts`
- Test: `packages/infrastructure/test/desktop-task-repository.test.ts`
- Test: `packages/features/test/tasks.test.tsx`

- [ ] **Step 1: Write the failing contract test**

```ts
it("accepts a new task write with revision zero", () => {
  const command = {
    task: { ...savedTaskFixture, revision: 0 },
    expectedRevision: null,
  };

  expect(TaskWriteCommandDtoSchema.parse(command).task.revision).toBe(0);
  expect(() => TaskDtoSchema.parse(command.task)).toThrow();
});
```

- [ ] **Step 2: Run the focused test and confirm the current schema rejects revision zero**

Run: `pnpm --filter @dailyflow/infrastructure test -- desktop-contracts.test.ts`

Expected: FAIL because `TaskSaveCommandDtoSchema` currently requires `revision >= 1`.

- [ ] **Step 3: Split response and write DTOs**

```ts
const TaskWriteDtoSchema = TaskDtoSchema.extend({
  revision: z.number().int().nonnegative(),
});

export const TaskSaveCommandDtoSchema = z.object({
  task: TaskWriteDtoSchema,
  expectedRevision: z.number().int().positive().nullable(),
});
```

- [ ] **Step 4: Preserve stable errors through the desktop adapter**

```ts
function mapInvokeError(error: unknown): PortError {
  if (error instanceof PortError) {
    return error;
  }
  const code = readErrorCode(error);
  return code === "PERMISSION_DENIED" || code === "DIALOG_CANCELLED"
    ? new PortError(code, readErrorMessage(error))
    : new PortError("STORAGE_UNAVAILABLE", "Local storage is unavailable.");
}
```

- [ ] **Step 5: Replace manual task date text with a date input**

```tsx
<Input
  aria-label="待办截止日期"
  type="date"
  value={dueDate}
  onChange={(event) => setDueDate(event.currentTarget.value)}
/>
```

- [ ] **Step 6: Run focused and regression tests**

Run: `pnpm --filter @dailyflow/infrastructure test -- desktop-contracts.test.ts desktop-task-repository.test.ts`

Run: `pnpm --filter @dailyflow/features test -- tasks.test.tsx`

Expected: PASS.

- [ ] **Step 7: Check Git changes and commit**

Run: `git diff --check`

Run: `git status --short`

```bash
git add packages/infrastructure/src/desktop/tauri-contracts.ts \
  packages/infrastructure/src/desktop/desktop-task-repository.ts \
  packages/application/src/ports/port-error.ts \
  packages/infrastructure/src/desktop/tauri-client.ts \
  packages/features/src/tasks/tasks-page.tsx \
  packages/infrastructure/test/desktop-contracts.test.ts \
  packages/infrastructure/test/desktop-task-repository.test.ts \
  packages/features/test/tasks.test.tsx
git commit -m "fix: restore task creation and storage error handling"
```

### Task 2: Enable Desktop File Save Dialogs and Verify Import Commit

**Files:**
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `packages/infrastructure/src/desktop/desktop-export-target.ts`
- Modify: `packages/infrastructure/src/desktop/desktop-backup-target.ts`
- Modify: `apps/desktop/src-tauri/src/db/import_repository.rs`
- Test: `packages/infrastructure/test/desktop-export.test.ts`
- Test: `packages/infrastructure/test/desktop-backup.test.ts`
- Test: `apps/desktop/src-tauri/tests/export_files.rs`
- Test: `apps/desktop/src-tauri/tests/import_transaction.rs`

- [ ] **Step 1: Add a failing capability assertion**

```ts
it("grants save dialogs without broad filesystem permissions", async () => {
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  expect(capability.permissions).toContain("dialog:allow-save");
  expect(capability.permissions).not.toContain("fs:allow-all");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @dailyflow/infrastructure test -- desktop-export.test.ts`

Expected: FAIL because `dialog:allow-save` is absent.

- [ ] **Step 3: Add the minimal capability**

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-destroy",
    "dialog:allow-open",
    "dialog:allow-save"
  ]
}
```

- [ ] **Step 4: Add import transaction tests for rollback and snapshot fields**

```rust
#[test]
fn failed_import_batch_rolls_back_journal_and_search_rows() {
    let fixture = ImportFixture::new();
    let before = fixture.journal_count();
    let result = fixture.commit_invalid_second_row();
    assert!(result.is_err());
    assert_eq!(fixture.journal_count(), before);
    assert_eq!(fixture.search_document_count(), 0);
}
```

- [ ] **Step 5: Run TypeScript and Rust focused tests**

Run: `pnpm --filter @dailyflow/infrastructure test -- desktop-export.test.ts desktop-backup.test.ts`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml import_transaction export_files`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/capabilities/default.json \
  packages/infrastructure/src/desktop/desktop-export-target.ts \
  packages/infrastructure/src/desktop/desktop-backup-target.ts \
  apps/desktop/src-tauri/src/db/import_repository.rs \
  packages/infrastructure/test/desktop-export.test.ts \
  packages/infrastructure/test/desktop-backup.test.ts \
  apps/desktop/src-tauri/tests/export_files.rs \
  apps/desktop/src-tauri/tests/import_transaction.rs
git commit -m "fix: allow desktop file writes and verify import rollback"
```

### Task 3: Add Tray Lifecycle and Close-to-Tray Behavior

**Files:**
- Create: `apps/desktop/src-tauri/src/lifecycle/mod.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/install-desktop-close-guard.ts`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Test: `apps/desktop/test/desktop-close-guard.test.ts`

- [ ] **Step 1: Write the failing close-guard test**

```ts
it("prevents close and hides the window while close-to-tray is enabled", async () => {
  const close = createDesktopCloseGuard({ closeToTray: () => true });
  const event = { preventDefault: vi.fn() };
  await close(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(hideToTray).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @dailyflow/desktop test -- desktop-close-guard.test.ts`

Expected: FAIL because the guard does not call a lifecycle port.

- [ ] **Step 3: Implement a typed lifecycle port**

```ts
export interface DesktopLifecyclePort {
  hideToTray(): Promise<void>;
  quit(): Promise<void>;
  setCloseToTray(enabled: boolean): Promise<void>;
}
```

- [ ] **Step 4: Add a Rust tray with explicit menu commands**

```rust
let open = MenuItem::with_id(app, "open", "打开 DailyFlow", true, None::<&str>)?;
let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&open, &settings, &quit])?;
```

- [ ] **Step 5: Intercept close and hide instead of destroying**

```rust
window.on_window_event(|event| {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if !EXPLICIT_QUIT.load(Ordering::SeqCst) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
});
```

- [ ] **Step 6: Run tests and verify process behavior**

Run: `pnpm --filter @dailyflow/desktop test -- desktop-close-guard.test.ts`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml lifecycle`

Run: `pnpm --filter @dailyflow/desktop build`

Expected: PASS; closing through the controlled desktop smoke hides the process and tray Quit exits it.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/lifecycle/mod.rs \
  apps/desktop/src-tauri/src/main.rs \
  apps/desktop/src-tauri/src/lib.rs \
  apps/desktop/src/install-desktop-close-guard.ts \
  apps/desktop/src-tauri/tauri.conf.json \
  apps/desktop/test/desktop-close-guard.test.ts
git commit -m "feat: keep DailyFlow available from the desktop tray"
```

### Task 4: Migrate Preferences and Rebuild Settings Navigation

**Files:**
- Create: `packages/features/src/preferences/preferences-schema.ts`
- Create: `packages/features/src/preferences/messages.ts`
- Create: `packages/features/src/settings/settings-navigation.tsx`
- Create: `packages/features/src/settings/settings-section.tsx`
- Create: `packages/features/src/settings/data-storage-settings.tsx`
- Create: `packages/features/src/settings/about-settings.tsx`
- Create: `packages/ui/src/components/switch.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Modify: `packages/application/src/use-cases/settings.ts`
- Modify: `packages/features/src/settings/settings-page.tsx`
- Modify: `packages/features/src/preferences/apply-visual-preferences.ts`
- Modify: `packages/features/src/preferences/user-preferences-runtime.ts`
- Modify: `packages/ui/src/styles/globals.css`
- Test: `packages/application/test/settings.test.ts`
- Test: `packages/features/test/settings.test.tsx`

- [ ] **Step 1: Write failing preference migration tests**

```ts
it("migrates legacy preferences without losing valid values", () => {
  const parsed = UserPreferencesSchema.parse({
    theme: "dark",
    density: "compact",
    autosaveIntervalMs: 1200,
  });
  expect(parsed.schemaVersion).toBe(2);
  expect(parsed.theme).toBe("dark");
  expect(parsed.locale).toBe("zh-CN");
  expect(parsed.closeToTray).toBe(true);
});
```

- [ ] **Step 2: Run the failing migration test**

Run: `pnpm --filter @dailyflow/application test -- settings.test.ts`

Expected: FAIL because `schemaVersion`, `locale`, and desktop settings do not exist.

- [ ] **Step 3: Add the v2 preference schema**

```ts
export const UserPreferencesSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  accent: z.enum(["blue", "green", "amber", "rose", "neutral"]).default("blue"),
  density: z.enum(["comfortable", "compact", "spacious"]).default("comfortable"),
  editorFontSize: z.number().int().min(13).max(20).default(15),
  editorWidth: z.enum(["focused", "wide"]).default("wide"),
  showOutline: z.boolean().default(true),
  autosaveIntervalMs: z.number().int().min(200).max(10_000).default(800),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  showWarnings: z.boolean().default(true),
  closeToTray: z.boolean().default(true),
  autostart: z.boolean().default(false),
  silentStart: z.boolean().default(false),
  customDataDirectory: z.string().min(1).nullable().default(null),
  historyRetention: HistoryRetentionSchema,
});
```

- [ ] **Step 4: Add a real switch primitive**

```tsx
<button
  type="button"
  role="switch"
  aria-checked={checked}
  className="df-switch"
  onClick={() => onChange(!checked)}
>
  <span className="df-switch-thumb" aria-hidden="true" />
</button>
```

- [ ] **Step 5: Build categorized settings navigation**

```tsx
const sections = [
  { id: "general", label: t.settings.general, icon: Settings2 },
  { id: "appearance", label: t.settings.appearance, icon: Palette },
  { id: "editor", label: t.settings.editor, icon: PenLine },
  { id: "data", label: t.settings.data, icon: Database },
  { id: "about", label: t.settings.about, icon: Info },
] as const;
```

- [ ] **Step 6: Make density and theme tokens effective**

```css
[data-density="compact"] {
  --control-height: 2rem;
  --settings-row-gap: 0.5rem;
  --panel-padding: 0.875rem;
}

[data-density="spacious"] {
  --control-height: 2.75rem;
  --settings-row-gap: 1.25rem;
  --panel-padding: 1.5rem;
}

[data-accent="green"] {
  --primary: 151 55% 36%;
}
```

- [ ] **Step 7: Run tests and inspect settings at narrow and wide viewports**

Run: `pnpm --filter @dailyflow/application test -- settings.test.ts`

Run: `pnpm --filter @dailyflow/features test -- settings.test.tsx`

Run: `pnpm --filter @dailyflow/features typecheck`

Expected: PASS and no switch overflow at 1024px.

- [ ] **Step 8: Commit**

```bash
git add packages/features/src/preferences/preferences-schema.ts \
  packages/features/src/preferences/messages.ts \
  packages/features/src/settings \
  packages/ui/src/components/switch.tsx \
  packages/ui/src/components/select.tsx \
  packages/application/src/use-cases/settings.ts \
  packages/features/src/preferences \
  packages/ui/src/styles/globals.css \
  packages/application/test/settings.test.ts \
  packages/features/test/settings.test.tsx
git commit -m "feat: rebuild settings with typed preferences"
```

### Task 5: Implement Autostart, Silent Start, and Safe Data-Location Migration

**Files:**
- Create: `apps/desktop/src-tauri/src/storage_location.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `packages/features/src/settings/data-storage-settings.tsx`
- Modify: `packages/features/src/preferences/user-preferences-runtime.ts`
- Test: `apps/desktop/src-tauri/tests/storage_location.rs`
- Test: `packages/features/test/settings.test.tsx`

- [ ] **Step 1: Write the failing migration rollback test**

```rust
#[test]
fn migration_keeps_the_original_database_when_validation_fails() {
    let fixture = StorageFixture::new();
    let original = fixture.database_path();
    let result = fixture.migrate_to_with_corrupt_copy();
    assert!(result.is_err());
    assert_eq!(fixture.configured_location(), original.parent().unwrap());
    assert!(original.exists());
}
```

- [ ] **Step 2: Run the failing test**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml storage_location`

Expected: FAIL because no storage-location module exists.

- [ ] **Step 3: Add autostart through the official Tauri plugin**

```toml
tauri-plugin-autostart = "2"
```

```rust
use tauri_plugin_autostart::MacosLauncher;

tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--silent-start"]),
    ))
```

- [ ] **Step 4: Implement backup-copy-verify-switch migration**

```rust
pub fn migrate_data_dir(source: &Path, destination: &Path) -> Result<MigrationReceipt, MigrationError> {
    let backup = create_migration_backup(source)?;
    let staging = destination.join(".dailyflow-migration");
    copy_dailyflow_data(source, &staging)?;
    verify_database(&staging.join("dailyflow.sqlite3"))?;
    verify_attachments(source, &staging)?;
    replace_directory_atomically(&staging, destination)?;
    Ok(MigrationReceipt { backup, destination: destination.to_path_buf() })
}
```

- [ ] **Step 5: Gate desktop controls by capability**

```tsx
{capabilities.dataLocationMigration ? (
  <Button onClick={() => void chooseAndMigrate()}>更改存储位置</Button>
) : (
  <p>浏览器存储位置由浏览器管理。</p>
)}
```

- [ ] **Step 6: Run Rust and feature tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml storage_location`

Run: `pnpm --filter @dailyflow/features test -- settings.test.tsx`

Expected: PASS and original data remains usable after injected failure.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/storage_location.rs \
  apps/desktop/src-tauri/src/main.rs \
  apps/desktop/src-tauri/src/lib.rs \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/capabilities/default.json \
  packages/features/src/settings/data-storage-settings.tsx \
  packages/features/src/preferences/user-preferences-runtime.ts \
  apps/desktop/src-tauri/tests/storage_location.rs \
  packages/features/test/settings.test.tsx
git commit -m "feat: add safe desktop startup and storage controls"
```

### Task 6: Fix Markdown Shortcuts and Editor Layout

**Files:**
- Create: `packages/editor/src/extensions/markdown-shortcuts.ts`
- Modify: `packages/editor/src/schema/create-editor-schema.ts`
- Modify: `packages/features/src/journal/journal-editor-extensions.ts`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/journal-page.tsx`
- Modify: `packages/ui/src/styles/globals.css`
- Test: `packages/editor/test/markdown-shortcuts.test.ts`
- Test: `packages/features/test/journal-page.test.tsx`

- [ ] **Step 1: Write failing shortcut tests for half-width and full-width spaces**

```ts
it.each([
  ["## 标题", 2, "标题"],
  ["##　标题", 2, "标题"],
])("converts %s into heading level %i", (input, level, text) => {
  const editor = createTestEditor();
  typeText(editor, input);
  expect(editor.getJSON().content?.[0]).toMatchObject({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  });
});
```

- [ ] **Step 2: Add a negative code-block test**

```ts
it("does not convert heading syntax inside a code block", () => {
  const editor = createTestEditor({ content: "<pre><code>## 标题</code></pre>" });
  typeText(editor, "\n## 标题");
  expect(editor.getJSON().content?.[0]?.type).toBe("codeBlock");
});
```

- [ ] **Step 3: Run and observe the current failure**

Run: `pnpm --filter @dailyflow/editor test -- markdown-shortcuts.test.ts`

Expected: FAIL for full-width space and code-block protection.

- [ ] **Step 4: Implement the input rule**

```ts
export const MarkdownShortcuts = Extension.create({
  name: "dailyflowMarkdownShortcuts",
  addInputRules() {
    return [1, 2, 3].map((level) =>
      textblockTypeInputRule({
        find: new RegExp(`^(#{${level}})[\\s\\u3000]+$`, "u"),
        type: this.editor.schema.nodes.heading,
        getAttributes: () => ({ level }),
      }),
    );
  },
});
```

- [ ] **Step 5: Remove natural-height gaps from the editor page**

```tsx
<div className="flex min-h-0 flex-1 flex-col">
  <JournalEditor lookup={lookup} onRestored={handleRestored} />
</div>
```

```css
.df-journal-prosemirror {
  min-height: 100%;
  padding-bottom: 30vh;
}
```

- [ ] **Step 6: Run focused and regression tests**

Run: `pnpm --filter @dailyflow/editor test -- markdown-shortcuts.test.ts roundtrip.test.ts`

Run: `pnpm --filter @dailyflow/features test -- journal-page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/extensions/markdown-shortcuts.ts \
  packages/editor/src/schema/create-editor-schema.ts \
  packages/features/src/journal/journal-editor-extensions.ts \
  packages/features/src/journal/journal-editor.tsx \
  packages/features/src/journal/journal-page.tsx \
  packages/ui/src/styles/globals.css \
  packages/editor/test/markdown-shortcuts.test.ts \
  packages/features/test/journal-page.test.tsx
git commit -m "fix: make markdown shortcuts and journal layout predictable"
```

### Task 7: Extend the Editor Schema with Idempotent Migration

**Files:**
- Create: `packages/editor/src/serialization/migrate-document.ts`
- Modify: `packages/editor/src/schema/schema-version.ts`
- Modify: `packages/editor/src/schema/create-editor-schema.ts`
- Modify: `packages/editor/src/schema/editor-types.ts`
- Modify: `packages/editor/src/serialization/normalize-document.ts`
- Modify: `packages/editor/src/index.ts`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Test: `packages/editor/test/schema-migration.test.ts`

- [ ] **Step 1: Write a failing preservation test**

```ts
it("preserves unknown nodes while migrating known content", () => {
  const legacy = doc([
    paragraph("kept"),
    { type: "futureVisualization", attrs: { source: "keep-me" } },
  ]);
  const migrated = migrateDocument(legacy, 1, 2);
  expect(migrated.doc.content).toContainEqual({
    type: "futureVisualization",
    attrs: { source: "keep-me" },
  });
  expect(migrateDocument(migrated.doc, 2, 2)).toEqual(migrated);
});
```

- [ ] **Step 2: Run and confirm version 2 does not exist**

Run: `pnpm --filter @dailyflow/editor test -- schema-migration.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add schema version and migration registry**

```ts
export const CURRENT_EDITOR_SCHEMA_VERSION = 2;

const migrations: Record<number, (doc: TiptapJsonNode) => TiptapJsonNode> = {
  1: migrateV1ToV2,
};

export function migrateDocument(doc: TiptapJsonNode, from: number, to = CURRENT_EDITOR_SCHEMA_VERSION) {
  let current = structuredClone(doc);
  for (let version = from; version < to; version += 1) {
    current = migrations[version]?.(current) ?? current;
  }
  return { doc: current, schemaVersion: to };
}
```

- [ ] **Step 4: Keep unknown JSON nodes in the editor round trip**

```ts
const UnknownNode = Node.create({
  name: "unknown",
  group: "block",
  atom: true,
  addAttributes: () => ({
    originalType: {},
    originalAttrs: {},
    originalContent: {},
  }),
});
```

- [ ] **Step 5: Run migration and serialization fixtures**

Run: `pnpm --filter @dailyflow/editor test`

Expected: PASS with existing round-trip fixtures unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/serialization/migrate-document.ts \
  packages/editor/src/schema \
  packages/editor/src/serialization/normalize-document.ts \
  packages/editor/src/index.ts \
  packages/features/src/journal/journal-editor.tsx \
  packages/editor/test/schema-migration.test.ts
git commit -m "feat: version the editor schema with lossless migration"
```

### Task 8: Add Blocks, Slash Commands, Outline, Images, Tables, and Version Comparison

**Files:**
- Create: `packages/editor/src/extensions/editor-blocks.ts`
- Create: `packages/editor/src/extensions/attachment-image.ts`
- Create: `packages/editor/src/serialization/document-outline.ts`
- Create: `packages/features/src/journal/editor-outline.tsx`
- Create: `packages/features/src/journal/slash-command.tsx`
- Create: `packages/features/src/journal/version-comparison.tsx`
- Modify: `packages/editor/package.json`
- Modify: `packages/editor/src/schema/create-editor-schema.ts`
- Modify: `packages/features/src/journal/journal-editor-extensions.ts`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/editor-toolbar.tsx`
- Modify: `packages/features/src/journal/history-panel.tsx`
- Test: `packages/editor/test/document-outline.test.ts`
- Test: `packages/features/test/journal-editor-blocks.test.tsx`

- [ ] **Step 1: Write failing outline and table tests**

```ts
it("builds a stable outline from heading levels", () => {
  expect(buildDocumentOutline(doc([
    heading(2, "Issue"),
    heading(3, "Cause"),
    heading(2, "Solution"),
  ]))).toEqual([
    { level: 2, text: "Issue", position: expect.any(Number) },
    { level: 3, text: "Cause", position: expect.any(Number) },
    { level: 2, text: "Solution", position: expect.any(Number) },
  ]);
});
```

```tsx
it("inserts a three-column table from the slash menu", async () => {
  const editor = renderJournalEditor();
  await userEvent.type(editor, "/table");
  await userEvent.click(screen.getByRole("menuitem", { name: "表格" }));
  expect(editor.getJSON().content?.at(-1)?.type).toBe("table");
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @dailyflow/editor test -- document-outline.test.ts`

Run: `pnpm --filter @dailyflow/features test -- journal-editor-blocks.test.tsx`

Expected: FAIL because outline and table commands do not exist.

- [ ] **Step 3: Add Tiptap extensions**

```ts
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";

export function createEditorExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    Link.configure({ autolink: true, openOnClick: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: false, allowBase64: false }),
    Attachment,
    StructuredBlock,
    MarkdownShortcuts,
  ];
}
```

- [ ] **Step 4: Add block drag and slash commands**

```ts
const commands = [
  { id: "heading-1", label: "一级标题", keywords: ["h1", "标题"], run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "bullet-list", label: "项目列表", keywords: ["list"], run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "table", label: "表格", keywords: ["table"], run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
] as const;
```

- [ ] **Step 5: Render the outline in a fixed-width right rail**

```tsx
<aside className="df-editor-outline min-h-0 border-l border-border">
  {outline.map((item) => (
    <button key={`${item.position}:${item.text}`} onClick={() => scrollTo(item.position)}>
      {item.text}
    </button>
  ))}
</aside>
```

- [ ] **Step 6: Add version comparison in the history panel**

```tsx
<VersionComparison
  current={currentMarkdown}
  historical={selectedVersion.contentMarkdown}
  mode="side-by-side"
/>
```

- [ ] **Step 7: Run focused tests and dependency checks**

Run: `pnpm --filter @dailyflow/editor test`

Run: `pnpm --filter @dailyflow/features test -- journal-editor-blocks.test.tsx history-panel.test.tsx`

Run: `pnpm depcruise`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/extensions/editor-blocks.ts \
  packages/editor/src/extensions/attachment-image.ts \
  packages/editor/src/serialization/document-outline.ts \
  packages/features/src/journal/editor-outline.tsx \
  packages/features/src/journal/slash-command.tsx \
  packages/features/src/journal/version-comparison.tsx \
  packages/editor/package.json \
  packages/editor/src/schema/create-editor-schema.ts \
  packages/features/src/journal \
  packages/editor/test/document-outline.test.ts \
  packages/features/test/journal-editor-blocks.test.tsx
git commit -m "feat: add block authoring tools and document outline"
```

### Task 9: Complete Markdown Documents, Highlighting, Math, and Mermaid

**Files:**
- Create: `packages/editor/src/extensions/editor-rich-content.ts`
- Create: `packages/editor/src/serialization/markdown-document.ts`
- Create: `packages/features/src/journal/journal-import-export.tsx`
- Create: `packages/features/src/journal/mermaid-node-view.tsx`
- Modify: `packages/editor/package.json`
- Modify: `packages/editor/src/serialization/markdown-to-json.ts`
- Modify: `packages/editor/src/serialization/json-to-markdown.ts`
- Modify: `packages/editor/src/schema/create-editor-schema.ts`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/editor-toolbar.tsx`
- Test: `packages/editor/test/markdown-document.test.ts`
- Test: `packages/features/test/journal-import-export.test.tsx`

- [ ] **Step 1: Write failing Markdown round-trip tests**

```ts
it("round-trips tables, code, math, and Mermaid blocks", () => {
  const source = [
    "| A | B |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```ts",
    "const value = 1;",
    "```",
    "",
    "$$",
    "a^2 + b^2 = c^2",
    "$$",
    "",
    "```mermaid",
    "graph TD; A-->B;",
    "```",
  ].join("\n");
  expect(jsonToMarkdown(markdownToJson(source))).toContain("graph TD; A-->B;");
});
```

- [ ] **Step 2: Run and see unsupported nodes fail**

Run: `pnpm --filter @dailyflow/editor test -- markdown-document.test.ts`

Expected: FAIL.

- [ ] **Step 3: Add local code highlighting, KaTeX, and Mermaid extensions**

```ts
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Mathematics from "@tiptap/extension-mathematics";

return [
  CodeBlockLowlight.configure({ lowlight }),
  Mathematics.configure({ katexOptions: { throwOnError: false } }),
  MermaidBlock,
];
```

- [ ] **Step 4: Implement single-document Markdown dialogs**

```tsx
<Button onClick={() => void importMarkdown()}>
  <FileUp aria-hidden="true" /> 导入 Markdown
</Button>
<Button onClick={() => void exportMarkdown()}>
  <FileDown aria-hidden="true" /> 导出 Markdown
</Button>
```

- [ ] **Step 5: Render Mermaid with strict security**

```ts
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: false,
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default",
});
```

- [ ] **Step 6: Run editor and feature tests**

Run: `pnpm --filter @dailyflow/editor test -- markdown-document.test.ts roundtrip.test.ts`

Run: `pnpm --filter @dailyflow/features test -- journal-import-export.test.tsx`

Expected: PASS, and no CDN/network request is made.

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/extensions/editor-rich-content.ts \
  packages/editor/src/serialization/markdown-document.ts \
  packages/features/src/journal/journal-import-export.tsx \
  packages/features/src/journal/mermaid-node-view.tsx \
  packages/editor/package.json \
  packages/editor/src/serialization \
  packages/editor/src/schema/create-editor-schema.ts \
  packages/features/src/journal/journal-editor.tsx \
  packages/features/src/journal/editor-toolbar.tsx \
  packages/editor/test/markdown-document.test.ts \
  packages/features/test/journal-import-export.test.tsx
git commit -m "feat: support complete markdown and technical content"
```

### Task 10: Make Knowledge Provenance Visible and Add the Help Center

**Files:**
- Create: `packages/features/src/help/help-content.ts`
- Create: `packages/features/src/help/help-center.tsx`
- Create: `packages/features/src/help/content/zh-CN/quick-start.md`
- Create: `packages/features/src/help/content/zh-CN/journal.md`
- Create: `packages/features/src/help/content/zh-CN/tasks.md`
- Create: `packages/features/src/help/content/zh-CN/knowledge.md`
- Create: `packages/features/src/help/content/zh-CN/data.md`
- Create: `packages/features/src/help/content/en-US/quick-start.md`
- Create: `packages/features/src/help/content/en-US/journal.md`
- Create: `packages/features/src/help/content/en-US/tasks.md`
- Create: `packages/features/src/help/content/en-US/knowledge.md`
- Create: `packages/features/src/help/content/en-US/data.md`
- Create: `packages/features/src/knowledge/knowledge-source-link.tsx`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/knowledge/knowledge-detail.tsx`
- Modify: `packages/features/src/knowledge/knowledge-page.tsx`
- Modify: `packages/features/src/app-shell.tsx`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/web/src/routes/router.tsx`
- Modify: `apps/desktop/src/routes/router.tsx`
- Test: `packages/application/test/promote-to-knowledge.test.ts`
- Test: `packages/features/test/knowledge.test.tsx`

- [ ] **Step 1: Write a failing snapshot-independence test**

```ts
it("does not mutate knowledge when the source journal changes", async () => {
  const promoted = await promoteWholeJournal(fixture.journal);
  await fixture.journalRepository.saveChangedContent(fixture.journal.id, "changed");
  const knowledge = await fixture.knowledgeRepository.get(promoted.id);
  expect(knowledge?.content).toEqual(promoted.content);
});
```

- [ ] **Step 2: Run and verify the missing provenance assertion**

Run: `pnpm --filter @dailyflow/application test -- promote-to-knowledge.test.ts`

Expected: FAIL if content or source linkage is copied incorrectly.

- [ ] **Step 3: Add source navigation**

```tsx
<Link to={`/journal/${source.journalDate}#block-${source.blockId}`}>
  <CornerUpLeft aria-hidden="true" />
  回到来源日志
</Link>
```

- [ ] **Step 4: Add promotion commands to the journal UI**

```tsx
<Button onClick={() => void promoteJournal()}>
  <BookPlus aria-hidden="true" /> 沉淀整篇日志
</Button>
```

- [ ] **Step 5: Register the help route**

```tsx
{
  path: "help/*",
  element: <HelpCenter />,
}
```

- [ ] **Step 6: Write complete bilingual quick starts**

```markdown
# DailyFlow 快速开始

1. 在“每日日志”选择日期并记录工作内容。
2. 输入 `/` 打开块菜单，或直接输入 Markdown 快捷语法。
3. 在“待办”中创建任务并选择截止日期。
4. 使用“数据管理”导入历史 TXT、导出或备份数据。
5. 使用“知识库”沉淀可复用的经验和解决方案。
```

- [ ] **Step 7: Run knowledge and navigation tests**

Run: `pnpm --filter @dailyflow/application test -- promote-to-knowledge.test.ts`

Run: `pnpm --filter @dailyflow/features test -- knowledge.test.tsx routes.test.tsx app-shell.test.tsx`

Expected: PASS for zh-CN and en-US content routing.

- [ ] **Step 8: Commit**

```bash
git add packages/features/src/help \
  packages/features/src/knowledge \
  packages/features/src/journal/journal-editor.tsx \
  packages/features/src/app-shell.tsx \
  packages/features/src/routes.ts \
  apps/web/src/routes/router.tsx \
  apps/desktop/src/routes/router.tsx \
  packages/application/test/promote-to-knowledge.test.ts \
  packages/features/test/knowledge.test.tsx
git commit -m "feat: connect knowledge provenance and offline help"
```

### Task 11: Replace the Rolling Heatmap with an Annual Accessible View

**Files:**
- Create: `packages/features/src/timeline/annual-heatmap.tsx`
- Create: `packages/features/src/timeline/annual-heatmap-data.ts`
- Modify: `packages/application/src/queries/timeline-query.ts`
- Modify: `packages/application/src/services/app-services.ts`
- Modify: `packages/infrastructure/src/desktop/desktop-timeline-query.ts`
- Modify: `packages/infrastructure/src/web/dexie-timeline-query.ts`
- Modify: `packages/features/src/timeline/timeline-page.tsx`
- Modify: `packages/features/src/dashboard/activity-heatmap.tsx`
- Test: `packages/features/test/annual-heatmap.test.tsx`
- Test: `packages/application/test/core-use-cases.test.ts`

- [ ] **Step 1: Write failing grid and leap-year tests**

```ts
it("renders 371 cells and keeps February 29 in a leap year", () => {
  const data = buildAnnualHeatmapData({ year: 2024, timezone: "Asia/Shanghai", weekStartsOn: 1, days: [] });
  expect(data.cells).toHaveLength(371);
  expect(data.cells.some((cell) => cell.date === "2024-02-29")).toBe(true);
});
```

- [ ] **Step 2: Run and confirm the current 12-week component fails**

Run: `pnpm --filter @dailyflow/features test -- annual-heatmap.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add the annual query**

```ts
export interface AnnualActivityQuery {
  getYear(input: { year: number; timezone: string }): Promise<readonly TimelineDaySummary[]>;
}
```

- [ ] **Step 4: Query one natural-year range and cache by year**

```ts
const cacheKey = `${year}:${timezone}:${weekStartsOn}`;
const days = await services.timeline.getAnnualActivity({ year, timezone });
setAnnualCache(cacheKey, days);
```

- [ ] **Step 5: Implement labels and task corner marker**

```tsx
{cell.taskDueCount > 0 ? (
  <span aria-hidden="true" className="df-heatmap-task-corner" />
) : null}
```

- [ ] **Step 6: Implement roving keyboard focus**

```ts
const nextDate = keyboardDate({
  date: focusedDate,
  key: event.key,
  weekStartsOn,
});
setFocusedDate(nextDate);
focusCell(nextDate);
```

- [ ] **Step 7: Run tests at desktop and mobile viewport**

Run: `pnpm --filter @dailyflow/features test -- annual-heatmap.test.tsx timeline.test.tsx`

Run: `pnpm e2e -- search-timeline.spec.ts`

Expected: PASS; labels remain visible while cells scroll horizontally on mobile.

- [ ] **Step 8: Commit**

```bash
git add packages/features/src/timeline/annual-heatmap.tsx \
  packages/features/src/timeline/annual-heatmap-data.ts \
  packages/application/src/queries/timeline-query.ts \
  packages/application/src/services/app-services.ts \
  packages/infrastructure/src/desktop/desktop-timeline-query.ts \
  packages/infrastructure/src/web/dexie-timeline-query.ts \
  packages/features/src/timeline/timeline-page.tsx \
  packages/features/src/dashboard/activity-heatmap.tsx \
  packages/features/test/annual-heatmap.test.tsx \
  packages/application/test/core-use-cases.test.ts
git commit -m "feat: show an accessible full-year activity heatmap"
```

### Task 12: Preserve Analytics Report Drafts Across Period Changes

**Files:**
- Create: `packages/features/src/analytics/report-draft-store.ts`
- Modify: `packages/features/src/analytics/analytics-page.tsx`
- Modify: `packages/features/src/analytics/report-editor.tsx`
- Test: `packages/features/test/analytics.test.tsx`

- [ ] **Step 1: Write the failing period-switch test**

```tsx
it("restores an unsaved report draft after switching from week to month and back", async () => {
  renderAnalytics();
  await userEvent.click(screen.getByRole("button", { name: "打开周期报告" }));
  await userEvent.type(screen.getByLabelText("报告标题"), "unsaved title");
  await userEvent.click(screen.getByRole("radio", { name: "月" }));
  await userEvent.click(screen.getByRole("radio", { name: "周" }));
  expect(screen.getByLabelText("报告标题")).toHaveValue("unsaved title");
});
```

- [ ] **Step 2: Run and observe the draft loss**

Run: `pnpm --filter @dailyflow/features test -- analytics.test.tsx`

Expected: FAIL because the editor remounts with database content.

- [ ] **Step 3: Create the draft store**

```ts
export interface ReportDraftStore {
  capture(key: string, draft: ReportDraft): void;
  peek(key: string): ReportDraft | null;
  remove(key: string): void;
}

export function reportPeriodKey(period: AnalyticsPeriod): string {
  return `${period.periodType}:${period.start}:${period.end}:${period.timezone}`;
}
```

- [ ] **Step 4: Flush before navigation and restore after mount**

```ts
async function navigatePeriod(nextPeriod: AnalyticsPeriod): Promise<void> {
  await reportController.flush();
  const key = reportPeriodKey(period);
  reportController.captureIfDirty(key);
  navigate(analyticsPath(nextPeriod, reportOpen));
}
```

- [ ] **Step 5: Clear drafts only after successful save**

```ts
if (saved.ok) {
  reportDrafts.remove(reportPeriodKey(period));
}
```

- [ ] **Step 6: Run focused and regression tests**

Run: `pnpm --filter @dailyflow/features test -- analytics.test.tsx`

Run: `pnpm --filter @dailyflow/application test -- analytics.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/features/src/analytics/report-draft-store.ts \
  packages/features/src/analytics/analytics-page.tsx \
  packages/features/src/analytics/report-editor.tsx \
  packages/features/test/analytics.test.tsx
git commit -m "fix: preserve report drafts while switching periods"
```

### Task 13: Add the User Guide and Cross-Link Help

**Files:**
- Create: `docs/guides/USER-GUIDE.md`
- Modify: `README.md`
- Modify: `packages/features/src/help/content/zh-CN/quick-start.md`
- Modify: `packages/features/src/help/content/en-US/quick-start.md`

- [ ] **Step 1: Write the complete Chinese user guide**

The guide must contain concrete sections for:

- 首次启动与数据位置
- 每日日志和自动保存
- Markdown 快捷输入与 Slash 菜单
- 图片、附件、表格、公式和 Mermaid
- 历史版本查看与恢复
- 待办创建、截止日期和完成
- 知识库手动新建、整篇沉淀和块沉淀
- 搜索
- 周/月/年分析与报告
- 月目录 TXT 批量导入
- Markdown 单篇导入导出
- 备份、恢复和存储迁移
- 系统托盘、开机自启和静默启动
- Windows、macOS 和 Web 的能力差异
- 常见错误和恢复方法

- [ ] **Step 2: Add English navigation headings and equivalent short instructions**

```markdown
## Quick Start

1. Open **Journal** and choose a date.
2. Type `/` for block commands or use Markdown shortcuts.
3. Create tasks with the date picker.
4. Use **Data Management** for TXT import, export, and backups.
```

- [ ] **Step 3: Verify all documented controls exist in the application**

Run: `rg -n "托盘|开机自启|静默启动|Markdown|知识库|热力图|版本" docs/guides/USER-GUIDE.md`

Expected: every documented workflow has a corresponding route, button, or tray command in source.

- [ ] **Step 4: Run Markdown format check**

Run: `pnpm format:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/guides/USER-GUIDE.md README.md \
  packages/features/src/help/content/zh-CN/quick-start.md \
  packages/features/src/help/content/en-US/quick-start.md
git commit -m "docs: add the DailyFlow user guide"
```

### Task 14: Add End-to-End Coverage and Fix Platform Regressions

**Files:**
- Create: `apps/web/e2e/usability-workflows.spec.ts`
- Modify: `apps/web/e2e/journal.spec.ts`
- Modify: `apps/web/e2e/import-export.spec.ts`
- Modify: `apps/web/e2e/accessibility.spec.ts`
- Modify: `apps/desktop/e2e/smoke.spec.ts`
- Modify: `scripts/run-desktop-smoke.ps1`
- Modify: `scripts/run-desktop-smoke.sh`

- [ ] **Step 1: Add the failing browser workflow**

```ts
test("creates a task, promotes knowledge, and keeps a report draft", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByLabel("待办标题").fill("发布候选");
  await page.getByLabel("待办截止日期").fill("2026-11-05");
  await page.getByRole("button", { name: "创建待办" }).click();
  await expect(page.getByText("发布候选")).toBeVisible();

  await page.goto("/journal/2026-11-05");
  await page.getByRole("button", { name: "沉淀整篇日志" }).click();
  await expect(page.getByText("来源：2026-11-05")).toBeVisible();
});
```

- [ ] **Step 2: Add accessibility checks for settings and heatmap**

```ts
const results = await new AxeBuilder({ page }).include("main").analyze();
expect(results.violations.filter((item) => item.impact === "serious")).toEqual([]);
```

- [ ] **Step 3: Run Playwright and inspect screenshots**

Run: `pnpm e2e`

Expected: PASS for desktop Chromium and mobile viewport.

- [ ] **Step 4: Run the Windows desktop smoke through CDP**

Run: `pwsh -File scripts/run-desktop-smoke.ps1`

Expected: PASS for launch, task save, settings persistence, window hide, tray command availability, and final explicit exit.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/usability-workflows.spec.ts \
  apps/web/e2e/journal.spec.ts \
  apps/web/e2e/import-export.spec.ts \
  apps/web/e2e/accessibility.spec.ts \
  apps/desktop/e2e/smoke.spec.ts \
  scripts/run-desktop-smoke.ps1 \
  scripts/run-desktop-smoke.sh
git commit -m "test: cover usability and desktop lifecycle workflows"
```

### Task 15: Final Verification, CI, and Windows Candidate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `.github/workflows/candidate-desktop.yml`
- Modify: `README.md`

- [ ] **Step 1: Ensure CI runs all mandatory checks**

```yaml
- name: Verify
  run: |
    pnpm lint
    pnpm format:check
    pnpm depcruise
    pnpm check:dto-fixtures
    pnpm test
    pnpm typecheck
    pnpm build
```

- [ ] **Step 2: Ensure main push builds the unsigned Windows candidate**

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

- [ ] **Step 3: Run the full local verification suite**

Run: `pnpm lint`

Run: `pnpm format:check`

Run: `pnpm depcruise`

Run: `pnpm check:dto-fixtures`

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Run: `pnpm e2e`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: all commands exit zero.

- [ ] **Step 4: Inspect Git status and commit only intended files**

Run: `git status --short`

Expected: no `.acceptance-fixtures/`, `.acceptance-task24-*.png`, or `.superpowers/` files staged.

- [ ] **Step 5: Commit final CI and documentation changes**

```bash
git add .github/workflows/ci.yml \
  .github/workflows/e2e.yml \
  .github/workflows/candidate-desktop.yml \
  README.md
git commit -m "ci: verify DailyFlow candidates on main"
```

- [ ] **Step 6: Push main through the configured proxy**

```powershell
$env:HTTPS_PROXY = "http://192.168.1.2:7890"
$env:HTTP_PROXY = "http://192.168.1.2:7890"
git push origin main
```

Expected: push succeeds and GitHub Actions starts.

- [ ] **Step 7: Trigger and inspect candidate workflow**

Run: `gh workflow run candidate-desktop.yml --ref main`

Run: `gh run list --workflow=candidate-desktop.yml --branch main --limit 1`

Expected: workflow is queued or in progress. Do not create a tag or Release.

- [ ] **Step 8: Verify artifact contents**

Run: `$runId = (gh run list --workflow=candidate-desktop.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId'); gh run download $runId -n "dailyflow-windows-x64-unsigned-$env:GITHUB_SHA"`

Expected: two EXE files, `BUILD-INFO.txt`, and `SHA256SUMS`; checksum verification passes.

## Plan Self-Review

- **Spec coverage:** Tasks 1-2 cover data reliability and file writes; Tasks 3-5 cover desktop lifecycle, settings, i18n/theme, and storage location; Tasks 6-9 cover editor phases two and three; Task 10 covers knowledge and help; Task 11 covers the annual heatmap; Task 12 covers report drafts; Tasks 13-15 cover user documentation, automated tests, CI, and candidate artifacts.
- **Type consistency:** `UserPreferencesSchema`, `DesktopLifecyclePort`, `AnnualActivityQuery`, and `ReportDraftStore` are defined before UI tasks consume them. The new task write contract keeps response `TaskDtoSchema` unchanged and adds only revision-zero write support.
- **Placeholder scan:** The plan contains no deferred implementation markers; every task names exact files, a failing test, the expected failure, implementation shape, verification command, and commit boundary.
- **Scope:** Each task produces a working slice. Cross-cutting preference and editor compiler changes are separated from downstream UI work.
