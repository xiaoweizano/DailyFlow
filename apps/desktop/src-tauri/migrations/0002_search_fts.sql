CREATE VIRTUAL TABLE search_fts USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body_text,
  structured_text,
  tokenized_text,
  tags_text,
  tokenize = 'unicode61 remove_diacritics 2'
);
