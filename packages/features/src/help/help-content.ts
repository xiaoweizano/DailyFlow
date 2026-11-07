import manualEn from "./content/en-US/manual.md?raw";
import manualZh from "./content/zh-CN/manual.md?raw";

export type HelpLocale = "zh-CN" | "en-US";
export type HelpPageId =
  | "quick-start"
  | "journal"
  | "timeline"
  | "tasks"
  | "knowledge"
  | "search-analytics"
  | "data"
  | "settings"
  | "troubleshooting";

export function resolveHelpPageId(value: string | undefined): HelpPageId {
  return helpSections["zh-CN"].some((section) => section.id === value)
    ? (value as HelpPageId)
    : "quick-start";
}

export interface HelpSection {
  readonly id: HelpPageId;
  readonly title: string;
  readonly content: string;
}

export const helpManuals: Record<HelpLocale, string> = {
  "zh-CN": manualZh,
  "en-US": manualEn,
};

function splitSections(markdown: string): readonly HelpSection[] {
  const sections: HelpSection[] = [];
  let current: { id: HelpPageId; title: string; lines: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^## (.+?) \{#([^}]+)\}$/u.exec(line);
    if (heading !== null) {
      if (current !== null) {
        sections.push({
          id: current.id,
          title: current.title,
          content: current.lines.join("\n").trim(),
        });
      }
      current = {
        id: heading[2] as HelpPageId,
        title: heading[1] ?? "",
        lines: [],
      };
      continue;
    }

    current?.lines.push(line);
  }

  if (current !== null) {
    sections.push({
      id: current.id,
      title: current.title,
      content: current.lines.join("\n").trim(),
    });
  }

  return sections;
}

export const helpSections: Record<HelpLocale, readonly HelpSection[]> = {
  "zh-CN": splitSections(manualZh),
  "en-US": splitSections(manualEn),
};
