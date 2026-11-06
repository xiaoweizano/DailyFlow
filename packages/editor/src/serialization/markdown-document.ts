import type { EditorDocument } from "../schema/editor-types.js";
import { CURRENT_EDITOR_SCHEMA_VERSION } from "../schema/schema-version.js";
import { jsonToMarkdown } from "./json-to-markdown.js";
import { markdownToJson } from "./markdown-to-json.js";
import { normalizeDocument } from "./normalize-document.js";

export function markdownToEditorDocument(markdown: string): EditorDocument {
  return normalizeDocument({
    schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
    doc: markdownToJson(markdown),
  });
}

export function editorDocumentToMarkdown(document: EditorDocument): string {
  return jsonToMarkdown(document.doc);
}
