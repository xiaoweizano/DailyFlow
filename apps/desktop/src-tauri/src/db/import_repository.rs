use std::collections::HashSet;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use uuid::Uuid;

use super::{
    journal_repository,
    models::{
        BeginImportCommitInput, ImportCommitBatchInput, ImportCommitSummary, ImportEntryInput,
        ImportExistingMatch, ImportSessionInput, RecordImportFailureInput,
    },
    StorageError,
};

const SESSION_STATUSES: &[&str] = &[
    "scanning",
    "preview_ready",
    "committing",
    "completed",
    "failed",
    "rolled_back",
];
const ENTRY_STATUSES: &[&str] = &[
    "ready", "skipped", "conflict", "invalid", "imported", "failed",
];
const RAW_CAPTURE_STATUSES: &[&str] = &["captured", "cleaned", "unavailable"];
const CONFLICT_KINDS: &[&str] = &[
    "duplicate_path",
    "duplicate_content",
    "same_date_conflict",
    "duplicate_date_in_batch",
];
const ENCODINGS: &[&str] = &["utf8-bom", "utf8", "gb18030", "unknown"];
const NEWLINE_STYLES: &[&str] = &["lf", "crlf", "mixed", "unknown"];

fn is_valid_id(value: &str) -> bool {
    value.len() == 36 && Uuid::parse_str(value).is_ok()
}

fn is_valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn require_non_empty(value: &str, field: &str) -> Result<(), StorageError> {
    if value.trim().is_empty() {
        return Err(StorageError::validation(format!(
            "{field} must not be empty"
        )));
    }
    Ok(())
}

fn require_known<'a>(
    value: &'a str,
    allowed: &[&str],
    field: &str,
) -> Result<&'a str, StorageError> {
    if !allowed.contains(&value) {
        return Err(StorageError::validation(format!(
            "{field} contains an unsupported value"
        )));
    }
    Ok(value)
}

fn validate_session(session: &ImportSessionInput) -> Result<(), StorageError> {
    if !is_valid_id(&session.id) {
        return Err(StorageError::validation("import session id must be a UUID"));
    }
    require_non_empty(&session.root_label, "rootLabel")?;
    require_known(&session.status, SESSION_STATUSES, "status")?;
    if !session.options.is_object() {
        return Err(StorageError::validation(
            "import session options must be a JSON object",
        ));
    }
    if session.revision < 1 {
        return Err(StorageError::validation(
            "import session revision must be positive",
        ));
    }
    for (field, value) in [
        ("scannedCount", session.scanned_count),
        ("readyCount", session.ready_count),
        ("importedCount", session.imported_count),
        ("skippedCount", session.skipped_count),
        ("conflictCount", session.conflict_count),
        ("invalidCount", session.invalid_count),
    ] {
        if value < 0 {
            return Err(StorageError::validation(format!(
                "{field} must not be negative"
            )));
        }
    }
    require_non_empty(&session.created_at, "createdAt")
}

