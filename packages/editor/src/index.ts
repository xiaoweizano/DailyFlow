export { Attachment } from "./extensions/attachment.js";
export { MarkdownShortcuts } from "./extensions/markdown-shortcuts.js";
export { StructuredBlock } from "./extensions/structured-block.js";
export {
  extractStructuredBlocks,
  type EditorStructuredBlockProjection,
} from "./projection/extract-structured-blocks.js";
export { createEditorExtensions, createEditorSchema } from "./schema/create-editor-schema.js";
export {
  CURRENT_EDITOR_SCHEMA_VERSION,
  CURRENT_PROJECTION_VERSION,
  EDITOR_SCHEMA_VERSION,
  PROJECTION_VERSION,
} from "./schema/schema-version.js";
export type {
  AttachmentAttrs,
  EditorDocument,
  StructuredBlockAttrs,
  TiptapJsonMark,
  TiptapJsonNode,
} from "./schema/editor-types.js";
export { jsonToMarkdown, isSafeMarkdownHref } from "./serialization/json-to-markdown.js";
export { jsonToPlainText, structuredDataToPlainText } from "./serialization/json-to-plain-text.js";
export { markdownToJson } from "./serialization/markdown-to-json.js";
export { cloneJsonObject, normalizeDocument } from "./serialization/normalize-document.js";
