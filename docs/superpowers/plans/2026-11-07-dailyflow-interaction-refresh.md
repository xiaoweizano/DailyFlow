# DailyFlow Interaction Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved DailyFlow interaction refresh, including Help Center option B, without replacing the existing Tiptap document model or local-first storage architecture.

**Architecture:** Keep Tiptap JSON as the authoritative journal content and keep the current repository/IPC boundaries. Upgrade the product layer by making locale state globally reactive, adding three-state close behavior, fixing knowledge/task persistence and error mapping, redesigning the journal and timeline interaction flows, and turning the offline manual into a searchable topic-card experience backed by real screenshots.

**Tech Stack:** React 19, React Router 7, TypeScript, Tiptap 3, Vitest, Testing Library, Playwright, Tauri 2, Rust, SQLite, Tailwind CSS, pnpm 11

---

## File Map

### Global locale and settings

- Modify: `packages/application/src/use-cases/settings.ts`
- Modify: `packages/features/src/preferences/app-messages.ts`
- Modify: `packages/features/src/preferences/app-messages-context.tsx`
- Modify: `packages/features/src/preferences/messages.ts`
- Modify: `packages/features/src/settings/settings-page.tsx`
- Modify: `packages/features/test/settings.test.tsx`
- Create: `packages/features/test/global-locale.test.tsx`
- Modify: `apps/desktop/src/composition.ts`
- Modify: `apps/web/src/composition.ts`

### Close behavior

- Modify: `apps/desktop/src/desktop-close-guard.ts`
- Modify: `apps/desktop/src/install-desktop-close-guard.ts`
- Modify: `apps/desktop/src-tauri/src/lifecycle/mod.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/test/desktop-close-guard.test.ts`
- Create: `apps/desktop/src/close-confirmation.tsx`
- Create: `apps/desktop/test/close-confirmation.test.tsx`

### Knowledge and tasks

- Modify: `apps/desktop/src-tauri/src/db/knowledge_repository.rs`
- Modify: `apps/desktop/src-tauri/tests/knowledge_repository.rs`
- Modify: `packages/features/src/knowledge/knowledge-create-dialog.tsx`
- Modify: `packages/features/src/knowledge/knowledge-promotion-dialog.tsx`
- Modify: `packages/features/src/knowledge/knowledge-services.ts`
- Modify: `packages/features/test/knowledge.test.tsx`
- Modify: `packages/features/src/tasks/tasks-page.tsx`
- Modify: `packages/features/src/tasks/task-services.ts`
- Modify: `packages/features/test/tasks.test.tsx`
- Modify: `packages/ui/src/components/dialog.tsx`

### Journal

- Modify: `packages/editor/src/extensions/editor-blocks.ts`
- Modify: `packages/editor/test/editor-blocks.test.ts`
- Modify: `packages/editor/test/markdown-shortcuts.test.ts`
- Modify: `packages/editor/test/document-outline.test.ts`
- Modify: `packages/features/src/journal/journal-templates.ts`
- Modify: `packages/features/src/journal/journal-template-picker.tsx`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/editor-toolbar.tsx`
- Modify: `packages/features/test/journal-template-picker.test.tsx`
- Modify: `packages/features/test/journal-editor-blocks.test.tsx`

### Timeline and heatmap

- Create: `packages/features/src/timeline/year-month-picker.tsx`
- Modify: `packages/features/src/timeline/month-calendar.tsx`
- Modify: `packages/features/src/timeline/timeline-page.tsx`
- Modify: `packages/features/src/timeline/annual-heatmap.tsx`
- Modify: `packages/features/src/timeline/activity-heatmap.tsx`
- Modify: `packages/features/src/dashboard/activity-heatmap.tsx`
- Modify: `packages/ui/src/styles/globals.css`
- Create: `packages/features/test/year-month-picker.test.tsx`
- Modify: `packages/features/test/timeline.test.tsx`
- Modify: `packages/features/test/annual-heatmap.test.tsx`

### Help Center B

- Modify: `packages/features/src/help/help-content.ts`
- Modify: `packages/features/src/help/help-center.tsx`
- Modify: `packages/features/src/help/content/zh-CN/manual.md`
- Modify: `packages/features/src/help/content/en-US/manual.md`
- Modify: `packages/features/src/preferences/app-messages.ts`
- Modify: `packages/features/test/help-center.test.tsx`
- Create: `packages/features/src/help/assets/journal-template-flow.png`
- Create: `packages/features/src/help/assets/tasks-complete-reopen.png`
- Create: `packages/features/src/help/assets/timeline-year-picker.png`
- Create: `packages/features/src/help/assets/knowledge-create.png`
- Create: `packages/features/src/help/assets/settings-appearance.png`

### Cross-cutting polish and verification

- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/web/e2e/usability-workflows.spec.ts`
- Modify: `apps/desktop/e2e/smoke.spec.ts`

---

### Task 1: Make locale changes reactive across the application

