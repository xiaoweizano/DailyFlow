import { isJsonObject, type JsonValue } from "@dailyflow/domain";

import type { AttachmentAttrs, TiptapJsonMark, TiptapJsonNode } from "../schema/editor-types.js";
import { isSafeMarkdownHref } from "./json-to-markdown.js";

function textNode(text: string, marks: readonly TiptapJsonMark[] = []): TiptapJsonNode {
  return marks.length === 0 ? { type: "text", text } : { type: "text", text, marks: [...marks] };
}

function mergeTextNodes(nodes: TiptapJsonNode[]): TiptapJsonNode[] {
  const merged: TiptapJsonNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    const previousMarks = previous?.marks ?? [];
    const nodeMarks = node.marks ?? [];
    if (
      previous?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(previousMarks) === JSON.stringify(nodeMarks)
    ) {
      merged[merged.length - 1] = textNode(`${previous.text ?? ""}${node.text ?? ""}`, nodeMarks);
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function applyMark(nodes: TiptapJsonNode[], mark: TiptapJsonMark): TiptapJsonNode[] {
  return nodes.map((node) => {
    if (node.type !== "text") {
      return node;
    }
    return {
      ...node,
      marks: [...(node.marks ?? []), mark],
    };
  });
}

function parseInlineMath(
  input: string,
  start: number,
): { latex: string; nextIndex: number } | null {
  if (input[start] !== "$" || input[start + 1] === "$") {
    return null;
  }

  const end = findClosing(input, "$", start + 1);
  if (end <= start + 1) {
    return null;
  }

  const latex = input.slice(start + 1, end);
  if (latex.trim().length === 0 || latex.startsWith(" ") || latex.endsWith(" ")) {
    return null;
  }

  return { latex, nextIndex: end + 1 };
}

function findClosing(input: string, needle: string, from: number): number {
  let index = input.indexOf(needle, from);
  while (index >= 0) {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) {
      return index;
    }
    index = input.indexOf(needle, index + needle.length);
  }
  return -1;
}

function parseTitle(title: string | undefined): URLSearchParams {
  return new URLSearchParams(title ?? "");
}

function parseAttachment(href: string, title: string | undefined): TiptapJsonNode {
  const params = parseTitle(title);
  const attrs: AttachmentAttrs = {
    attachmentId: href.slice("dailyflow:attachment/".length),
    displayName: params.get("name") ?? "",
    mimeType: params.get("mime") ?? "application/octet-stream",
    byteSize: Number(params.get("size") ?? 0),
    isInline: params.get("inline") === "true",
  };
  const altText = params.get("alt");

  return {
    type: "attachment",
    attrs: altText === null ? attrs : { ...attrs, altText },
  };
}

function findDestinationEnd(input: string, start: number): number {
  let depth = 1;
  let inTitle = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && input[index - 1] !== "\\") {
      inTitle = !inTitle;
    } else if (!inTitle && char === "(") {
      depth += 1;
    } else if (!inTitle && char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function parseDestination(value: string): { href: string; title?: string } | null {
  const match = /^(?:<([^>]+)>|(\S+))(?:\s+"((?:\\.|[^"])*)")?$/u.exec(value.trim());
  if (match === null) {
    return null;
  }
  const href = match[1] ?? match[2];
  if (href === undefined) {
    return null;
  }
  const title = match[3]?.replaceAll('\\"', '"');
  return title === undefined ? { href } : { href, title };
}

function parseLinkOrImage(
  input: string,
  start: number,
  image: boolean,
): { nodes: TiptapJsonNode[]; nextIndex: number } | null {
  const labelStart = start + (image ? 2 : 1);
  const labelEnd = findClosing(input, "]", labelStart);
  if (labelEnd < 0 || input[labelEnd + 1] !== "(") {
    return null;
  }
  const destinationEnd = findDestinationEnd(input, labelEnd + 2);
  if (destinationEnd < 0) {
    return null;
  }

  const destination = parseDestination(input.slice(labelEnd + 2, destinationEnd));
  if (destination === null) {
    return null;
  }

  if (image && destination.href.startsWith("dailyflow:attachment/")) {
    return {
      nodes: [parseAttachment(destination.href, destination.title)],
      nextIndex: destinationEnd + 1,
    };
  }

  const label = input.slice(labelStart, labelEnd);
  const children = parseInline(label);
  if (destination.href.startsWith("dailyflow:attachment/")) {
    return {
      nodes: [parseAttachment(destination.href, destination.title)],
      nextIndex: destinationEnd + 1,
    };
  }

  const nodes: TiptapJsonNode[] = isSafeMarkdownHref(destination.href)
    ? applyMark(children, { type: "link", attrs: { href: destination.href } })
    : children;
  return { nodes, nextIndex: destinationEnd + 1 };
}