fn decode_raw_bytes(entry: &ImportEntryInput) -> Result<Option<Vec<u8>>, StorageError> {
    if !is_valid_id(&entry.id) {
        return Err(StorageError::validation("import entry id must be a UUID"));
    }
    require_non_empty(&entry.relative_path, "relativePath")?;
    if entry.relative_path.starts_with('/')
        || entry.relative_path.starts_with('\\')
        || entry.relative_path.contains("/../")
        || entry.relative_path.starts_with("../")
        || entry.relative_path.contains("\\..\\")
        || entry.relative_path.starts_with("..\\")
    {
        return Err(StorageError::validation(
            "import entry path must be relative and cannot traverse its root",
        ));
    }
    require_non_empty(&entry.original_file_name, "originalFileName")?;
    if let Some(date) = &entry.detected_date {
        if !is_valid_date(date) {
            return Err(StorageError::validation(
                "detectedDate must use the YYYY-MM-DD format",
            ));
        }
    }
    require_known(&entry.encoding, ENCODINGS, "encoding")?;
    require_known(&entry.newline_style, NEWLINE_STYLES, "newlineStyle")?;
    require_known(
        &entry.raw_capture_status,
        RAW_CAPTURE_STATUSES,
        "rawCaptureStatus",
    )?;
    require_known(&entry.status, ENTRY_STATUSES, "status")?;
    if let Some(kind) = &entry.conflict_kind {
        require_known(kind, CONFLICT_KINDS, "conflictKind")?;
    }
    if let Some(size) = entry.raw_size {
        if size < 0 {
            return Err(StorageError::validation("rawSize must not be negative"));
        }
    }

    match entry.raw_capture_status.as_str() {
        "captured" => {
            let encoded = entry.raw_bytes_base64.as_deref().ok_or_else(|| {
                StorageError::validation("captured import entries must include raw bytes")
            })?;
            let bytes = STANDARD.decode(encoded).map_err(|_| {
                StorageError::validation("rawBytesBase64 is not valid standard base64")
            })?;
            let hash = entry.file_sha256.as_deref().ok_or_else(|| {
                StorageError::validation("captured import entries must include a SHA-256 hash")
            })?;
            if !is_sha256(hash) {
                return Err(StorageError::validation(
                    "fileSha256 must be a 64-character hexadecimal SHA-256 value",
                ));
            }
            let size = entry.raw_size.ok_or_else(|| {
                StorageError::validation("captured import entries must include rawSize")
            })?;
            if size as usize != bytes.len() {
                return Err(StorageError::validation(
                    "rawSize must match the decoded raw byte length",
                ));
            }
            if entry.raw_cleaned_at.is_some() {
                return Err(StorageError::validation(
                    "captured import entries cannot have rawCleanedAt",
                ));
            }
            Ok(Some(bytes))
        }
        "cleaned" => {
            let hash = entry.file_sha256.as_deref().ok_or_else(|| {
                StorageError::validation("cleaned import entries must include a SHA-256 hash")
            })?;
            if !is_sha256(hash) {
                return Err(StorageError::validation(
                    "fileSha256 must be a 64-character hexadecimal SHA-256 value",
                ));
            }
            if entry.raw_size.is_none() || entry.raw_cleaned_at.is_none() {
                return Err(StorageError::validation(
                    "cleaned import entries must include rawSize and rawCleanedAt",
                ));
            }
            if entry.raw_bytes_base64.is_some() {
                return Err(StorageError::validation(
                    "cleaned import entries cannot include raw bytes",
                ));
            }
            Ok(None)
        }
        "unavailable" => {
            if entry.raw_bytes_base64.is_some()
                || entry.file_sha256.is_some()
                || entry.raw_cleaned_at.is_some()
            {
                return Err(StorageError::validation(
                    "unavailable import entries cannot include bytes, a hash, or rawCleanedAt",
                ));
            }
            Ok(None)
        }
        _ => unreachable!("raw capture status is validated"),
    }
}

fn validate_unique_entries(entries: &[ImportEntryInput]) -> Result<(), StorageError> {
    let mut ids = HashSet::new();
    let mut paths = HashSet::new();
    for entry in entries {
        decode_raw_bytes(entry)?;
        if !ids.insert(entry.id.as_str()) {
            return Err(StorageError::conflict(format!(
                "duplicate import entry id: {}",
                entry.id
            )));
        }
        if !paths.insert(entry.relative_path.as_str()) {
            return Err(StorageError::conflict(format!(
                "duplicate import path: {}",
                entry.relative_path
            )));
        }
    }
    Ok(())
}

fn insert_entry(
    connection: &Connection,
    session_id: &str,
    entry: &ImportEntryInput,
) -> Result<(), StorageError> {
    let raw_bytes = decode_raw_bytes(entry)?;
    connection.execute(
        "INSERT INTO import_entries
           (id, session_id, relative_path, original_file_name, detected_date, encoding,
            newline_style, file_sha256, raw_size, raw_capture_status, raw_bytes,
            raw_cleaned_at, status, conflict_kind, error_code, error_detail, journal_id,
            previous_journal_revision, created_at, committed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                 ?15, ?16, ?17, ?18, ?19, ?20)",
        params![
            entry.id,
            session_id,
            entry.relative_path,
            entry.original_file_name,
            entry.detected_date,
            entry.encoding,
            entry.newline_style,
            entry.file_sha256,
            entry.raw_size,
            entry.raw_capture_status,
            raw_bytes,
            entry.raw_cleaned_at,
            entry.status,
            entry.conflict_kind,
            entry.error_code,
            entry.error_detail,
            entry.journal_id,
            entry.previous_journal_revision,
            entry.created_at,
            entry.committed_at
        ],
    )?;
    Ok(())
}

