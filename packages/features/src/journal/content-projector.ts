import type {
  ContentProjector,
  ContentProjectorInput,
  ProjectedContent,
} from "@dailyflow/application";
import {
  extractStructuredBlocks,
  jsonToMarkdown,
  jsonToPlainText,
  type TiptapJsonNode,
} from "@dailyflow/editor";
import {
  createSearchBigrams,
  normalizeSearchText,
  sha256Hex,
  stableStringify,
} from "@dailyflow/shared";
import { parseContentHash } from "@dailyflow/domain";

const EXCERPT_MAX_LENGTH = 200;
const SEARCH_INDEX_VERSION = 1;

function compactText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function createExcerpt(plainText: string): string {
  const compact = compactText(plainText);
  return compact.length <= EXCERPT_MAX_LENGTH
    ? compact
    : `${compact.slice(0, EXCERPT_MAX_LENGTH - 3).trimEnd()}...`;
}

function createTokenizedText(value: string): string {
  const normalized = normalizeSearchText(value);
  return [normalized, ...createSearchBigrams(normalized)].filter(Boolean).join(" ");
}

function createFallbackTitle(plainText: string): string {
  const firstLine = plainText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine?.slice(0, 120) ?? "无标题日志";
}

function createSearchDocuments(
  input: ContentProjectorInput,
  projected: Pick<ProjectedContent, "contentHash" | "contentPlainText" | "structuredBlocks">,
) {
  const context = input.searchContext;
  if (context === undefined) {
    return [];
  }

  const title = context.title.trim() || createFallbackTitle(projected.contentPlainText);
  const tagsText = input.tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(" ");
  const structuredText = projected.structuredBlocks
    .map((block) => block.renderedText)
    .filter(Boolean)
    .join("\n");
  const normalizedText = normalizeSearchText(
    `${title}\n${projected.contentPlainText}\n${structuredText}\n${tagsText}`,
  );

  const journalDocument = {
    id: context.ownerEntityId,
    entityType: context.entityType,
    entityId: context.ownerEntityId,
    title,
    bodyText: projected.contentPlainText.trim(),
    structuredText,
    tagsText,
    normalizedText,
    tokenizedText: createTokenizedText(normalizedText),
    localDate: context.localDate,
    updatedAt: context.updatedAt,
    contentHash: projected.contentHash,
    indexVersion: SEARCH_INDEX_VERSION,
  } as const;

  const blockDocuments = projected.structuredBlocks.map((block) => {
    const blockText = block.renderedText.trim();
    const blockTitle = `${title} · ${block.blockType}`;
    const blockNormalizedText = normalizeSearchText(`${blockTitle}\n${blockText}\n${tagsText}`);
    return {
      id: block.id,
      entityType: "structured_block" as const,
      entityId: context.ownerEntityId,
      title: blockTitle,
      bodyText: blockText,
      structuredText: blockText,
      tagsText,
      normalizedText: blockNormalizedText,
      tokenizedText: createTokenizedText(blockNormalizedText),
      localDate: context.localDate,
      updatedAt: context.updatedAt,
      contentHash: projected.contentHash,
      indexVersion: SEARCH_INDEX_VERSION,
    };
  });

  return [journalDocument, ...blockDocuments];
}

export class EditorContentProjector implements ContentProjector {
  async project(input: ContentProjectorInput): Promise<ProjectedContent> {
    const document = input.content.doc as TiptapJsonNode;
    const contentMarkdown = jsonToMarkdown(document);
    const contentPlainText = jsonToPlainText(document);
    const structuredBlocks = extractStructuredBlocks(document);
    const contentHash = parseContentHash(
      await sha256Hex(
        stableStringify({
          schemaVersion: input.content.schemaVersion,
          doc: input.content.doc,
        }),
      ),
    );
    const excerpt = createExcerpt(contentPlainText);
    const searchDocuments = createSearchDocuments(input, {
      contentHash,
      contentPlainText,
      structuredBlocks,
    });

    return {
      contentMarkdown,
      contentPlainText,
      contentHash,
      excerpt,
      structuredBlocks,
      searchDocuments,
    };
  }
}
