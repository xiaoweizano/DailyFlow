use std::{collections::BTreeMap, fs, path::PathBuf};

use dailyflow_desktop::db::{
    journal_repository,
    models::{
        Journal, JournalChangeSource, JournalSaveCheckpoint, JournalSaveState, JournalVersion,
        JournalVersionSummary, SaveJournalSnapshot, SavedJournalSnapshot, SearchEntityType,
        SearchHit, SearchQuery,
    },
    search_repository, Database, StorageError, StorageErrorCode,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tempfile::tempdir;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContractFixture {
    schema_version: i64,
    initial_snapshot: SaveJournalSnapshot,
    update_snapshot: SaveJournalSnapshot,
    expected: ExpectedResults,
    enums: FixtureEnums,
    dto_fields: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedResults {
    initial_save: SavedJournalSnapshot,
    update_save: SavedJournalSnapshot,
    save_state_after_update: JournalSaveState,
    versions: Vec<JournalVersionSummary>,
    block_search: BlockSearchExpectation,
    conflict: ConflictExpectation,
    soft_delete_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlockSearchExpectation {
    text: String,
    expected: Vec<ExpectedSearchHit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedSearchHit {
    entity_type: SearchEntityType,
    entity_id: String,
    local_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConflictExpectation {
    expected_revision: i64,
    actual_revision: i64,
    code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureEnums {
    checkpoint: Vec<String>,
    change_source: Vec<String>,
    search_entity_type: Vec<String>,
    storage_error_code: Vec<String>,
}

fn load_fixture() -> ContractFixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/infrastructure/test/fixtures/repository-parity.json");
    let source = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&source).expect("repository parity fixture must match Rust DTOs")
}

fn tuple_hits(hits: &[SearchHit]) -> Vec<(&SearchEntityType, &str, Option<&str>)> {
    hits.iter()
        .map(|hit| {
            (
                &hit.entity_type,
                hit.entity_id.as_str(),
                hit.local_date.as_deref(),
            )
        })
        .collect()
}

fn expected_tuple_hits(hits: &[ExpectedSearchHit]) -> Vec<(&SearchEntityType, &str, Option<&str>)> {
    hits.iter()
        .map(|hit| {
            (
                &hit.entity_type,
                hit.entity_id.as_str(),
                hit.local_date.as_deref(),
            )
        })
        .collect()
}

fn search_block(fixture: &ContractFixture) -> SearchQuery {
    SearchQuery {
        text: fixture.expected.block_search.text.clone(),
        entity_types: Some(vec![SearchEntityType::StructuredBlock]),
        from_date: None,
        to_date: None,
        cursor: None,
        limit: Some(20),
    }
}

fn serialized_keys<T: Serialize>(value: &T) -> Vec<String> {
    let mut keys = serde_json::to_value(value)
        .expect("DTO serialization")
        .as_object()
        .expect("DTO must serialize to an object")
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

fn assert_dto_fields<T: Serialize>(fixture: &ContractFixture, fixture_name: &str, value: &T) {
    let mut expected = fixture
        .dto_fields
        .get(fixture_name)
        .unwrap_or_else(|| panic!("missing dtoFields.{fixture_name}"))
        .clone();
    expected.sort();
    assert_eq!(
        serialized_keys(value),
        expected,
        "Rust DTO fields differ from fixture {fixture_name}"
    );
}

#[test]
fn shared_fixture_produces_equivalent_sqlite_semantics() {
    let fixture = load_fixture();
    assert_eq!(fixture.schema_version, 1);
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");

    database
        .with_connection(|connection| {
            let initial = journal_repository::save_snapshot(connection, &fixture.initial_snapshot)?;
            assert_eq!(initial, fixture.expected.initial_save);

            let block_hits = search_repository::query(connection, &search_block(&fixture))?;
            assert_eq!(
                tuple_hits(&block_hits.items),
                expected_tuple_hits(&fixture.expected.block_search.expected)
            );
            assert_eq!(block_hits.index_state, "ready");

            let update = journal_repository::save_snapshot(connection, &fixture.update_snapshot)?;
            assert_eq!(update, fixture.expected.update_save);

            let state = journal_repository::get_save_state(
                connection,
                &fixture.initial_snapshot.journal_id,
            )?
            .expect("save state");
            assert_eq!(
                serde_json::to_value(state)?,
                serde_json::to_value(&fixture.expected.save_state_after_update)?
            );

            let versions = journal_repository::list_versions(
                connection,
                &fixture.initial_snapshot.journal_id,
                Some(20),
                None,
            )?;
            assert_eq!(
                serde_json::to_value(versions.items)?,
                serde_json::to_value(&fixture.expected.versions)?
            );

            let conflict = journal_repository::save_snapshot(connection, &fixture.update_snapshot)
                .expect_err("stale revision must conflict");
            assert_eq!(conflict.code, StorageErrorCode::Conflict);
            assert_eq!(
                serde_json::to_value(conflict.code)?,
                Value::String(fixture.expected.conflict.code.clone())
            );
            assert!(conflict.message.contains(&format!(
                "expected {}",
                fixture.expected.conflict.expected_revision
            )));
            assert!(conflict.message.contains(&format!(
                "found {}",
                fixture.expected.conflict.actual_revision
            )));

            journal_repository::soft_delete(
                connection,
                &fixture.initial_snapshot.journal_id,
                fixture.expected.update_save.revision,
                &fixture.expected.soft_delete_at,
            )?;
            assert!(journal_repository::get_by_id(
                connection,
                &fixture.initial_snapshot.journal_id
            )?
            .is_none());
            assert!(
                search_repository::query(connection, &search_block(&fixture))?
                    .items
                    .is_empty()
            );
            Ok(())
        })
        .expect("shared fixture SQLite workflow");
}

#[test]
fn rust_dto_fields_and_enums_match_the_shared_fixture() {
    let fixture = load_fixture();
    let snapshot = &fixture.initial_snapshot;
    let version = JournalVersion {
        id: snapshot.journal_id.clone(),
        journal_id: snapshot.journal_id.clone(),
        revision: 1,
        title: snapshot.title.clone(),
        content_json: snapshot.content_json.clone(),
        content_markdown: snapshot.content_markdown.clone(),
        content_plain_text: snapshot.content_plain_text.clone(),
        editor_schema_version: snapshot.editor_schema_version,
        projection_version: snapshot.projection_version,
        content_hash: snapshot.content_hash.clone(),
        change_source: JournalChangeSource::Explicit,
        created_at: snapshot.saved_at.clone(),
    };
    let journal = Journal {
        id: snapshot.journal_id.clone(),
        journal_date: snapshot.journal_date.clone(),
        timezone: snapshot.timezone.clone(),
        title: snapshot.title.clone(),
        content_json: snapshot.content_json.clone(),
        content_markdown: snapshot.content_markdown.clone(),
        content_plain_text: snapshot.content_plain_text.clone(),
        editor_schema_version: snapshot.editor_schema_version,
        projection_version: snapshot.projection_version,
        content_hash: snapshot.content_hash.clone(),
        excerpt: snapshot.excerpt.clone(),
        status: "active".to_owned(),
        revision: 1,
        created_at: snapshot.saved_at.clone(),
        updated_at: snapshot.saved_at.clone(),
        deleted_at: None,
        tags: snapshot.tags.clone(),
        structured_blocks: snapshot.structured_blocks.clone(),
    };
    let storage_error = StorageError {
        code: StorageErrorCode::Conflict,
        message: "revision conflict".to_owned(),
    };

    assert_dto_fields(&fixture, "structuredBlock", &snapshot.structured_blocks[0]);
    assert_dto_fields(&fixture, "searchDocument", &snapshot.search_documents[0]);
    assert_dto_fields(&fixture, "saveJournalSnapshot", snapshot);
    assert_dto_fields(
        &fixture,
        "savedJournalSnapshot",
        &fixture.expected.initial_save,
    );
    assert_dto_fields(&fixture, "journal", &journal);
    assert_dto_fields(
        &fixture,
        "journalSaveState",
        &fixture.expected.save_state_after_update,
    );
    assert_dto_fields(&fixture, "journalVersion", &version);
    assert_dto_fields(
        &fixture,
        "journalVersionSummary",
        &fixture.expected.versions[0],
    );
    assert_dto_fields(&fixture, "storageError", &storage_error);

    assert_eq!(
        serde_json::to_value(vec![
            JournalSaveCheckpoint::Autosave,
            JournalSaveCheckpoint::Explicit,
            JournalSaveCheckpoint::Restore,
            JournalSaveCheckpoint::Import,
        ])
        .expect("checkpoint enum serialization"),
        serde_json::to_value(&fixture.enums.checkpoint).expect("checkpoint fixture serialization")
    );
    assert_eq!(
        serde_json::to_value(vec![
            JournalChangeSource::Autosave,
            JournalChangeSource::Explicit,
            JournalChangeSource::Restore,
            JournalChangeSource::Import,
            JournalChangeSource::Migration,
        ])
        .expect("change source enum serialization"),
        serde_json::to_value(&fixture.enums.change_source)
            .expect("change source fixture serialization")
    );
    assert_eq!(
        serde_json::to_value(vec![
            SearchEntityType::Journal,
            SearchEntityType::KnowledgeItem,
            SearchEntityType::Task,
            SearchEntityType::StructuredBlock,
        ])
        .expect("search entity enum serialization"),
        serde_json::to_value(&fixture.enums.search_entity_type)
            .expect("search entity fixture serialization")
    );
    assert_eq!(
        serde_json::to_value(vec![
            StorageErrorCode::MigrationFailed,
            StorageErrorCode::Conflict,
            StorageErrorCode::NotFound,
            StorageErrorCode::ValidationError,
            StorageErrorCode::StorageUnavailable,
        ])
        .expect("storage error enum serialization"),
        serde_json::to_value(&fixture.enums.storage_error_code)
            .expect("storage error fixture serialization")
    );
}