fn load_session(
    connection: &Connection,
    session_id: &str,
) -> Result<Option<ImportSessionInput>, StorageError> {
    let session = connection
        .query_row(
            "SELECT id, root_label, status, options_json, revision, scanned_count,
                    ready_count, imported_count, skipped_count, conflict_count,
                    invalid_count, created_at, completed_at, error_summary
             FROM import_sessions
             WHERE id = ?1",
            [session_id],
            |row| {
                let options_json = row.get::<_, String>(3)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    options_json,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?,
                ))
            },
        )
        .optional()?;
    let Some((
        id,
        root_label,
        status,
        options_json,
        revision,
        scanned_count,
        ready_count,
        imported_count,
        skipped_count,
        conflict_count,
        invalid_count,
        created_at,
        completed_at,
        error_summary,
    )) = session
    else {
        return Ok(None);
    };

    let entries = load_entries(connection, session_id)?;
    Ok(Some(ImportSessionInput {
        id,
        root_label,
        status,
        options: serde_json::from_str(&options_json)?,
        revision,
        scanned_count,
        ready_count,
        imported_count,
        skipped_count,
        conflict_count,
        invalid_count,
        entries,
        created_at,
        completed_at,
        error_summary,
    }))
}

fn load_entries(
    connection: &Connection,
    session_id: &str,
) -> Result<Vec<ImportEntryInput>, StorageError> {
    let mut statement = connection.prepare(
        "SELECT id, relative_path, original_file_name, detected_date, encoding,
                newline_style, file_sha256, raw_size, raw_capture_status,
                raw_bytes, raw_cleaned_at,
                status, conflict_kind, error_code, error_detail, journal_id,
                previous_journal_revision, created_at, committed_at
         FROM import_entries
         WHERE session_id = ?1
         ORDER BY relative_path ASC, id ASC",
    )?;
    let rows = statement.query_map([session_id], |row| {
        let raw_bytes: Option<Vec<u8>> = row.get(9)?;
        Ok(ImportEntryInput {
            id: row.get(0)?,
            relative_path: row.get(1)?,
            original_file_name: row.get(2)?,
            detected_date: row.get(3)?,
            encoding: row.get(4)?,
            newline_style: row.get(5)?,
            file_sha256: row.get(6)?,
            raw_size: row.get(7)?,
            raw_capture_status: row.get(8)?,
            raw_bytes_base64: raw_bytes.map(|bytes| STANDARD.encode(bytes)),
            raw_cleaned_at: row.get(10)?,
            status: row.get(11)?,
            conflict_kind: row.get(12)?,
            error_code: row.get(13)?,
            error_detail: row.get(14)?,
            journal_id: row.get(15)?,
            previous_journal_revision: row.get(16)?,
            created_at: row.get(17)?,
            committed_at: row.get(18)?,
        })
    })?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

fn session_revision_conflict(
    session_id: &str,
    expected_revision: i64,
    actual_revision: i64,
) -> StorageError {
    StorageError::conflict(format!(
        "import session {session_id} revision conflict: expected {expected_revision}, found {actual_revision}"
    ))
}

fn ensure_entry_committable(status: &str, entry_id: &str) -> Result<(), StorageError> {
    if matches!(status, "imported" | "failed") {
        return Err(StorageError::conflict(format!(
            "import entry {entry_id} already has a terminal outcome"
        )));
    }
    Ok(())
}

fn find_session_entry_status(
    connection: &Connection,
    session_id: &str,
    entry_id: &str,
) -> Result<Option<String>, StorageError> {
    Ok(connection
        .query_row(
            "SELECT status FROM import_entries WHERE id = ?1 AND session_id = ?2",
            params![entry_id, session_id],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn create_session(
    connection: &mut Connection,
    session: &ImportSessionInput,
) -> Result<(), StorageError> {
    validate_session(session)?;
    if session.status != "scanning" {
        return Err(StorageError::validation(
            "a new import session must be scanning",
        ));
    }
    if session.revision != 1 {
        return Err(StorageError::validation(
            "a new import session must start at revision 1",
        ));
    }
    if !session.entries.is_empty() {
        return Err(StorageError::validation(
            "a new import session must not contain entries",
        ));
    }

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let exists = transaction
        .query_row(
            "SELECT 1 FROM import_sessions WHERE id = ?1",
            [&session.id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if exists {
        return Err(StorageError::conflict("import session already exists"));
    }

    let options_json = serde_json::to_string(&session.options)?;
    transaction.execute(
        "INSERT INTO import_sessions
           (id, root_label, status, options_json, revision, scanned_count, ready_count,
            imported_count, skipped_count, conflict_count, invalid_count, created_at,
            completed_at, error_summary)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            session.id,
            session.root_label,
            session.status,
            options_json,
            session.revision,
            session.scanned_count,
            session.ready_count,
            session.imported_count,
            session.skipped_count,
            session.conflict_count,
            session.invalid_count,
            session.created_at,
            session.completed_at,
            session.error_summary
        ],
    )?;
    transaction.commit()?;
    Ok(())
}

pub fn save_preview(
    connection: &mut Connection,
    session: &ImportSessionInput,
) -> Result<(), StorageError> {
    validate_session(session)?;
    if session.status != "preview_ready" {
        return Err(StorageError::validation(
            "saved preview must have preview_ready status",
        ));
    }
    validate_unique_entries(&session.entries)?;

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = load_session(&transaction, &session.id)?
        .ok_or_else(|| StorageError::not_found("import session does not exist"))?;
    if current.status != "scanning" || current.revision.checked_add(1) != Some(session.revision) {
        return Err(session_revision_conflict(
            &session.id,
            session.revision - 1,
            current.revision,
        ));
    }
    if current.root_label != session.root_label
        || current.options != session.options
        || current.created_at != session.created_at
    {
        return Err(StorageError::conflict(
            "import session immutable fields changed while building the preview",
        ));
    }

    transaction.execute(
        "DELETE FROM import_entries WHERE session_id = ?1",
        [&session.id],
    )?;
    for entry in &session.entries {
        insert_entry(&transaction, &session.id, entry)?;
    }

    let options_json = serde_json::to_string(&session.options)?;
    let changed = transaction.execute(
        "UPDATE import_sessions
         SET status = ?1, options_json = ?2, revision = ?3, scanned_count = ?4,
             ready_count = ?5, imported_count = ?6, skipped_count = ?7,
             conflict_count = ?8, invalid_count = ?9, completed_at = ?10,
             error_summary = ?11
         WHERE id = ?12 AND status = 'scanning' AND revision = ?13",
        params![
            session.status,
            options_json,
            session.revision,
            session.scanned_count,
            session.ready_count,
            session.imported_count,
            session.skipped_count,
            session.conflict_count,
            session.invalid_count,
            session.completed_at,
            session.error_summary,
            session.id,
            current.revision
        ],
    )?;
    if changed != 1 {
        return Err(StorageError::conflict(
            "import session changed while saving the preview",
        ));
    }
    transaction.commit()?;
    Ok(())
}

pub fn find_existing_matches(
    connection: &Connection,
    entries: &[ImportEntryInput],
) -> Result<Vec<ImportExistingMatch>, StorageError> {
    if entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut statement = connection.prepare(
        "SELECT ie.relative_path, ie.detected_date, ie.file_sha256, ie.journal_id, j.revision
         FROM import_entries ie
         JOIN journals j ON j.id = ie.journal_id
         WHERE ie.status = 'imported'
           AND ie.journal_id IS NOT NULL
           AND j.status = 'active'
           AND j.deleted_at IS NULL
         ORDER BY ie.created_at ASC, ie.id ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(ImportExistingMatch {
            relative_path: row.get(0)?,
            detected_date: row.get(1)?,
            file_sha256: row.get(2)?,
            journal_id: row.get(3)?,
            journal_revision: row.get(4)?,
        })
    })?;

    let mut matches = Vec::new();
    let mut matched_journal_ids = HashSet::new();
    for row in rows {
        let imported = row?;
        let relevant = entries.iter().any(|entry| {
            imported.relative_path.as_deref() == Some(entry.relative_path.as_str())
                || (entry.file_sha256.is_some() && entry.file_sha256 == imported.file_sha256)
                || (entry.detected_date.is_some() && entry.detected_date == imported.detected_date)
        });
        if relevant {
            if let Some(journal_id) = &imported.journal_id {
                matched_journal_ids.insert(journal_id.clone());
            }
            matches.push(imported);
        }
    }

    let candidate_dates: HashSet<&str> = entries
        .iter()
        .filter_map(|entry| entry.detected_date.as_deref())
        .collect();
    let mut journal_statement = connection.prepare(
        "SELECT id, journal_date, revision
         FROM journals
         WHERE status = 'active' AND deleted_at IS NULL
         ORDER BY journal_date ASC, id ASC",
    )?;
    let journals = journal_statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    for journal in journals {
        let (id, date, revision) = journal?;
        if candidate_dates.contains(date.as_str()) && !matched_journal_ids.contains(&id) {
            matches.push(ImportExistingMatch {
                relative_path: None,
                detected_date: Some(date),
                file_sha256: None,
                journal_id: Some(id),
                journal_revision: Some(revision),
            });
        }
    }

    Ok(matches)
}

pub fn begin_commit(
    connection: &mut Connection,
    input: &BeginImportCommitInput,
) -> Result<ImportSessionInput, StorageError> {
    if !is_valid_id(&input.session_id) || input.expected_revision < 1 {
        return Err(StorageError::validation(
            "begin import commit input is invalid",
        ));
    }
    require_non_empty(&input.started_at, "startedAt")?;

    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = load_session(&transaction, &input.session_id)?
        .ok_or_else(|| StorageError::not_found("import session does not exist"))?;
    if current.status != "preview_ready" || current.revision != input.expected_revision {
        return Err(session_revision_conflict(
            &input.session_id,
            input.expected_revision,
            current.revision,
        ));
    }
    let changed = transaction.execute(
        "UPDATE import_sessions
         SET status = 'committing', revision = revision + 1
         WHERE id = ?1 AND status = 'preview_ready' AND revision = ?2",
        params![input.session_id, input.expected_revision],
    )?;
    if changed != 1 {
        return Err(StorageError::conflict(
            "import session changed while beginning commit",
        ));
    }
    let committing = load_session(&transaction, &input.session_id)?
        .ok_or_else(|| StorageError::not_found("import session does not exist"))?;
    transaction.commit()?;
    Ok(committing)
}

pub fn commit_batch(
    connection: &mut Connection,
    input: &ImportCommitBatchInput,
) -> Result<ImportCommitSummary, StorageError> {
    require_non_empty(&input.committed_at, "committedAt")?;
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let session = load_session(&transaction, &input.session_id)?
        .ok_or_else(|| StorageError::not_found("import session does not exist"))?;
    if session.status != "committing" || session.revision != input.expected_revision {
        return Err(session_revision_conflict(
            &input.session_id,
            input.expected_revision,
            session.revision,
        ));
    }

    let mut selected_ids = HashSet::new();
    for entry_id in input
        .entries
        .iter()
        .map(|entry| entry.entry_id.as_str())
        .chain(input.skipped_entry_ids.iter().map(String::as_str))
        .chain(input.failed_entry_ids.iter().map(String::as_str))
    {
        if !is_valid_id(entry_id) || !selected_ids.insert(entry_id) {
            return Err(StorageError::validation(
                "an import entry cannot be selected for multiple outcomes",
            ));
        }
    }

    for entry in &input.entries {
        if entry.journal_id != entry.snapshot.journal_id
            || entry.previous_journal_revision != entry.snapshot.expected_revision
        {
            return Err(StorageError::validation(format!(
                "import entry {} snapshot does not match its journal audit fields",
                entry.entry_id
            )));
        }
        let current_status =
            find_session_entry_status(&transaction, &input.session_id, &entry.entry_id)?
                .ok_or_else(|| {
                    StorageError::not_found(format!(
                        "import entry {} does not belong to session {}",
                        entry.entry_id, input.session_id
                    ))
                })?;
        ensure_entry_committable(&current_status, &entry.entry_id)?;

        journal_repository::save_snapshot_in_transaction(&transaction, &entry.snapshot)?;
        let changed = transaction.execute(
            "UPDATE import_entries
             SET status = 'imported', journal_id = ?1, previous_journal_revision = ?2,
                 committed_at = ?3, error_code = NULL, error_detail = NULL
             WHERE id = ?4 AND session_id = ?5 AND status NOT IN ('imported', 'failed')",
            params![
                entry.journal_id,
                entry.previous_journal_revision,
                input.committed_at,
                entry.entry_id,
                input.session_id
            ],
        )?;
        if changed != 1 {
            return Err(StorageError::conflict(format!(
                "import entry {} changed during commit",
                entry.entry_id
            )));
        }
    }

    for entry_id in &input.skipped_entry_ids {
        let current_status = find_session_entry_status(&transaction, &input.session_id, entry_id)?
            .ok_or_else(|| {
                StorageError::not_found(format!(
                    "import entry {entry_id} does not belong to session {}",
                    input.session_id
                ))
            })?;
        ensure_entry_committable(&current_status, entry_id)?;
        let changed = transaction.execute(
            "UPDATE import_entries
             SET status = 'skipped', committed_at = ?1
             WHERE id = ?2 AND session_id = ?3 AND status NOT IN ('imported', 'failed')",
            params![input.committed_at, entry_id, input.session_id],
        )?;
        if changed != 1 {
            return Err(StorageError::conflict(format!(
                "import entry {entry_id} changed during commit"
            )));
        }
    }

    for entry_id in &input.failed_entry_ids {
        let current_status = find_session_entry_status(&transaction, &input.session_id, entry_id)?
            .ok_or_else(|| {
                StorageError::not_found(format!(
                    "import entry {entry_id} does not belong to session {}",
                    input.session_id
                ))
            })?;
        ensure_entry_committable(&current_status, entry_id)?;
        let changed = transaction.execute(
            "UPDATE import_entries
             SET status = 'failed', committed_at = ?1, error_code = 'IMPORT_ENTRY_FAILED',
                 error_detail = 'The import entry could not be committed'
             WHERE id = ?2 AND session_id = ?3 AND status NOT IN ('imported', 'failed')",
            params![input.committed_at, entry_id, input.session_id],
        )?;
        if changed != 1 {
            return Err(StorageError::conflict(format!(
                "import entry {entry_id} changed during commit"
            )));
        }
    }

    let imported_count = i64::try_from(input.entries.len())
        .map_err(|_| StorageError::validation("too many import entries"))?;
    let skipped_count = i64::try_from(input.skipped_entry_ids.len())
        .map_err(|_| StorageError::validation("too many skipped import entries"))?;
    let failed_count = i64::try_from(input.failed_entry_ids.len())
        .map_err(|_| StorageError::validation("too many failed import entries"))?;
    let changed = transaction.execute(
        "UPDATE import_sessions
         SET status = 'completed', revision = revision + 1, imported_count = ?1,
             skipped_count = ?2, completed_at = ?3, error_summary = NULL
         WHERE id = ?4 AND status = 'committing' AND revision = ?5",
        params![
            imported_count,
            skipped_count,
            input.committed_at,
            input.session_id,
            input.expected_revision
        ],
    )?;
    if changed != 1 {
        return Err(StorageError::conflict(
            "import session changed while completing commit",
        ));
    }

    transaction.commit()?;
    Ok(ImportCommitSummary {
        session_id: input.session_id.clone(),
        imported_count,
        skipped_count,
        failed_count,
    })
}

pub fn record_failure(
    connection: &mut Connection,
    input: &RecordImportFailureInput,
) -> Result<(), StorageError> {
    require_non_empty(&input.error_summary, "errorSummary")?;
    require_non_empty(&input.failed_at, "failedAt")?;
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let session = load_session(&transaction, &input.session_id)?
        .ok_or_else(|| StorageError::not_found("import session does not exist"))?;
    if session.status == "completed" {
        return Err(StorageError::conflict(
            "a completed import cannot be converted into a failure",
        ));
    }
    if session.revision != input.expected_revision {
        return Err(session_revision_conflict(
            &input.session_id,
            input.expected_revision,
            session.revision,
        ));
    }

    let mut failed_ids = HashSet::new();
    for entry_id in &input.failed_entry_ids {
        if !is_valid_id(entry_id) || !failed_ids.insert(entry_id.as_str()) {
            return Err(StorageError::validation(
                "failed import entry ids must be unique UUIDs",
            ));
        }
        let current_status = find_session_entry_status(&transaction, &input.session_id, entry_id)?
            .ok_or_else(|| {
                StorageError::not_found(format!(
                    "import entry {entry_id} does not belong to session {}",
                    input.session_id
                ))
            })?;
        if matches!(current_status.as_str(), "imported" | "failed") {
            return Err(StorageError::conflict(format!(
                "import entry {entry_id} already has a terminal outcome"
            )));
        }
        transaction.execute(
            "UPDATE import_entries
             SET status = 'failed', committed_at = ?1, error_code = 'IMPORT_COMMIT_FAILED',
                 error_detail = ?2
             WHERE id = ?3 AND session_id = ?4",
            params![
                input.failed_at,
                input.error_summary,
                entry_id,
                input.session_id
            ],
        )?;
    }

    let changed = transaction.execute(
        "UPDATE import_sessions
         SET status = 'failed', revision = revision + 1, completed_at = ?1,
             error_summary = ?2
         WHERE id = ?3 AND revision = ?4 AND status <> 'completed'",
        params![
            input.failed_at,
            input.error_summary,
            input.session_id,
            input.expected_revision
        ],
    )?;
    if changed != 1 {
        return Err(StorageError::conflict(
            "import session changed while recording failure",
        ));
    }
    transaction.commit()?;
    Ok(())
}
