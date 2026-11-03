import type { TxtDocumentConverter as TxtDocumentConverterPort } from "@dailyflow/application";
import { createContentDocument, type ContentDocument } from "@dailyflow/domain";
import {
  CURRENT_EDITOR_SCHEMA_VERSION,
  markdownToJson,
  normalizeDocument,
} from "@dailyflow/editor";

export class TxtDocumentConverter implements TxtDocumentConverterPort {
  toContent(text: string): ContentDocument {
    const document = normalizeDocument({
      schemaVersion: CURRENT_EDITOR_SCHEMA_VERSION,
      doc: markdownToJson(text),
    });
    return createContentDocument(document.schemaVersion, document.doc);
  }
}