**Files:**
- Create: `packages/features/test/global-locale.test.tsx`
- Modify: `packages/features/src/preferences/app-messages-context.tsx`
- Modify: `packages/features/src/preferences/app-messages.ts`
- Modify: `packages/features/src/preferences/messages.ts`
- Modify: `packages/features/test/settings.test.tsx`
- Modify: `packages/features/src/settings/settings-page.tsx`

- [ ] **Step 1: Write a failing route-level locale test**

Create `packages/features/test/global-locale.test.tsx` with a provider that initially loads Chinese preferences, then saves English preferences. Assert navigation, dashboard title, journal title, timeline title, task title, knowledge title, search title, analytics title, settings title, and help title all change.

```tsx
// @vitest-environment jsdom

import "./setup-dom.js";

import { DEFAULT_USER_PREFERENCES } from "@dailyflow/application";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { createRuntimeSettingsStub } from "./runtime-settings-stub.js";

describe("global locale", () => {
  it("updates navigation and the current route when saved preferences change", async () => {
    const user = userEvent.setup();
    let preferences = DEFAULT_USER_PREFERENCES;
    const listeners = new Set<() => void>();
    const settings = {
      ...createRuntimeSettingsStub().settings,
      load: async () => ({ preferences, warning: null }),
      save: async (value: unknown) => {
        preferences = { ...(value as typeof DEFAULT_USER_PREFERENCES) };
        listeners.forEach((listener) => listener());
        return { preferences, persisted: true, warning: null };
      },
    };

    renderGlobalLocaleHarness({ settings });
    expect(await screen.findByRole("link", { name: "工作台" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "设置" }));
    await user.click(screen.getByRole("radio", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "保存设置" }));

    expect(await screen.findByRole("link", { name: "Workbench" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Daily Journal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Help" })).toBeInTheDocument();
  });
});
```