function parseInline(
  input: string,
  inheritedMarks: readonly TiptapJsonMark[] = [],
): TiptapJsonNode[] {
  const nodes: TiptapJsonNode[] = [];
  let buffer = "";

  const flush = (): void => {
    if (buffer.length > 0) {
      nodes.push(textNode(buffer, inheritedMarks));
      buffer = "";
    }
  };

  for (let index = 0; index < input.length;) {
    const char = input[index];
    if (char === "\\" && input[index + 1] === "\n") {
      flush();
      nodes.push({ type: "hardBreak" });
      index += 2;
      continue;
    }
    if (char === "\\" && input[index + 1] !== undefined) {
      buffer += input[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = findClosing(input, "`", index + 1);
      if (end > index) {
        flush();
        nodes.push(textNode(input.slice(index + 1, end), [...inheritedMarks, { type: "code" }]));
        index = end + 1;
        continue;
      }
    }
    if (char === "$") {
      const math = parseInlineMath(input, index);
      if (math !== null) {
        flush();
        nodes.push({ type: "inlineMath", attrs: { latex: math.latex } });
        index = math.nextIndex;
        continue;
      }
    }
    if (input.startsWith("**", index)) {
      const end = findClosing(input, "**", index + 2);
      if (end > index + 2) {
        flush();
        nodes.push(
          ...applyMark(parseInline(input.slice(index + 2, end), inheritedMarks), {
            type: "bold",
          }),
        );
        index = end + 2;
        continue;
      }
    }
    if (input.startsWith("~~", index)) {
      const end = findClosing(input, "~~", index + 2);
      if (end > index + 2) {
        flush();
        nodes.push(
          ...applyMark(parseInline(input.slice(index + 2, end), inheritedMarks), {
            type: "strike",
          }),
        );
        index = end + 2;
        continue;
      }
    }
    if (char === "*") {
      const end = findClosing(input, "*", index + 1);
      if (end > index + 1) {
        flush();
        nodes.push(
          ...applyMark(parseInline(input.slice(index + 1, end), inheritedMarks), {
            type: "italic",
          }),
        );
        index = end + 1;
        continue;
      }
    }
    if (input.startsWith("![", index)) {
      const parsed = parseLinkOrImage(input, index, true);
      if (parsed !== null) {
        flush();
        nodes.push(...parsed.nodes);
        index = parsed.nextIndex;
        continue;
      }
    }
    if (char === "[") {
      const parsed = parseLinkOrImage(input, index, false);
      if (parsed !== null) {
        flush();
        nodes.push(...parsed.nodes);
        index = parsed.nextIndex;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flush();
  return mergeTextNodes(nodes);
}

function paragraph(content: TiptapJsonNode[]): TiptapJsonNode {
  return content.length === 0 ? { type: "paragraph" } : { type: "paragraph", content };
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isFenceStart(line: string): boolean {
  return line.startsWith("```");
}

function isBlockStart(line: string): boolean {
  return (
    isBlank(line) ||
    isFenceStart(line) ||
    /^#{1,3}\s/u.test(line) ||
    /^>\s?/u.test(line) ||
    /^[-*] \[[ xX]\]\s/u.test(line) ||
    /^[-*]\s/u.test(line) ||
    /^\d+\.\s/u.test(line) ||
    line === "---" ||
    line.trim() === "$$" ||
    line.trimStart().startsWith("|")
  );
}

function splitTableRow(line: string): string[] {
  const value = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let buffer = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && value[index + 1] === "|") {
      buffer += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }

  cells.push(buffer);
  return cells;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return lines[index]?.includes("|") === true && isTableSeparator(lines[index + 1] ?? "");
}

function tableCell(type: "tableCell" | "tableHeader", value: string): TiptapJsonNode {
  const text = value.trim();
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [paragraph(text.length === 0 ? [] : parseInline(text))],
  };
}

function parseTable(
  lines: readonly string[],
  start: number,
): {
  readonly node: TiptapJsonNode;
  readonly nextIndex: number;
} {
  const header = splitTableRow(lines[start] ?? "");
  const rows: TiptapJsonNode[] = [
    {
      type: "tableRow",
      content: header.map((cell) => tableCell("tableHeader", cell)),
    },
  ];
  let index = start + 2;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0 || !line.includes("|")) {
      break;
    }
    const body = splitTableRow(line);
    rows.push({
      type: "tableRow",
      content: header.map((_, column) => tableCell("tableCell", body[column] ?? "")),
    });
    index += 1;
  }

  return { node: { type: "table", content: rows }, nextIndex: index };
}

function parseStructuredFence(payload: string): TiptapJsonNode {
  const parsed = JSON.parse(payload) as unknown;
  if (!isJsonObject(parsed)) {
    throw new TypeError("dailyflow-structured fence must contain a JSON object");
  }
  return { type: "structuredBlock", attrs: parsed };
}

function parseUnknownFence(payload: string): TiptapJsonNode {
  const parsed = JSON.parse(payload) as unknown;
  if (!isJsonObject(parsed) || !isJsonObject(parsed.node) || typeof parsed.node.type !== "string") {
    throw new TypeError("dailyflow-unknown fence must contain { node: TiptapJsonNode }");
  }
  return parsed.node as TiptapJsonNode;
}

function parseMarkdownBlocks(markdown: string): TiptapJsonNode[] {
  const lines = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const nodes: TiptapJsonNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (line.trim() === "$$") {
      let closing = index + 1;
      while (closing < lines.length && (lines[closing] ?? "").trim() !== "$$") {
        closing += 1;
      }
      if (closing < lines.length) {
        nodes.push({
          type: "blockMath",
          attrs: { latex: lines.slice(index + 1, closing).join("\n") },
        });
        index = closing + 1;
        continue;
      }
    }

    if (isFenceStart(line)) {
      const language = line.slice(3).trim();
      const content: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        content.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const payload = content.join("\n");
      if (language === "dailyflow-structured") {
        nodes.push(parseStructuredFence(payload));
      } else if (language === "dailyflow-unknown") {
        nodes.push(parseUnknownFence(payload));
      } else if (language === "mermaid") {
        nodes.push({ type: "mermaidBlock", attrs: { code: payload } });
      } else {
        nodes.push({
          type: "codeBlock",
          ...(language.length === 0 ? {} : { attrs: { language } }),
          ...(payload.length === 0 ? {} : { content: [{ type: "text", text: payload }] }),
        });
      }
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = parseTable(lines, index);
      nodes.push(table.node);
      index = table.nextIndex;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/u.exec(line);
    if (heading !== null) {
      nodes.push({
        type: "heading",
        attrs: { level: heading[1]?.length ?? 1 },
        content: parseInline(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    if (line === "---") {
      nodes.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? "")) {
        quoted.push((lines[index] ?? "").replace(/^>\s?/u, ""));
        index += 1;
      }
      nodes.push({ type: "blockquote", content: parseMarkdownBlocks(quoted.join("\n")) });
      continue;
    }

    if (/^[-*] \[[ xX]\]\s/u.test(line)) {
      const items: TiptapJsonNode[] = [];
      while (index < lines.length) {
        const item = /^[-*] \[([ xX])\]\s(.*)$/u.exec(lines[index] ?? "");
        if (item === null) {
          break;
        }
        items.push({
          type: "taskItem",
          attrs: { checked: (item[1] ?? " ").toLowerCase() === "x" },
          content: [paragraph(parseInline(item[2] ?? ""))],
        });
        index += 1;
      }
      nodes.push({ type: "taskList", content: items });
      continue;
    }

    if (/^[-*]\s/u.test(line)) {
      const items: TiptapJsonNode[] = [];
      while (index < lines.length) {
        const item = /^[-*]\s(.*)$/u.exec(lines[index] ?? "");
        if (item === null) {
          break;
        }
        items.push({
          type: "listItem",
          content: [paragraph(parseInline(item[1] ?? ""))],
        });
        index += 1;
      }
      nodes.push({ type: "bulletList", content: items });
      continue;
    }

    if (/^\d+\.\s/u.test(line)) {
      const items: TiptapJsonNode[] = [];
      let start = 1;
      while (index < lines.length) {
        const item = /^(\d+)\.\s(.*)$/u.exec(lines[index] ?? "");
        if (item === null) {
          break;
        }
        if (items.length === 0) {
          start = Number(item[1] ?? 1);
        }
        items.push({
          type: "listItem",
          content: [paragraph(parseInline(item[2] ?? ""))],
        });
        index += 1;
      }
      nodes.push({
        type: "orderedList",
        attrs: { start },
        content: items,
      });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index] ?? "")) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    nodes.push(paragraph(parseInline(paragraphLines.join("\n"))));
  }

  return nodes;
}

export function markdownToJson(markdown: string): TiptapJsonNode {
  return {
    type: "doc",
    content: parseMarkdownBlocks(markdown),
  };
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value) && Object.values(value).every(isJsonValue);
}
