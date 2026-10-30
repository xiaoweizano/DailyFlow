CREATE TABLE app_metadata (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE journals (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 36),
  journal_date          TEXT NOT NULL CHECK (
                          journal_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                        ),
  timezone              TEXT NOT NULL,
  title                 TEXT NOT NULL DEFAULT '',
  content_json          TEXT NOT NULL CHECK (json_valid(content_json)),
  content_markdown      TEXT NOT NULL DEFAULT '',
  content_plain_text    TEXT NOT NULL DEFAULT '',
  editor_schema_version INTEGER NOT NULL CHECK (editor_schema_version > 0),
  projection_version    INTEGER NOT NULL CHECK (projection_version > 0),
  content_hash          TEXT NOT NULL CHECK (length(content_hash) = 64),
  excerpt               TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
) STRICT;

CREATE UNIQUE INDEX ux_journals_active_date
  ON journals(journal_date)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_journals_updated
  ON journals(updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_journals_status_date
  ON journals(status, journal_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_journals_hash
  ON journals(content_hash);

CREATE TABLE journal_versions (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 36),
  journal_id            TEXT NOT NULL,
  revision              INTEGER NOT NULL CHECK (revision > 0),
  title                 TEXT NOT NULL DEFAULT '',
  content_json          TEXT NOT NULL CHECK (json_valid(content_json)),
  content_markdown      TEXT NOT NULL DEFAULT '',
  content_plain_text    TEXT NOT NULL DEFAULT '',
  editor_schema_version INTEGER NOT NULL CHECK (editor_schema_version > 0),
  projection_version    INTEGER NOT NULL CHECK (projection_version > 0),
  content_hash          TEXT NOT NULL CHECK (length(content_hash) = 64),
  change_source         TEXT NOT NULL CHECK (
                          change_source IN ('autosave', 'explicit', 'restore', 'import', 'migration')
                        ),
  created_at            TEXT NOT NULL,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX ux_journal_versions_revision
  ON journal_versions(journal_id, revision);

CREATE INDEX ix_journal_versions_created
  ON journal_versions(journal_id, created_at DESC);

CREATE TABLE structured_blocks (
  id             TEXT PRIMARY KEY CHECK (length(id) = 36),
  journal_id     TEXT NOT NULL,
  block_type     TEXT NOT NULL CHECK (
                   block_type IN ('issue', 'solution', 'decision', 'note', 'todo')
                 ),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  data_json      TEXT NOT NULL CHECK (json_valid(data_json)),
  order_key      TEXT NOT NULL,
  rendered_text  TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX ix_structured_blocks_journal_order
  ON structured_blocks(journal_id, order_key)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_structured_blocks_type
  ON structured_blocks(block_type)
  WHERE deleted_at IS NULL;

CREATE TABLE knowledge_items (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind                  TEXT NOT NULL CHECK (
                          kind IN ('note', 'issue', 'solution', 'decision', 'reference')
                        ),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'archived')),
  title                 TEXT NOT NULL,
  content_json          TEXT NOT NULL CHECK (json_valid(content_json)),
  content_markdown      TEXT NOT NULL DEFAULT '',
  content_plain_text    TEXT NOT NULL DEFAULT '',
  editor_schema_version INTEGER NOT NULL CHECK (editor_schema_version > 0),
  projection_version    INTEGER NOT NULL CHECK (projection_version > 0),
  content_hash          TEXT NOT NULL CHECK (length(content_hash) = 64),
  summary               TEXT NOT NULL DEFAULT '',
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source_journal_id     TEXT,
  source_block_id       TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  FOREIGN KEY (source_journal_id) REFERENCES journals(id) ON DELETE SET NULL,
  FOREIGN KEY (source_block_id) REFERENCES structured_blocks(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX ix_knowledge_kind_updated
  ON knowledge_items(kind, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_knowledge_title
  ON knowledge_items(title COLLATE NOCASE)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_knowledge_source_journal
  ON knowledge_items(source_journal_id)
  WHERE source_journal_id IS NOT NULL;

CREATE TABLE tasks (
  id                TEXT PRIMARY KEY CHECK (length(id) = 36),
  title             TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description_json  TEXT CHECK (
                      description_json IS NULL OR json_valid(description_json)
                    ),
  description_text  TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority          TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date          TEXT CHECK (
                      due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                    ),
  completed_at      TEXT,
  journal_id        TEXT,
  knowledge_item_id TEXT,
  revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE SET NULL,
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX ix_tasks_open_due
  ON tasks(due_date, priority DESC)
  WHERE deleted_at IS NULL AND status IN ('open', 'in_progress');

CREATE INDEX ix_tasks_status_updated
  ON tasks(status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_tasks_journal
  ON tasks(journal_id)
  WHERE journal_id IS NOT NULL;

CREATE TABLE tags (
  id              TEXT PRIMARY KEY CHECK (length(id) = 36),
  name            TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  color           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX ux_tags_name_normalized
  ON tags(name_normalized);

CREATE TABLE journal_tags (
  journal_id TEXT NOT NULL,
  tag_id     TEXT NOT NULL,
  PRIMARY KEY (journal_id, tag_id),
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE knowledge_tags (
  knowledge_item_id TEXT NOT NULL,
  tag_id            TEXT NOT NULL,
  PRIMARY KEY (knowledge_item_id, tag_id),
  FOREIGN KEY (knowledge_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX ix_journal_tags_tag ON journal_tags(tag_id, journal_id);
CREATE INDEX ix_knowledge_tags_tag ON knowledge_tags(tag_id, knowledge_item_id);

CREATE TABLE knowledge_links (
  id               TEXT PRIMARY KEY CHECK (length(id) = 36),
  source_item_id   TEXT NOT NULL,
  target_item_id   TEXT NOT NULL,
  relation_type    TEXT NOT NULL CHECK (
                     relation_type IN ('related', 'solves', 'caused_by', 'references', 'supersedes')
                   ),
  created_at       TEXT NOT NULL,
  FOREIGN KEY (source_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE,
  FOREIGN KEY (target_item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX ux_knowledge_links_relation
  ON knowledge_links(source_item_id, target_item_id, relation_type);

CREATE INDEX ix_knowledge_links_target
  ON knowledge_links(target_item_id, relation_type);

CREATE TABLE attachment_blobs (
  id            TEXT PRIMARY KEY CHECK (length(id) = 36),
  sha256        TEXT NOT NULL CHECK (length(sha256) = 64),
  byte_size     INTEGER NOT NULL CHECK (byte_size >= 0),
  mime_type     TEXT NOT NULL,
  storage_kind  TEXT NOT NULL CHECK (storage_kind IN ('desktop-file', 'web-blob')),
  storage_key   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  orphaned_at   TEXT
) STRICT;

CREATE UNIQUE INDEX ux_attachment_blobs_hash
  ON attachment_blobs(sha256, byte_size);

CREATE TABLE attachment_links (
  id             TEXT PRIMARY KEY CHECK (length(id) = 36),
  blob_id        TEXT NOT NULL,
  owner_type     TEXT NOT NULL CHECK (
                   owner_type IN ('journal', 'knowledge_item', 'structured_block')
                 ),
  owner_id       TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  alt_text       TEXT NOT NULL DEFAULT '',
  is_inline      INTEGER NOT NULL DEFAULT 0 CHECK (is_inline IN (0, 1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  deleted_at     TEXT,
  FOREIGN KEY (blob_id) REFERENCES attachment_blobs(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX ix_attachment_links_owner
  ON attachment_links(owner_type, owner_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_attachment_links_blob
  ON attachment_links(blob_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_attachment_blobs_orphaned
  ON attachment_blobs(orphaned_at)
  WHERE orphaned_at IS NOT NULL;

CREATE TABLE import_sessions (
  id              TEXT PRIMARY KEY CHECK (length(id) = 36),
  root_label      TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (
                    status IN ('scanning', 'preview_ready', 'committing', 'completed', 'failed', 'rolled_back')
                  ),
  options_json    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(options_json)),
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  scanned_count   INTEGER NOT NULL DEFAULT 0 CHECK (scanned_count >= 0),
  ready_count     INTEGER NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  imported_count  INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count   INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  conflict_count  INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  invalid_count   INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  created_at      TEXT NOT NULL,
  completed_at    TEXT,
  error_summary   TEXT
) STRICT;

CREATE TABLE import_entries (
  id                       TEXT PRIMARY KEY CHECK (length(id) = 36),
  session_id               TEXT NOT NULL,
  relative_path            TEXT NOT NULL,
  original_file_name       TEXT NOT NULL,
  detected_date            TEXT CHECK (
                             detected_date IS NULL OR detected_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                           ),
  encoding                 TEXT NOT NULL DEFAULT 'unknown',
  newline_style            TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (newline_style IN ('lf', 'crlf', 'mixed', 'unknown')),
  file_sha256              TEXT CHECK (file_sha256 IS NULL OR length(file_sha256) = 64),
  raw_size                 INTEGER CHECK (raw_size IS NULL OR raw_size >= 0),
  raw_capture_status       TEXT NOT NULL CHECK (
                             raw_capture_status IN ('captured', 'cleaned', 'unavailable')
                           ),
  raw_bytes                BLOB,
  raw_cleaned_at           TEXT,
  status                   TEXT NOT NULL CHECK (
                             status IN ('ready', 'skipped', 'conflict', 'invalid', 'imported', 'failed')
                           ),
  conflict_kind            TEXT,
  error_code               TEXT,
  error_detail             TEXT,
  journal_id               TEXT,
  previous_journal_revision INTEGER,
  created_at               TEXT NOT NULL,
  committed_at             TEXT,
  FOREIGN KEY (session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE SET NULL,
  CHECK (
    (
      raw_capture_status = 'captured'
      AND raw_bytes IS NOT NULL
      AND raw_cleaned_at IS NULL
      AND file_sha256 IS NOT NULL
      AND raw_size IS NOT NULL
    )
    OR
    (
      raw_capture_status = 'cleaned'
      AND raw_bytes IS NULL
      AND raw_cleaned_at IS NOT NULL
      AND file_sha256 IS NOT NULL
      AND raw_size IS NOT NULL
    )
    OR
    (
      raw_capture_status = 'unavailable'
      AND raw_bytes IS NULL
      AND raw_cleaned_at IS NULL
      AND file_sha256 IS NULL
    )
  )
) STRICT;

CREATE UNIQUE INDEX ux_import_entries_session_path
  ON import_entries(session_id, relative_path);

CREATE INDEX ix_import_entries_session_status
  ON import_entries(session_id, status);

CREATE INDEX ix_import_entries_hash
  ON import_entries(file_sha256);

CREATE TABLE reports (
  id                    TEXT PRIMARY KEY CHECK (length(id) = 36),
  period_type           TEXT NOT NULL CHECK (period_type IN ('week', 'month', 'year')),
  period_start          TEXT NOT NULL,
  period_end            TEXT NOT NULL,
  timezone              TEXT NOT NULL,
  title                 TEXT NOT NULL,
  content_json          TEXT NOT NULL CHECK (json_valid(content_json)),
  content_markdown      TEXT NOT NULL DEFAULT '',
  content_plain_text    TEXT NOT NULL DEFAULT '',
  editor_schema_version INTEGER NOT NULL CHECK (editor_schema_version > 0),
  projection_version    INTEGER NOT NULL CHECK (projection_version > 0),
  stats_json            TEXT NOT NULL CHECK (json_valid(stats_json)),
  generated_by          TEXT NOT NULL DEFAULT 'local'
                          CHECK (generated_by IN ('local', 'ai_assisted')),
  source_watermark      TEXT,
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
) STRICT;

CREATE UNIQUE INDEX ux_reports_period
  ON reports(period_type, period_start, period_end, timezone)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_reports_updated
  ON reports(updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE search_documents (
  id              TEXT PRIMARY KEY CHECK (length(id) = 36),
  entity_type     TEXT NOT NULL CHECK (
                    entity_type IN ('journal', 'knowledge_item', 'task', 'structured_block')
                  ),
  entity_id       TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  body_text       TEXT NOT NULL DEFAULT '',
  structured_text TEXT NOT NULL DEFAULT '',
  tags_text       TEXT NOT NULL DEFAULT '',
  normalized_text TEXT NOT NULL DEFAULT '',
  tokenized_text  TEXT NOT NULL DEFAULT '',
  local_date      TEXT,
  updated_at      TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  index_version   INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX ux_search_documents_entity
  ON search_documents(entity_type, entity_id);

CREATE INDEX ix_search_documents_date
  ON search_documents(local_date DESC)
  WHERE local_date IS NOT NULL;