Add the test harness in the same file using `AppServicesProvider`, `AppMessagesProvider`, `UserPreferencesProvider`, `MemoryRouter`, and `useRoutes(createAppRoutes(...))`. Use the existing `createRuntimeSettingsStub()` and a minimal `AppRuntimeServices` stub to keep the test focused on headers and navigation.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/global-locale.test.tsx --maxWorkers=1
```

Expected: FAIL because either the harness needs a local save notification or one or more route labels still come from static Chinese strings.

- [ ] **Step 3: Make preferences save publish immediately through the existing root context**

Keep a single root `UserPreferencesProvider`. Ensure `save()` always replaces context state with `result.preferences`, including non-persisted results, and expose no page-local locale state.

```ts
const save = useCallback(
  async (input: unknown): Promise<UserPreferencesSaveResult> => {
    const result = await settings.save(input);
    if (result.persisted) {
      await settings.applyRuntimePreferences?.(result.preferences);
    }
    setPreferences(result.preferences);
    setWarning(result.warning);
    return result;
  },
  [settings],
);
```

Remove `setLocalePreview` usage from `SettingsPage`; the persisted preference is now the preview. Keep `setLocalePreview` only if another isolated preview surface still needs it. `AppMessagesProvider` must derive `locale` directly from `preferences.locale`.

- [ ] **Step 4: Replace affected route strings with the root message catalog**

Add missing keys to `AppMessages` for journal, tasks, timeline, knowledge, search, analytics, and settings section headings. Keep the typed catalog split by domain in `app-messages.ts`. Migrate the visible titles, primary actions, empty states, and date-format labels in the affected pages.

Use `Intl.DateTimeFormat(locale, options)` through a helper exported from the messages runtime:

```ts
export function formatLocaleDate(
  locale: LocalePreference,
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, options).format(date);
}
```

- [ ] **Step 5: Replace the language selector with visible radio cards**

In `SettingsPage`, render two buttons with `role="radio"` and `aria-checked`, not a native `Select`.

```tsx
<div role="radiogroup" aria-label={messages.general.language} className="df-language-choices">
  {[
    ["zh-CN", "简体中文", "中文界面"],
    ["en-US", "English", "English interface"],
  ].map(([value, label]) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={effectiveDraft.locale === value}
      className="df-choice-card"
      onClick={() => updateDraft({ locale: value as UserPreferences["locale"] })}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/global-locale.test.tsx test/settings.test.tsx test/app-shell.test.tsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/features/src packages/features/test
git commit -m "feat: make DailyFlow locale globally reactive"
```

### Task 2: Fix settings layout and implement three-state close behavior

**Files:**
- Modify: `packages/application/src/use-cases/settings.ts`
- Modify: `packages/features/src/settings/settings-page.tsx`
- Modify: `packages/features/src/preferences/messages.ts`
- Modify: `apps/desktop/src/desktop-close-guard.ts`
- Modify: `apps/desktop/src/install-desktop-close-guard.ts`
- Create: `apps/desktop/src/close-confirmation.tsx`
- Modify: `apps/desktop/src-tauri/src/lifecycle/mod.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/test/desktop-close-guard.test.ts`
- Create: `apps/desktop/test/close-confirmation.test.tsx`

- [ ] **Step 1: Write failing preference migration tests**

Add tests in `packages/application/test/settings.test.ts` proving:

```ts
expect(UserPreferencesSchema.parse({ schemaVersion: 1, closeToTray: false }).closeBehavior).toBe(
  "ask",
);
expect(UserPreferencesSchema.parse({ schemaVersion: 2, closeBehavior: "minimize" }).closeBehavior).toBe(
  "minimize",
);
expect(DEFAULT_USER_PREFERENCES.closeBehavior).toBe("ask");
```

- [ ] **Step 2: Run migration tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/application exec vitest run test/settings.test.ts
```

Expected: FAIL because `closeBehavior` does not exist.

- [ ] **Step 3: Replace `closeToTray` with `CloseBehavior`**

In `packages/application/src/use-cases/settings.ts`:

```ts
export const CloseBehaviorSchema = z.enum(["ask", "minimize", "quit"]);
export type CloseBehavior = z.infer<typeof CloseBehaviorSchema>;

closeBehavior: CloseBehaviorSchema.default("ask"),
```

Keep `closeToTray` in a legacy-only preprocess object solely for reading old stored JSON, then remove it from the parsed result. Never write `closeToTray` again.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing desktop close-guard tests**

Modify `apps/desktop/test/desktop-close-guard.test.ts` so the lifecycle exposes `getCloseBehavior()` and `requestCloseConfirmation()`.

```ts
it("asks the renderer to confirm close behavior", async () => {
  const requestCloseConfirmation = vi.fn(async () => undefined);
  const lifecycle = {
    flushAll: vi.fn(async () => true),
    getCloseBehavior: () => "ask" as const,
    requestCloseConfirmation,
    hideToTray: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
  };
  const harness = createWindow();
  await installCloseGuard(harness.window, lifecycle);

  await harness.getHandler()({ preventDefault: vi.fn() });

  expect(requestCloseConfirmation).toHaveBeenCalledOnce();
  expect(harness.close).not.toHaveBeenCalled();
});
```

Add cases for `minimize` hiding and `quit` flushing then invoking `quit()`.

- [ ] **Step 6: Run close-guard tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/desktop exec vitest run test/desktop-close-guard.test.ts
```

Expected: FAIL because the old lifecycle uses `isCloseToTrayEnabled`.

- [ ] **Step 7: Implement the three-state lifecycle**

Use one Rust `AtomicU8` and explicit enum values. On `CloseRequested`:

```rust
match close_behavior {
    CloseBehavior::Ask if !explicit_quit => {
        api.prevent_close();
        let _ = window.emit("dailyflow:close-requested", ());
    }
    CloseBehavior::Minimize if !explicit_quit => {
        api.prevent_close();
        let _ = window.hide();
    }
    CloseBehavior::Quit => {}
}
```

Expose:

```rust
#[tauri::command]
pub fn lifecycle_set_close_behavior(behavior: String) -> Result<(), String>
```

Reject unknown values with `Err("unsupported close behavior".to_owned())`.

- [ ] **Step 8: Create the close confirmation dialog**

Create `apps/desktop/src/close-confirmation.tsx` with three actions: `最小化`, `直接退出`, and `取消`. The initial focus is `最小化`. A checkbox `记住我的选择` updates `closeBehavior` through the existing settings service.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent role="alertdialog" aria-labelledby="close-title" showCloseButton={false}>
    <DialogTitle id="close-title">{text("关闭 DailyFlow", "Close DailyFlow")}</DialogTitle>
    <DialogDescription>
      {text("选择最小化到托盘、直接退出，或取消本次操作。", "Minimize to tray, quit now, or cancel.")}
    </DialogDescription>
    <Button autoFocus onClick={onMinimize}>{text("最小化", "Minimize")}</Button>
    <Button variant="outline" onClick={onQuit}>{text("直接退出", "Quit")}</Button>
  </DialogContent>
</Dialog>
```

At most one dialog may be open. Duplicate `dailyflow:close-requested` events while open are ignored.

- [ ] **Step 9: Redesign the general and appearance settings controls**

Remove the nested vertical divider around startup options. Replace theme, accent, and density segmented controls with direct-choice cards:

- `df-theme-choice` contains a miniature sidebar/content preview and a radio state.
- `df-accent-choice` contains a color swatch plus a visible `Check` icon when selected.
- `df-density-choice` contains three directly listed buttons plus a miniature row-height preview.

No `Select` may be used for locale, theme, accent, or density.

- [ ] **Step 10: Run focused tests and verify GREEN**

Run:

```powershell
pnpm --filter @dailyflow/application exec vitest run test/settings.test.ts
pnpm --filter @dailyflow/desktop exec vitest run test/desktop-close-guard.test.ts test/close-confirmation.test.tsx
pnpm --filter @dailyflow/features exec vitest run test/settings.test.tsx --maxWorkers=1
pnpm --filter @dailyflow/desktop typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml lifecycle
```

Expected: PASS.

- [ ] **Step 11: Commit**

```powershell
git add apps/desktop packages/application packages/features
git commit -m "feat: add explicit close behavior and direct settings choices"
```

### Task 3: Fix knowledge persistence, task creation, and form errors

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/knowledge_repository.rs`
- Modify: `apps/desktop/src-tauri/tests/knowledge_repository.rs`
- Modify: `packages/features/src/knowledge/knowledge-create-dialog.tsx`
- Modify: `packages/features/src/knowledge/knowledge-promotion-dialog.tsx`
- Modify: `packages/features/src/knowledge/knowledge-services.ts`
- Modify: `packages/features/src/tasks/tasks-page.tsx`
- Modify: `packages/features/src/tasks/task-services.ts`
- Modify: `packages/features/test/knowledge.test.tsx`
- Modify: `packages/features/test/tasks.test.tsx`
- Modify: `packages/ui/src/components/dialog.tsx`

- [ ] **Step 1: Write a failing SQLite roundtrip test**

Add a test to `apps/desktop/src-tauri/tests/knowledge_repository.rs` using a real temporary SQLite database. Save an item with distinct values:

```rust
summary: "摘要只用于摘要".to_owned(),
content_plain_text: "正文纯文本".to_owned(),
content_markdown: "## 正文 Markdown".to_owned(),
```

Read it back and assert all three columns remain distinct.

- [ ] **Step 2: Run the Rust integration test and verify RED**

Run:

```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test knowledge_repository
```

Expected: FAIL because `save()` currently writes summary into `content_plain_text` and leaves Markdown empty.

- [ ] **Step 3: Correct the repository write and update paths**

Bind the exact fields in `knowledge_repository.rs`:

```rust
command.item.content_summary,
command.item.content_plain_text,
command.item.content_markdown,
```

Do not derive `content_plain_text` from summary or Markdown at the repository boundary.

- [ ] **Step 4: Run the Rust integration test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing knowledge UI error tests**

Add a test that makes `promote` reject with a structured `AppError`:

```tsx
const promote = vi.fn(async () => {
  throw new Error("knowledge_markdown column rejected the value");
});
```

Assert the dialog remains open, input remains intact, and the alert contains the real cause rather than only `保存到知识库失败，请重试`.

- [ ] **Step 6: Write failing task behavior tests**

Add tests asserting:

- An empty title shows `请输入待办标题` beside the title field.
- An invalid date shows `请选择有效日期` beside the date field.
- A backend `VALIDATION_ERROR` maps to the matching field.
- Every open task row has a visible `完成` button.
- Every completed task row has a visible `重新打开` button.

- [ ] **Step 7: Run feature tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/knowledge.test.tsx test/tasks.test.tsx --maxWorkers=1
```

Expected: FAIL for generic errors and hidden completion actions.

- [ ] **Step 8: Add a large no-scroll dialog variant**

Extend `DialogContent` with `size="immersive"` and `scroll="body"`:

```tsx
size?: "sm" | "md" | "lg" | "immersive";
scroll?: "body" | "none";
```

For immersive:

```tsx
"h-[86vh] max-h-[860px] w-[92vw] max-w-[1180px] overflow-hidden"
```

The dialog body grid owns the remaining height; only the editor column receives `overflow-y-auto`.

- [ ] **Step 9: Implement structured form errors and task actions**

Create a small reusable mapper in the affected feature modules:

```ts
interface FieldErrors {
  readonly title?: string;
  readonly dueDate?: string;
  readonly form?: string;
}

function resolveTaskErrors(error: unknown): FieldErrors {
  if (error instanceof AppError) {
    if (error.code === "VALIDATION_ERROR") {
      return {
        ...(error.details?.path?.includes("title") ? { title: error.message } : {}),
        ...(error.details?.path?.includes("dueDate") ? { dueDate: error.message } : {}),
      };
    }
    return { form: error.message };
  }
  return { form: error instanceof Error ? error.message : "创建待办失败" };
}
```

Place errors under their controls with `role="alert"` and `aria-describedby`.

- [ ] **Step 10: Run focused tests and verify GREEN**

Run:

```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test knowledge_repository
pnpm --filter @dailyflow/features exec vitest run test/knowledge.test.tsx test/tasks.test.tsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 11: Commit**

```powershell
git add apps/desktop/src-tauri packages/features packages/ui
git commit -m "fix: preserve knowledge content and surface task errors"
```

### Task 4: Rebuild the journal product layer

**Files:**
- Modify: `packages/editor/src/extensions/editor-blocks.ts`
- Modify: `packages/editor/test/editor-blocks.test.ts`
- Modify: `packages/editor/test/markdown-shortcuts.test.ts`
- Modify: `packages/editor/test/document-outline.test.ts`
- Modify: `packages/features/src/journal/journal-templates.ts`
- Modify: `packages/features/src/journal/journal-template-picker.tsx`
- Modify: `packages/features/src/journal/journal-editor.tsx`
- Modify: `packages/features/src/journal/editor-toolbar.tsx`
- Modify: `packages/features/test/journal-template-picker.test.tsx`
- Modify: `packages/features/test/journal-editor-blocks.test.tsx`

- [ ] **Step 1: Write failing six-dot and insertion-handle tests**

Add to `packages/features/test/journal-editor-blocks.test.tsx`:

```tsx
it("shows one current-block insertion control and no six-dot drag handle", async () => {
  renderEditorWithContent("<p>第一段</p><p>第二段</p>");

  expect(document.querySelector('[data-editor-drag-handle]')).toBeNull();
  expect(document.body.textContent).not.toContain("⠿");
  expect(await screen.findByRole("button", { name: "在当前块后插入" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run editor-block tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/journal-editor-blocks.test.tsx --maxWorkers=1
```

Expected: FAIL because the six-dot handle still exists and no `+` insertion control is rendered.

- [ ] **Step 3: Remove the six-dot handle and expose a plugin-owned insertion delegate**

Delete the `handle.textContent = "⠿"` behavior from `createDragHandle()`. Keep block geometry calculation if needed for the new control. Expose a callback through editor storage:

```ts
export interface EditorBlockControls {
  insertAfterCurrent: (kind: InsertKind) => void;
  insertFileAfterCurrent: (kind: "image" | "attachment") => Promise<void>;
}
```

The React product layer renders `+` using `data-editor-insert-trigger` and a single portal anchored beside the active block. Only one control is visible at a time.

- [ ] **Step 4: Run editor-block tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing template-first workflow tests**

Update `packages/features/test/journal-template-picker.test.tsx`:

```tsx
it("starts an empty journal with templates before showing the editor", async () => {
  const user = userEvent.setup();
  renderJournalEditor({ contentJson: null });

  expect(await screen.findByRole("heading", { name: "选择日志模板" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /空白日志/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /日报/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /周报/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /问题排查/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /复盘/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /问题排查/ }));
  expect(screen.getByRole("textbox", { name: "日志正文" })).toBeInTheDocument();
});
```

- [ ] **Step 6: Run template tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/journal-template-picker.test.tsx test/journal-templates.test.ts --maxWorkers=1
```

Expected: FAIL because an empty journal currently opens the editor immediately.

- [ ] **Step 7: Implement the template-first product layer**

Use a focused `JournalTemplatePicker` landing page. Group:

```ts
type TemplateGroup = "recent" | "built-in" | "custom" | "blank";
```

The picker must call `onSelectTemplate(template)`. `JournalEditor` stores a `startInTemplateMode` state when content is empty and no explicit date draft exists. On selection:

1. Convert the template Markdown to editor JSON.
2. Set editor content.
3. Record the template ID with a maximum of eight recent IDs.
4. Hide the picker and focus the first body paragraph.

On existing content, the toolbar `模板` action opens the picker as an overlay without clearing content until the user confirms replacement.

- [ ] **Step 8: Add and verify Markdown heading shortcut tests**

Extend `packages/editor/test/markdown-shortcuts.test.ts`:

```ts
it.each(["## 你好", "##　你好"])("converts %s into a level-two heading", (input) => {
  const editor = createEditorWithMarkdownShortcuts();
  editor.commands.insertContent(input);
  expect(editor.getJSON()).toMatchObject({
    content: [{ type: "heading", attrs: { level: 2 }, content: [{ text: "你好" }] }],
  });
});
```

Extend `document-outline.test.ts` to project that `heading` and expect `{ level: 2, text: "你好" }`.

Run RED:

```powershell
pnpm --filter @dailyflow/editor exec vitest run test/markdown-shortcuts.test.ts test/document-outline.test.ts
```

Expected: FAIL for full-width-space input until the shortcut regex accepts `\s`.

- [ ] **Step 9: Implement heading shortcuts and outline refresh**

Use a Unicode-aware input rule matching:

```ts
/^(#{1,6})[\s\u3000]+(.+)$/u
```

Preserve code-block, inline-code, table-cell, and existing-heading exclusions. Do not mutate the DOM after transaction completion; the editor transaction drives outline updates through the existing JSON subscription.

- [ ] **Step 10: Redesign the journal layout**

The page shell must use a fixed document header and an independently scrolling body:

```tsx
<div className="df-journal-page flex min-h-0 flex-1 flex-col overflow-hidden">
  <header className="df-journal-commandbar shrink-0">...</header>
  <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div className="df-journal-scroll overflow-y-auto">...</div>
    <aside className="df-journal-outline overflow-y-auto">...</aside>
  </div>
</div>
```

At widths below `1100px`, collapse low-frequency actions into a named `更多` menu and turn the outline into a drawer.

- [ ] **Step 11: Run focused journal tests and verify GREEN**

Run:

```powershell
pnpm --filter @dailyflow/editor exec vitest run test/markdown-shortcuts.test.ts test/document-outline.test.ts test/editor-blocks.test.ts
pnpm --filter @dailyflow/features exec vitest run test/journal-template-picker.test.tsx test/journal-editor-blocks.test.tsx test/journal-templates.test.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 12: Commit**

```powershell
git add packages/editor packages/features
git commit -m "feat: rebuild journal templates and insertion workflow"
```

### Task 5: Add fast year/month navigation and green activity scales

**Files:**
- Create: `packages/features/src/timeline/year-month-picker.tsx`
- Create: `packages/features/test/year-month-picker.test.tsx`
- Modify: `packages/features/src/timeline/month-calendar.tsx`
- Modify: `packages/features/src/timeline/timeline-page.tsx`
- Modify: `packages/features/src/timeline/annual-heatmap.tsx`
- Modify: `packages/features/src/timeline/activity-heatmap.tsx`
- Modify: `packages/features/src/dashboard/activity-heatmap.tsx`
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/features/test/timeline.test.tsx`
- Modify: `packages/features/test/annual-heatmap.test.tsx`

- [ ] **Step 1: Write a failing year/month picker test**

Create `packages/features/test/year-month-picker.test.tsx`:

```tsx
it("accepts any year from 1 through 9999 and jumps to a month", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<YearMonthPicker year={2026} month="2026-11" onSelect={onSelect} />);

  await user.click(screen.getByRole("button", { name: "2026 年" }));
  const yearInput = screen.getByRole("spinbutton", { name: "年份" });
  await user.clear(yearInput);
  await user.type(yearInput, "1998");
  await user.click(screen.getByRole("button", { name: "前往 1998 年 3 月" }));

  expect(onSelect).toHaveBeenCalledWith("1998-03");
});

it.each(["", "0", "10000", "abcd"])("rejects invalid year %s", async (value) => {
  // Keep the current year and show the inline validation message.
});
```

- [ ] **Step 2: Run picker tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/year-month-picker.test.tsx --maxWorkers=1
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `YearMonthPicker`**

Implement an accessible popover with:

- Editable four-digit input accepting integers `1..9999`.
- Shortcut buttons for `今年`, `去年`, `前年`.
- A 12-button month grid.
- Arrow-key navigation between month buttons.
- Enter to accept, Escape to close and restore focus.

Use a string in the input so users can temporarily clear it. Parse with:

```ts
function parseYear(value: string): number | null {
  if (!/^\d{1,4}$/u.test(value)) return null;
  const year = Number(value);
  return year >= 1 && year <= 9999 ? year : null;
}
```

- [ ] **Step 4: Run picker tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Replace year `<select>` controls**

In `MonthCalendar` and `TimelinePage`, replace fixed-option selects with `YearMonthPicker`. Preserve the route contract `/timeline/YYYY-MM` and the heatmap year update.

- [ ] **Step 6: Write failing green-level tests**

Add CSS token tests that inspect the root style or exported token map:

```ts
expect(getHeatmapColor(0)).toMatch(/green|oklch|hsl/);
expect(levelForCount(1)).toBe(1);
expect(levelForCount(3)).toBe(2);
expect(levelForCount(6)).toBe(4);
expect(levelForCount(12)).toBe(5);
```

Use semantic classes rather than hardcoded node colors:

```css
--heatmap-0: color-mix(in srgb, var(--success) 10%, var(--surface));
--heatmap-1: color-mix(in srgb, var(--success) 24%, var(--surface));
--heatmap-2: color-mix(in srgb, var(--success) 42%, var(--surface));
--heatmap-3: color-mix(in srgb, var(--success) 62%, var(--surface));
--heatmap-4: color-mix(in srgb, var(--success) 82%, var(--surface));
--heatmap-5: color-mix(in srgb, var(--success) 100%, var(--surface));
```

- [ ] **Step 7: Run heatmap tests and verify RED then GREEN**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/timeline.test.tsx test/annual-heatmap.test.tsx test/dashboard.test.tsx --maxWorkers=1
```

Expected before implementation: FAIL for non-green tokens and fixed-year selectors. Expected after implementation: PASS.

- [ ] **Step 8: Commit**

```powershell
git add packages/features packages/ui
git commit -m "feat: add fast timeline navigation and green heatmaps"
```

### Task 6: Implement Help Center option B with real screenshots

**Files:**
- Modify: `packages/features/src/help/help-content.ts`
- Modify: `packages/features/src/help/help-center.tsx`
- Modify: `packages/features/src/preferences/app-messages.ts`
- Modify: `packages/features/src/help/content/zh-CN/manual.md`
- Modify: `packages/features/src/help/content/en-US/manual.md`
- Modify: `packages/features/test/help-center.test.tsx`
- Create: `packages/features/src/help/assets/journal-template-flow.png`
- Create: `packages/features/src/help/assets/tasks-complete-reopen.png`
- Create: `packages/features/src/help/assets/timeline-year-picker.png`
- Create: `packages/features/src/help/assets/knowledge-create.png`
- Create: `packages/features/src/help/assets/settings-appearance.png`

- [ ] **Step 1: Write failing Help Center landing tests**

Replace the current first Help Center test with:

```tsx
it("shows topic cards before opening the selected guide section", async () => {
  const user = userEvent.setup();
  renderHelp("zh-CN");

  expect(await screen.findByRole("heading", { name: "DailyFlow 帮助中心" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "搜索帮助" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /创建并编辑每日日志/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /创建、完成和重新打开待办/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /使用时间线/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /创建、完成和重新打开待办/ }));

  expect(screen.getByRole("heading", { name: "待办：创建、完成与重新打开" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /待办完成和重新打开按钮/ })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "本章目录" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Write failing full-guide search tests**

Add:

```tsx
it("searches chapter content and shows topic plus matched section", async () => {
  const user = userEvent.setup();
  renderHelp("zh-CN");

  await user.type(screen.getByRole("searchbox", { name: "搜索帮助" }), "重新打开");

  expect(screen.getByRole("button", { name: /待办 · 完成和恢复任务/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /数据与设置 · 备份/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run Help tests and verify RED**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/help-center.test.tsx --maxWorkers=1
```

Expected: FAIL because the current page shows the entire manual immediately and has no topic cards or screenshots.

- [ ] **Step 4: Model topic metadata and stable sections**

In `help-content.ts`, define:

```ts
export interface HelpTopic {
  readonly id: HelpPageId;
  readonly group: "start" | "journal" | "tasks" | "timeline" | "knowledge" | "settings";
  readonly title: string;
  readonly summary: string;
  readonly stepCount: number;
  readonly updatedAt: string;
  readonly image: {
    readonly src: string;
    readonly alt: string;
    readonly caption: string;
  };
}
```

Parse stable `##` chapter IDs from the consolidated manuals. Search both chapter title and body, returning `{ topicId, topicTitle, sectionId, sectionTitle, excerpt }`.

- [ ] **Step 5: Implement the B landing page**

The landing page contains:

- Compact header with title, description, search, locale chip, and `查看完整手册`.
- Grouped topic cards with Lucide icon, title, summary, step count, and updated date.
- Search results rendered as rows with topic and section names.
- No entire-manual article on the landing page.

Use restrained work-tool styling: paper-neutral cards, green accent, thin borders, no nested cards.

- [ ] **Step 6: Implement chapter reading and manual mode**

On topic click, navigate to `/help/:topicId`. Render:

- Left chapter TOC on desktop.
- Lesson body in the center with numbered steps.
- Screenshot panel on the right with caption and highlighted callouts.
- Top breadcrumb back to Help home and `查看完整手册`.

On narrow screens, move the TOC into a disclosure and place screenshots directly after the related step.

- [ ] **Step 7: Capture real screenshots from the app**

Run the web app with deterministic fixture data, navigate through Playwright, and capture:

1. Empty journal template selector.
2. Task row with complete/reopen and edit actions.
3. Timeline year/month picker open.
4. Large knowledge create dialog.
5. Appearance settings cards.

Save as PNG under `packages/features/src/help/assets/` with the exact filenames from the file map. Add local callout boxes by capturing after the UI is in the desired state; do not use remote URLs or decorative mockups.

- [ ] **Step 8: Rewrite the manual content**

Each topic must include:

1. Goal.
2. Step-by-step actions.
3. Expected result.
4. Recovery path.
5. Screenshot Markdown:

```md
![待办完成和重新打开按钮](./assets/tasks-complete-reopen.png "在待办行尾使用完成或重新打开")
```

Keep stable `##` IDs and add `###` IDs for searchable subsections.

- [ ] **Step 9: Validate screenshot references at module load**

Use Vite raw/url imports or a typed static asset map. Add a test that every `HelpTopic.image.src` resolves to an imported asset and every manual image path exists in the map.

```ts
it("provides local screenshot assets and localized alt text for every topic", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    for (const topic of helpTopics[locale]) {
      expect(topic.image.alt.trim().length).toBeGreaterThan(0);
      expect(helpImageAssets[topic.image.src]).toBeDefined();
    }
  }
});
```

- [ ] **Step 10: Run focused Help tests and verify GREEN**

Run:

```powershell
pnpm --filter @dailyflow/features exec vitest run test/help-center.test.tsx --maxWorkers=1
pnpm --filter @dailyflow/features typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```powershell
git add packages/features/src/help packages/features/src/preferences packages/features/test/help-center.test.tsx
git commit -m "feat: implement topic-based offline help center"
```

### Task 7: Add motion, responsive rules, and accessibility coverage

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Modify: `packages/features/src/routes.ts`
- Modify: `apps/web/e2e/usability-workflows.spec.ts`
- Modify: `apps/desktop/e2e/smoke.spec.ts`
- Modify: `packages/features/test/settings.test.tsx`
- Modify: `packages/features/test/help-center.test.tsx`

- [ ] **Step 1: Write failing accessibility and reduced-motion checks**

Add Playwright assertions:

```ts
test("settings and help honor reduced motion and expose direct controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: "English" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "深色" })).toBeVisible();
  await expect(page.locator(".df-page-enter")).toHaveCSS("animation-duration", "0s");
});
```

Run:

```powershell
pnpm playwright test apps/web/e2e/usability-workflows.spec.ts --project=chromium
```

Expected: FAIL until the animation and controls exist.

- [ ] **Step 2: Add restrained motion tokens**

In `globals.css`:

```css
@keyframes df-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.df-page-enter {
  animation: df-enter 160ms ease-out both;
}

.df-status-pop {
  animation: df-status-pop 220ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .df-page-enter,
  .df-status-pop {
    animation: none;
  }
}
```

Apply page motion to the route outlet wrapper, status feedback to save/task transitions, and hover/focus transitions to choice cards.

- [ ] **Step 3: Add responsive overflow checks**

Add Playwright viewport checks for `1024x720`, `1440x900`, and `390x844`:

- No horizontal page scrollbar.
- Knowledge modal outer content has `overflow: hidden`.
- Editor-only scroll container exists.
- Journal header actions do not overlap the outline toggle.
- Help topic cards wrap without clipping.

- [ ] **Step 4: Add focus-management checks**

Verify:

- Template picker focuses the selected paragraph after selection.
- Year picker Escape returns focus to its trigger.
- Close confirmation focuses `最小化`.
- Knowledge dialog focuses the title field and returns focus to the trigger after close.

- [ ] **Step 5: Run focused E2E and verify GREEN**

Run:

```powershell
pnpm playwright test apps/web/e2e/usability-workflows.spec.ts apps/web/e2e/accessibility.spec.ts apps/web/e2e/mobile-layout.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/ui packages/features apps/web/e2e apps/desktop/e2e
git commit -m "style: polish DailyFlow motion and responsive states"
```

### Task 8: Complete regression, installer, and remote delivery

**Files:**
- Verify only; no source edits unless a failing check identifies a defect.
- Output: `apps/desktop/src-tauri/target/release/bundle/nsis/DailyFlow_0.1.0_x64-setup.exe`

- [ ] **Step 1: Run repository hygiene checks**

```powershell
git status --short --branch
git diff --check
```

Expected: branch name shown; no whitespace errors; only intentional files changed.

- [ ] **Step 2: Run static and unit verification**

```powershell
pnpm lint
pnpm format:check
pnpm depcruise
pnpm test
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 3: Run production builds and web E2E**

```powershell
pnpm build
pnpm e2e
```

Expected: desktop and web builds pass; all Playwright tests pass.

- [ ] **Step 4: Run Rust tests**

```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: all Rust unit and integration tests pass.

- [ ] **Step 5: Build the Windows installer**

```powershell
pnpm --filter @dailyflow/desktop tauri:build
```

Expected: NSIS and MSI candidates are generated under `apps/desktop/src-tauri/target/release/bundle/`.

- [ ] **Step 6: Smoke-test the installed candidate**

Install the NSIS package, launch DailyFlow, and verify:

1. Close defaults to asking and the primary action is minimize.
2. Language switches navigation, journal, timeline, tasks, knowledge, and help.
3. Empty journal opens template selection.
4. `## 你好` creates an H2 and updates the outline.
5. Knowledge creation and whole-journal promotion succeed.
6. Task creation succeeds; complete and reopen are visible.
7. Timeline year picker reaches 1998 and 2024 directly.
8. Heatmaps are green.
9. Help topic cards open chapters with local screenshots and searchable steps.

- [ ] **Step 7: Commit any verification fixes**

```powershell
git add -A
git commit -m "fix: resolve DailyFlow release verification findings"
```

If there are no changes after verification, do not create an empty commit.

- [ ] **Step 8: Push with the configured proxy**

```powershell
git -c http.version=HTTP/1.1 -c http.proxy=http://192.168.1.2:7890 push origin codex/dailyflow-interaction-refresh
```

Expected: branch successfully pushed and remote commit matches local `HEAD`.

- [ ] **Step 9: Record candidate artifact metadata**

```powershell
Get-Item apps/desktop/src-tauri/target/release/bundle/nsis/*.exe |
  Select-Object FullName, Length, LastWriteTime
Get-FileHash apps/desktop/src-tauri/target/release/bundle/nsis/*.exe -Algorithm SHA256
```

Expected: one current NSIS installer path and SHA-256 hash. Do not commit the installer itself.

