import { ArrowLeft, Clock3, FilePlus2, FileText, PencilLine, Plus, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button, Input } from "@dailyflow/ui";

import { useOptionalAppMessages } from "../preferences/use-app-messages.js";
import { useAppText } from "../preferences/use-app-text.js";
import {
  BUILT_IN_JOURNAL_TEMPLATES,
  createCustomJournalTemplate,
  loadJournalTemplateLibrary,
  localizeJournalTemplate,
  markRecentJournalTemplate,
  saveJournalTemplateLibrary,
  type JournalTemplate,
  type JournalTemplateLibrary,
} from "./journal-templates.js";

export interface JournalTemplatePickerProps {
  readonly onSelect: (template: JournalTemplate | null) => void;
  readonly onClose?: () => void;
}

function TemplateIcon({ builtIn }: { readonly builtIn: boolean }): React.JSX.Element {
  const Icon = builtIn ? FileText : PencilLine;
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--activity-green-soft)] text-[var(--activity-green-strong)]">
      <Icon aria-hidden="true" className="size-4" />
    </span>
  );
}

function TemplateButton({
  template,
  onSelect,
}: {
  readonly template: JournalTemplate;
  readonly onSelect: (template: JournalTemplate) => void;
}): React.JSX.Element {
  const text = useAppText();
  return (
    <button
      type="button"
      className="group flex min-h-24 w-full items-start gap-3 rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-[var(--activity-green-strong)] hover:bg-[var(--activity-green-soft)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--activity-green-strong)]/25"
      onClick={() => onSelect(template)}
    >
      <TemplateIcon builtIn={template.builtIn} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{template.name}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {template.description || text("自定义日志模板", "Custom journal template")}
        </span>
      </span>
    </button>
  );
}

export function JournalTemplatePicker({
  onSelect,
  onClose,
}: JournalTemplatePickerProps): React.JSX.Element {
  const runtime = useOptionalAppMessages();
  const text = useAppText();
  const locale = runtime?.locale ?? "zh-CN";
  const [library, setLibrary] = useState<JournalTemplateLibrary>(() =>
    loadJournalTemplateLibrary(),
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const initialMarkdown = text("## 本次记录\n\n", "## Today's journal\n\n");
  const [editedMarkdown, setEditedMarkdown] = useState<string | null>(null);
  const markdown = editedMarkdown ?? initialMarkdown;

  const builtInTemplates = BUILT_IN_JOURNAL_TEMPLATES.map((template) =>
    localizeJournalTemplate(template, locale),
  );
  const customTemplates = library.customTemplates.map((template) =>
    localizeJournalTemplate(template, locale),
  );
  const allTemplates = [...builtInTemplates, ...customTemplates];
  const recentTemplates = library.recentTemplateIds
    .map((id) => allTemplates.find((template) => template.id === id))
    .filter((template): template is JournalTemplate => template !== undefined);

  function selectTemplate(template: JournalTemplate): void {
    const nextLibrary = {
      ...library,
      recentTemplateIds: markRecentJournalTemplate(library.recentTemplateIds, template.id),
    };
    saveJournalTemplateLibrary(nextLibrary);
    setLibrary(nextLibrary);
    onSelect(template);
  }

  function saveCustomTemplate(): void {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }
    const customTemplate = createCustomJournalTemplate({
      name: trimmedName,
      description,
      markdown,
    });
    const nextLibrary = {
      customTemplates: [...library.customTemplates, customTemplate],
      recentTemplateIds: markRecentJournalTemplate(library.recentTemplateIds, customTemplate.id),
    };
    saveJournalTemplateLibrary(nextLibrary);
    setLibrary(nextLibrary);
    setCreating(false);
    setName("");
    setDescription("");
    setEditedMarkdown(null);
    onSelect(customTemplate);
  }

  return (
    <section
      aria-label={text("选择日志模板", "Choose a journal template")}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-muted/25"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-6 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--activity-green-strong)]">
              DailyFlow Journal
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              {text("选择日志模板", "Choose a journal template")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text(
                "从最近使用、内置模板或自定义模板开始，也可以直接写空白日志。",
                "Start from a recent, built-in, or custom template, or write a blank journal.",
              )}
            </p>
          </div>
          {onClose === undefined ? null : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={text("返回正文", "Return to editor")}
              onClick={onClose}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {text("返回", "Back")}
            </Button>
          )}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <button
            type="button"
            className="flex min-h-16 items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface px-4 py-3 text-left transition-colors hover:border-[var(--activity-green-strong)] hover:bg-[var(--activity-green-soft)]"
            onClick={() => onSelect(null)}
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-surface-muted text-foreground">
              <FilePlus2 aria-hidden="true" className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">
                {text("空白日志", "Blank journal")}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {text("不套用模板，直接从正文开始", "Start writing without a template")}
              </span>
            </span>
          </button>
          <Button
            variant="secondary"
            className="min-h-16 sm:h-auto"
            onClick={() => setCreating((value) => !value)}
          >
            <Plus aria-hidden="true" className="size-4" />
            {text("自定义模板", "Custom template")}
          </Button>
        </div>

        {creating ? (
          <form
            aria-label={text("自定义日志模板", "Custom journal template")}
            className="mt-3 rounded-md border border-border bg-surface p-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveCustomTemplate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-foreground">
                {text("模板名称", "Template name")}
                <Input
                  aria-label={text("模板名称", "Template name")}
                  className="mt-1"
                  value={name}
                  maxLength={40}
                  placeholder={text("例如：客户拜访", "For example: Customer visit")}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
              </label>
              <label className="text-xs font-medium text-foreground">
                {text("模板说明", "Description")}
                <Input
                  aria-label={text("模板说明", "Template description")}
                  className="mt-1"
                  value={description}
                  maxLength={100}
                  placeholder={text("一句话说明适用范围", "A short note about when to use it")}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-foreground">
              {text("初始内容（支持 Markdown）", "Initial content (Markdown supported)")}
              <textarea
                aria-label={text("模板内容", "Template content")}
                className="mt-1 min-h-36 w-full resize-y rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 font-mono text-xs leading-6 text-foreground outline-none focus:border-[var(--activity-green-strong)] focus:ring-2 focus:ring-[var(--activity-green-strong)]/15"
                value={markdown}
                onChange={(event) => setEditedMarkdown(event.currentTarget.value)}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                {text("取消", "Cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={name.trim().length === 0}>
                {text("保存并使用", "Save and use")}
              </Button>
            </div>
          </form>
        ) : null}

        {recentTemplates.length === 0 ? null : (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {text("最近使用", "Recently used")}
              </h3>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {recentTemplates.slice(0, 4).map((template) => (
                <TemplateButton
                  key={`recent-${template.id}`}
                  template={template}
                  onSelect={selectTemplate}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-[var(--activity-green-strong)]" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {text("内置模板", "Built-in templates")}
            </h3>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {builtInTemplates.map((template) => (
              <TemplateButton key={template.id} template={template} onSelect={selectTemplate} />
            ))}
          </div>
        </div>

        {library.customTemplates.length === 0 ? null : (
          <div className="mt-6">
            <div className="flex items-center gap-2">
              <PencilLine aria-hidden="true" className="size-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {text("自定义模板", "Custom templates")}
              </h3>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {customTemplates.map((template) => (
                <TemplateButton key={template.id} template={template} onSelect={selectTemplate} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
