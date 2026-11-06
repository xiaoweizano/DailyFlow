import { isJsonObject, type JsonObject } from "@dailyflow/domain";
import { stableStringify } from "@dailyflow/shared";

import type { AttachmentAttrs, TiptapJsonMark, TiptapJsonNode } from "../schema/editor-types.js";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "dailyflow:"]);

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_[\]`])/gu, "\\$1");
}

function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  if (value.startsWith("#") || value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return SAFE_PROTOCOLS.has(parsed.protocol.toLowerCase()) ? value : null;
  } catch {
    return null;
  }
}

function renderAttachment(attrs: JsonObject): string {
  const attachment: AttachmentAttrs = {
    ...attrs,
    attachmentId:
      typeof attrs.attachmentId === "string" ? attrs.attachmentId : "missing-attachment-id",
    displayName: typeof attrs.displayName === "string" ? attrs.displayName : "",
    mimeType: typeof attrs.mimeType === "string" ? attrs.mimeType : "application/octet-stream",
    byteSize: typeof attrs.byteSize === "number" ? attrs.byteSize : 0,
    isInline: attrs.isInline === true,
    ...(typeof attrs.altText === "string" ? { altText: attrs.altText } : {}),
  };
  const params = new URLSearchParams({
    name: attachment.displayName,
    mime: attachment.mimeType,
    size: String(attachment.byteSize),
    inline: attachment.isInline ? "true" : "false",
  });
  if (attachment.altText !== undefined) {
    params.set("alt", attachment.altText);
  }

  const href = `dailyflow:attachment/${attachment.attachmentId}`;
  const title = params.toString().replaceAll('"', "%22");
  return attachment.isInline
    ? `![${escapeMarkdownText(attachment.altText ?? attachment.displayName)}](${href} "${title}")`
    : `[${escapeMarkdownText(attachment.displayName)}](${href} "${title}")`;
}

function renderText(text: string, marks: readonly TiptapJsonMark[]): string {
  let rendered = escapeMarkdownText(text);

  if (marks.some((mark) => mark.type === "code")) {
    rendered = `\`${text.replaceAll("`", "\\`")}\``;
  }

  const link = marks.find((mark) => mark.type === "link");
  if (link !== undefined) {
    const href = safeHref(link.attrs?.href);
    if (href !== null) {
      rendered = `[${rendered}](${href})`;
    }
  }

  if (marks.some((mark) => mark.type === "bold")) {
    rendered = `**${rendered}**`;
  }
  if (marks.some((mark) => mark.type === "italic")) {
    rendered = `*${rendered}*`;
  }
  if (marks.some((mark) => mark.type === "strike")) {
    rendered = `~~${rendered}~~`;
  }

  return rendered;
}

function renderInline(nodes: readonly TiptapJsonNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return renderText(node.text ?? "", node.marks ?? []);
      }
      if (node.type === "hardBreak") {
        return "\\\n";
      }
      if (node.type === "attachment") {
        return renderAttachment(node.attrs ?? {});
      }
      if (node.type === "inlineMath") {
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
        return `$${latex}$`;
      }
      if (node.content !== undefined) {
        return renderInline(node.content);
      }
      return "";
    })
    .join("");
}

function renderListItemContent(node: TiptapJsonNode): string {
  const firstBlock = node.content?.[0];
  if (firstBlock?.type === "paragraph") {
    return renderInline(firstBlock.content);
  }
  return firstBlock === undefined ? "" : renderBlock(firstBlock).trim();
}

function renderList(
  node: TiptapJsonNode,
  renderItem: (item: TiptapJsonNode, index: number) => string,
): string {
  return (node.content ?? []).map((item, index) => renderItem(item, index)).join("\n");
}

function fence(language: string, content: string): string {
  const normalizedContent = content.endsWith("\n") ? content.slice(0, -1) : content;
  return `\`\`\`${language}\n${normalizedContent}\n\`\`\``;
}

function renderTableCell(node: TiptapJsonNode): string {
  const content = (node.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return renderInline(child.content);
      }
      return renderBlock(child).trim();
    })
    .join("<br>");
  return content.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function renderTable(node: TiptapJsonNode): string {
  const rows = node.content ?? [];
  const firstRow = rows[0]?.content ?? [];
  if (firstRow.length === 0) {
    return "";
  }

  const renderRow = (row: TiptapJsonNode): string =>
    `| ${firstRow.map((_, index) => renderTableCell(row.content?.[index] ?? { type: "tableCell" })).join(" | ")} |`;

  const separator = `| ${firstRow.map(() => "---").join(" | ")} |`;
  return [
    renderRow(rows[0] ?? { type: "tableRow" }),
    separator,
    ...rows.slice(1).map(renderRow),
  ].join("\n");
}

function renderBlock(node: TiptapJsonNode): string {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.content);
    case "heading": {
      const level =
        typeof node.attrs?.level === "number" && node.attrs.level >= 1 && node.attrs.level <= 3
          ? node.attrs.level
          : 1;
      return `${"#".repeat(level)} ${renderInline(node.content)}`;
    }
    case "bulletList":
      return renderList(node, (item) => `- ${renderListItemContent(item)}`);
    case "orderedList": {
      const start =
        typeof node.attrs?.start === "number" && Number.isSafeInteger(node.attrs.start)
          ? node.attrs.start
          : 1;
      return renderList(node, (item, index) => `${start + index}. ${renderListItemContent(item)}`);
    }
    case "taskList":
      return renderList(
        node,
        (item) => `- [${item.attrs?.checked === true ? "x" : " "}] ${renderListItemContent(item)}`,
      );
    case "blockquote": {
      const content = (node.content ?? []).map(renderBlock).join("\n\n");
      return content
        .split("\n")
        .map((line) => (line.length === 0 ? ">" : `> ${line}`))
        .join("\n");
    }
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return fence(language, renderPlainTextContent(node.content));
    }
    case "blockMath": {
      const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
      return `$$\n${latex}\n$$`;
    }
    case "mermaidBlock": {
      const code = typeof node.attrs?.code === "string" ? node.attrs.code : "";
      return fence("mermaid", code);
    }
    case "table":
      return renderTable(node);
    case "horizontalRule":
      return "---";
    case "structuredBlock":
      return fence("dailyflow-structured", stableStringify(node.attrs ?? {}));
    case "attachment":
      return renderAttachment(node.attrs ?? {});
    default:
      return fence("dailyflow-unknown", stableStringify({ node }));
  }
}

function renderPlainTextContent(nodes: readonly TiptapJsonNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return node.text ?? "";
      }
      if (node.type === "hardBreak") {
        return "\n";
      }
      return renderPlainTextContent(node.content);
    })
    .join("");
}

export function jsonToMarkdown(doc: TiptapJsonNode): string {
  const blocks = (doc.content ?? []).map(renderBlock).filter((block) => block.length > 0);
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

export function isSafeMarkdownHref(value: unknown): boolean {
  return safeHref(value) !== null;
}

export function isJsonObjectValue(value: unknown): value is JsonObject {
  return isJsonObject(value);
}
