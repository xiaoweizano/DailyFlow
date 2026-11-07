// @vitest-environment jsdom

import "./setup-dom.js";

import { describe, expect, it } from "vitest";

import {
  JOURNAL_TEMPLATE_STORAGE_KEY,
  createCustomJournalTemplate,
  loadJournalTemplateLibrary,
  markRecentJournalTemplate,
  saveJournalTemplateLibrary,
} from "../src/journal/journal-templates.js";

describe("journal templates", () => {
  it("keeps custom templates and recent template order in local storage only", () => {
    localStorage.clear();
    const custom = createCustomJournalTemplate({
      name: "客户拜访",
      description: "记录客户背景、结论和下一步",
      markdown: "## 客户背景\n\n## 沟通结论\n\n## 下一步",
    });

    saveJournalTemplateLibrary(
      {
        customTemplates: [custom],
        recentTemplateIds: ["daily"],
      },
      localStorage,
    );

    expect(localStorage.getItem(JOURNAL_TEMPLATE_STORAGE_KEY)).not.toBeNull();
    expect(loadJournalTemplateLibrary(localStorage)).toMatchObject({
      customTemplates: [{ id: custom.id, name: "客户拜访" }],
      recentTemplateIds: ["daily"],
    });
    expect(markRecentJournalTemplate(["daily", "weekly"], custom.id)).toEqual([
      custom.id,
      "daily",
      "weekly",
    ]);
  });
});
