import Dexie, { type Table } from "dexie";

import {
  WEB_DATABASE_STORES_V1,
  WEB_DATABASE_VERSION,
  seedInitialMetadata,
} from "./migrations/0001-initial.js";
import type {
  AttachmentBlobRow,
  AttachmentLinkRow,
  GenericStoreRow,
  JournalRow,
  JournalTagRow,
  JournalVersionRow,
  KnowledgeTagRow,
  MetaRow,
  SearchDocumentRow,
  SearchTermPostingRow,
  StructuredBlockRow,
  TagRow,
} from "./schema.js";

export const WEB_DATABASE_NAME = "dailyflow-web";

export class DailyFlowDb extends Dexie {
  meta!: Table<MetaRow, string>;
  settings!: Table<GenericStoreRow, string>;
  journals!: Table<JournalRow, string>;
  journalVersions!: Table<JournalVersionRow, string>;
  structuredBlocks!: Table<StructuredBlockRow, string>;
  tasks!: Table<GenericStoreRow, string>;
  knowledgeItems!: Table<GenericStoreRow, string>;
  knowledgeLinks!: Table<GenericStoreRow, string>;
  tags!: Table<TagRow, string>;
  journalTags!: Table<JournalTagRow, [string, string]>;
  knowledgeTags!: Table<KnowledgeTagRow, [string, string]>;
  attachmentBlobs!: Table<AttachmentBlobRow, string>;
  attachmentLinks!: Table<AttachmentLinkRow, string>;
  importSessions!: Table<GenericStoreRow, string>;
  importEntries!: Table<GenericStoreRow, string>;
  reports!: Table<GenericStoreRow, string>;
  searchDocs!: Table<SearchDocumentRow, string>;
  searchTermPostings!: Table<SearchTermPostingRow, string>;

  constructor(name = WEB_DATABASE_NAME) {
    super(name);
    this.version(WEB_DATABASE_VERSION).stores(WEB_DATABASE_STORES_V1);
    this.on("populate", (transaction) => seedInitialMetadata(transaction));
  }
}
