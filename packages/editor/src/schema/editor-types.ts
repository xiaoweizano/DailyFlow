import type { JsonObject } from "@dailyflow/domain";

export type TiptapJsonMark = JsonObject & {
  readonly type: string;
  readonly attrs?: JsonObject;
};

export type TiptapJsonNode = JsonObject & {
  readonly type: string;
  readonly attrs?: JsonObject;
  readonly content?: TiptapJsonNode[];
  readonly marks?: TiptapJsonMark[];
  readonly text?: string;
};

export interface EditorDocument {
  readonly schemaVersion: number;
  readonly doc: TiptapJsonNode;
}

export type StructuredBlockAttrs = JsonObject & {
  readonly id: string;
  readonly blockType: "issue" | "solution" | "decision" | "note" | "todo";
  readonly schemaVersion: number;
  readonly data: JsonObject;
  readonly collapsed?: boolean;
};

export type AttachmentAttrs = JsonObject & {
  readonly attachmentId: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly isInline: boolean;
  readonly altText?: string;
};
