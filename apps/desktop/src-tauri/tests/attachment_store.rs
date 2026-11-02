use std::fs;

use dailyflow_desktop::{
    attachments::{AttachmentOwnerType, AttachmentPutInput, AttachmentStore, StoredAttachment},
    db::Database,
};
use rusqlite::params;
use tempfile::tempdir;

const OWNER_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c26";
const CREATED_AT: &str = "2026-10-30T03:20:11.123Z";

struct Harness {
    _directory: tempfile::TempDir,
    database: Database,
    store: AttachmentStore,
}

fn create_harness() -> Harness {
    let directory = tempdir().expect("temporary directory");
    let database = Database::open(directory.path().join("dailyflow.db")).expect("open database");
    let store = AttachmentStore::open(directory.path()).expect("open attachment store");
    Harness {
        _directory: directory,
        database,
        store,
    }
}

fn put_input(bytes: &[u8], mime_type: &str) -> AttachmentPutInput {
    AttachmentPutInput {
        owner_type: AttachmentOwnerType::Journal,
        owner_id: OWNER_ID.to_owned(),
        display_name: "hello.txt".to_owned(),
        mime_type: mime_type.to_owned(),
        bytes: bytes.to_vec(),
        alt_text: None,
        is_inline: false,
        sort_order: 0,
        created_at: CREATED_AT.to_owned(),
    }
}

fn stored_in_harness(harness: &Harness, input: AttachmentPutInput) -> StoredAttachment {
    harness
        .store
        .put(&harness.database, input)
        .expect("store attachment")
}

#[test]
fn writes_hashed_file_and_deduplicates_blob_content() {
    let harness = create_harness();

    let first = stored_in_harness(&harness, put_input(b"hello", "text/plain"));
    let second = stored_in_harness(&harness, put_input(b"hello", "text/plain"));

    assert_eq!(
        first.attachment.sha256,
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    assert_eq!(
        first.attachment.storage_key,
        "attachments/2c/f2/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824.bin"
    );
    assert_eq!(first.attachment.blob_id, second.attachment.blob_id);
    assert_ne!(first.attachment.id, second.attachment.id);
    assert!(harness
        ._directory
        .path()
        .join(&first.attachment.storage_key)
        .is_file());
    assert_eq!(
        fs::read_dir(harness._directory.path().join("attachments/.tmp"))
            .expect("temporary directory")
            .count(),
        0
    );

    let counts = harness
        .database
        .with_connection(|connection| {
            let blobs: i64 =
                connection.query_row("SELECT COUNT(*) FROM attachment_blobs", [], |row| {
                    row.get(0)
                })?;
            let links: i64 =
                connection.query_row("SELECT COUNT(*) FROM attachment_links", [], |row| {
                    row.get(0)
                })?;
            Ok((blobs, links))
        })
        .expect("read counts");
    assert_eq!(counts, (1, 2));
}

#[test]
fn rejects_path_traversal_when_reading_a_tampered_storage_key() {
    let harness = create_harness();
    let stored = stored_in_harness(&harness, put_input(b"hello", "text/plain"));
    harness
        .database
        .with_connection(|connection| {
            connection.execute(
                "UPDATE attachment_blobs SET storage_key = ?1 WHERE id = ?2",
                params!["../outside.bin", stored.attachment.blob_id],
            )?;
            Ok(())
        })
        .expect("tamper storage key");

    let error = harness
        .store
        .read(&harness.database, &stored.attachment.id)
        .expect_err("path traversal must fail");

    assert!(error.message.contains("storage key"));
}

#[test]
fn rejects_active_content_mime_types() {
    let harness = create_harness();

    for mime_type in ["text/html", "image/svg+xml"] {
        let error = harness
            .store
            .put(&harness.database, put_input(b"<script/>", mime_type))
            .expect_err("active content must be rejected");
        assert!(error.message.contains("MIME"));
    }
}

#[test]
fn marks_blob_orphaned_after_its_last_owner_link_is_deleted() {
    let harness = create_harness();
    let stored = stored_in_harness(&harness, put_input(b"hello", "text/plain"));
    let deleted_at = "2026-10-31T03:20:11.123Z";

    harness
        .store
        .soft_delete_owner_links(
            &harness.database,
            AttachmentOwnerType::Journal,
            OWNER_ID,
            deleted_at,
        )
        .expect("delete owner links");

    let state = harness
        .database
        .with_connection(|connection| {
            let link_deleted_at: Option<String> = connection.query_row(
                "SELECT deleted_at FROM attachment_links WHERE id = ?1",
                [&stored.attachment.id],
                |row| row.get(0),
            )?;
            let orphaned_at: Option<String> = connection.query_row(
                "SELECT orphaned_at FROM attachment_blobs WHERE id = ?1",
                [&stored.attachment.blob_id],
                |row| row.get(0),
            )?;
            Ok((link_deleted_at, orphaned_at))
        })
        .expect("read attachment state");

    assert_eq!(state.0.as_deref(), Some(deleted_at));
    assert_eq!(state.1.as_deref(), Some(deleted_at));
}
