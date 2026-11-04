import type { Page } from "@playwright/test";

type JournalCheckpoint = "autosave" | "explicit" | "import";
type KnowledgeKind = "note" | "issue" | "solution" | "decision" | "reference";
type TaskPriority = "low" | "normal" | "high" | "urgent";

interface SeedJournalInput {
  readonly date: string;
  readonly title: string;
  readonly text: string;
  readonly checkpoint?: JournalCheckpoint;
  readonly tags?: readonly string[];
}

interface SeedKnowledgeInput {
  readonly journalDate: string;
  readonly title: string;
  readonly summary: string;
  readonly kind?: KnowledgeKind;
}

interface SeedTaskInput {
  readonly title: string;
  readonly descriptionText: string;
  readonly priority?: TaskPriority;
  readonly dueDate?: string | null;
}

interface SearchFixture {
  readonly date: string;
  readonly term: string;
  readonly journalTitle: string;
  readonly knowledgeTitle: string;
  readonly taskTitle: string;
}

function documentFromText(text: string) {
  const paragraphs = text.split(/\n{2,}/u);
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      ...(paragraph === ""
        ? {}
        : {
            content: [{ type: "text", text: paragraph }],
          }),
    })),
  };
}

export async function seedJournal(page: Page, input: SeedJournalInput): Promise<string> {
  return page.evaluate(
    async ({ date, title, checkpoint, tags, contentJson }) => {
      const runtime = window.__DAILYFLOW_E2E__;
      if (runtime === undefined) {
        throw new Error("DailyFlow E2E runtime bridge is unavailable.");
      }

      const lookup = await runtime.journal.get({
        journalDate: date,
        timezone: "Asia/Shanghai",
      });
      if (!lookup.ok) {
        throw new Error(`Unable to load journal ${date}: ${lookup.error.code}`);
      }

      const saved = await runtime.journal.save({
        journalId: lookup.value.journal.id,
        journalDate: date,
        timezone: "Asia/Shanghai",
        title,
        contentJson,
        editorSchemaVersion: lookup.value.journal.content.schemaVersion,
        projectionVersion: lookup.value.journal.projectionVersion,
        expectedRevision: lookup.value.isPersisted ? lookup.value.journal.revision : null,
        checkpoint: checkpoint ?? "import",
        tags,
      });
      if (!saved.ok) {
        throw new Error(`Unable to save journal ${date}: ${saved.error.code}`);
      }

      return saved.value.journalId;
    },
    {
      date: input.date,
      title: input.title,
      text: input.text,
      checkpoint: input.checkpoint ?? "import",
      tags: [...(input.tags ?? [])],
      contentJson: documentFromText(input.text),
    },
  );
}

export async function seedKnowledge(page: Page, input: SeedKnowledgeInput): Promise<string> {
  return page.evaluate(
    async ({ journalDate, title, summary, kind }) => {
      const runtime = window.__DAILYFLOW_E2E__;
      if (runtime === undefined) {
        throw new Error("DailyFlow E2E runtime bridge is unavailable.");
      }

      const lookup = await runtime.journal.get({
        journalDate,
        timezone: "Asia/Shanghai",
      });
      if (!lookup.ok) {
        throw new Error(`Unable to load source journal: ${lookup.error.code}`);
      }

      const promoted = await runtime.knowledge.promote({
        journalId: lookup.value.journal.id,
        kind,
        title,
        summary,
      });
      if (!promoted.ok) {
        throw new Error(`Unable to promote knowledge: ${promoted.error.code}`);
      }

      return promoted.value.id;
    },
    {
      journalDate: input.journalDate,
      title: input.title,
      summary: input.summary,
      kind: input.kind ?? "issue",
    },
  );
}

export async function seedTask(page: Page, input: SeedTaskInput): Promise<string> {
  return page.evaluate(
    async ({ title, descriptionText, priority, dueDate }) => {
      const runtime = window.__DAILYFLOW_E2E__;
      if (runtime === undefined) {
        throw new Error("DailyFlow E2E runtime bridge is unavailable.");
      }

      const created = await runtime.tasks.create({
        title,
        descriptionText,
        priority,
        dueDate,
      });
      if (!created.ok) {
        throw new Error(`Unable to create task: ${created.error.code}`);
      }

      return created.value.id;
    },
    {
      title: input.title,
      descriptionText: input.descriptionText,
      priority: input.priority ?? "normal",
      dueDate: input.dueDate ?? null,
    },
  );
}

export async function rebuildSearch(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const runtime = window.__DAILYFLOW_E2E__;
    if (runtime === undefined) {
      throw new Error("DailyFlow E2E runtime bridge is unavailable.");
    }
    await runtime.search.rebuild();
  });
}

export async function seedSearchFixture(page: Page, fixture: SearchFixture): Promise<void> {
  await seedJournal(page, {
    date: fixture.date,
    title: fixture.journalTitle,
    text: `${fixture.term} 的日志正文与排查过程`,
  });
  await seedKnowledge(page, {
    journalDate: fixture.date,
    title: fixture.knowledgeTitle,
    summary: `${fixture.term} 的解决方案与经验总结`,
  });
  await seedTask(page, {
    title: fixture.taskTitle,
    descriptionText: `${fixture.term} 的后续待办`,
    dueDate: fixture.date,
  });
  await rebuildSearch(page);
}

export async function readJournalTitle(page: Page, date: string): Promise<string | null> {
  return page.evaluate(async (journalDate) => {
    const runtime = window.__DAILYFLOW_E2E__;
    if (runtime === undefined) {
      throw new Error("DailyFlow E2E runtime bridge is unavailable.");
    }
    const lookup = await runtime.journal.get({
      journalDate,
      timezone: "Asia/Shanghai",
    });
    return lookup.ok && lookup.value.isPersisted ? lookup.value.journal.title : null;
  }, date);
}

export function todayInShanghai(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
