use std::{
    ffi::OsStr,
    fs,
    path::{Component, Path, PathBuf},
};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::db::{Database, StorageError};

const MAX_ATTACHMENT_BYTES: usize = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/json",
    "application/zip",
    "application/octet-stream",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentOwnerType {
    Journal,
    KnowledgeItem,
    StructuredBlock,
}

impl AttachmentOwnerType {
    fn as_storage_value(self) -> &'static str {
        match self {
            Self::Journal => "journal",
            Self::KnowledgeItem => "knowledge_item",
            Self::StructuredBlock => "structured_block",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentPutInput {
    pub owner_type: AttachmentOwnerType,
    pub owner_id: String,
    pub display_name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
    pub alt_text: Option<String>,
    pub is_inline: bool,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub id: String,
    pub blob_id: String,
    pub owner_type: AttachmentOwnerType,
    pub owner_id: String,
    pub display_name: String,
    pub alt_text: String,
    pub is_inline: bool,
    pub sort_order: i64,
    pub mime_type: String,
    pub byte_size: u64,
    pub storage_kind: String,
    pub storage_key: String,
    pub sha256: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttachment {
    pub attachment: AttachmentRef,
    pub content_hash: String,
    pub byte_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentData {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct AttachmentStore {
    root: PathBuf,
}

impl AttachmentStore {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, StorageError> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("attachments/.tmp")).map_err(|error| {
            StorageError::storage(format!("failed to create attachment directory: {error}"))
        })?;
        Ok(Self { root })
    }

    pub fn put(
        &self,
        database: &Database,
        input: AttachmentPutInput,
    ) -> Result<StoredAttachment, StorageError> {
        validate_put_input(&input)?;
        let sha256 = sha256_hex(&input.bytes);
        let storage_key = storage_key_for_hash(&sha256);
        let byte_size = input.bytes.len() as u64;
        let created_file = self.persist_content(&storage_key, &input.bytes)?;

        let result = database.with_connection(|connection| {
            let transaction = connection.transaction()?;
            let existing_blob = transaction
                .query_row(
                    "SELECT id, mime_type, storage_key, created_at
                     FROM attachment_blobs
                     WHERE sha256 = ?1 AND byte_size = ?2",
                    params![sha256, byte_size as i64],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .optional()?;

            let blob = if let Some(blob) = existing_blob {
                blob
            } else {
                let blob_id = Uuid::now_v7().to_string();
                transaction.execute(
                    "INSERT INTO attachment_blobs (
                       id, sha256, byte_size, mime_type, storage_kind, storage_key,
                       created_at, orphaned_at
                     ) VALUES (?1, ?2, ?3, ?4, 'desktop-file', ?5, ?6, NULL)",
                    params![
                        blob_id,
                        sha256,
                        byte_size as i64,
                        input.mime_type,
                        storage_key,
                        input.created_at
                    ],
                )?;
                (
                    blob_id,
                    input.mime_type.clone(),
                    storage_key.clone(),
                    input.created_at.clone(),
                )
            };

            let link_id = Uuid::now_v7().to_string();
            transaction.execute(
                "INSERT INTO attachment_links (
                   id, blob_id, owner_type, owner_id, display_name, alt_text,
                   is_inline, sort_order, created_at, deleted_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)",
                params![
                    link_id,
                    blob.0,
                    input.owner_type.as_storage_value(),
                    input.owner_id,
                    input.display_name,
                    input.alt_text.as_deref().unwrap_or_default(),
                    i64::from(input.is_inline),
                    input.sort_order,
                    input.created_at
                ],
            )?;

            let attachment = AttachmentRef {
                id: link_id,
                blob_id: blob.0,
                owner_type: input.owner_type,
                owner_id: input.owner_id,
                display_name: input.display_name,
                alt_text: input.alt_text.unwrap_or_default(),
                is_inline: input.is_inline,
                sort_order: input.sort_order,
                mime_type: blob.1,
                byte_size,
                storage_kind: "desktop-file".to_owned(),
                storage_key: blob.2,
                sha256: sha256.clone(),
                created_at: input.created_at,
                deleted_at: None,
            };
            transaction.commit()?;
            Ok(StoredAttachment {
                attachment,
                content_hash: sha256.clone(),
                byte_size,
            })
        });

        if result.is_err() && created_file {
            let _ = fs::remove_file(self.resolve_path(&storage_key)?);
        }
        result
    }

    pub fn read(&self, database: &Database, attachment_id: &str) -> Result<Vec<u8>, StorageError> {
        self.read_data(database, attachment_id)
            .map(|attachment| attachment.bytes)
    }

    pub fn read_data(
        &self,
        database: &Database,
        attachment_id: &str,
    ) -> Result<AttachmentData, StorageError> {
        validate_uuid(attachment_id, "attachmentId")?;
        let row = database.with_connection(|connection| {
            connection
                .query_row(
                    "SELECT blobs.mime_type, blobs.storage_key
                     FROM attachment_links AS links
                     JOIN attachment_blobs AS blobs ON blobs.id = links.blob_id
                     WHERE links.id = ?1 AND links.deleted_at IS NULL",
                    [attachment_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(StorageError::from)
        })?;
        let (mime_type, storage_key) =
            row.ok_or_else(|| StorageError::not_found("Attachment not found"))?;
        let bytes = fs::read(self.resolve_path(&storage_key)?).map_err(|error| {
            StorageError::storage(format!("failed to read attachment content: {error}"))
        })?;
        Ok(AttachmentData { mime_type, bytes })
    }

    pub fn soft_delete_owner_links(
        &self,
        database: &Database,
        owner_type: AttachmentOwnerType,
        owner_id: &str,
        deleted_at: &str,
    ) -> Result<(), StorageError> {
        validate_uuid(owner_id, "ownerId")?;
        validate_timestamp(deleted_at, "deletedAt")?;

        database.with_connection(|connection| {
            let transaction = connection.transaction()?;
            transaction.execute(
                "UPDATE attachment_links
                 SET deleted_at = ?1
                 WHERE owner_type = ?2 AND owner_id = ?3 AND deleted_at IS NULL",
                params![deleted_at, owner_type.as_storage_value(), owner_id],
            )?;

            let mut statement = transaction.prepare(
                "SELECT DISTINCT blob_id
                 FROM attachment_links
                 WHERE owner_type = ?1 AND owner_id = ?2 AND deleted_at = ?3",
            )?;
            let blob_ids = statement
                .query_map(
                    params![owner_type.as_storage_value(), owner_id, deleted_at],
                    |row| row.get::<_, String>(0),
                )?
                .collect::<Result<Vec<_>, _>>()?;
            drop(statement);

            for blob_id in blob_ids {
                transaction.execute(
                    "UPDATE attachment_blobs
                     SET orphaned_at = ?1
                     WHERE id = ?2
                       AND orphaned_at IS NULL
                       AND NOT EXISTS (
                         SELECT 1
                         FROM attachment_links
                         WHERE blob_id = ?2 AND deleted_at IS NULL
                       )",
                    params![deleted_at, blob_id],
                )?;
            }
            transaction.commit()?;
            Ok(())
        })
    }

    pub fn remove_orphan(
        &self,
        database: &Database,
        attachment_id: &str,
    ) -> Result<(), StorageError> {
        validate_uuid(attachment_id, "attachmentId")?;
        let storage_key = database.with_connection(|connection| {
            let transaction = connection.transaction()?;
            let linked_blob_id = transaction
                .query_row(
                    "SELECT blob_id FROM attachment_links WHERE id = ?1",
                    [attachment_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            let blob_id = linked_blob_id.unwrap_or_else(|| attachment_id.to_owned());
            let blob = transaction
                .query_row(
                    "SELECT storage_key, orphaned_at
                     FROM attachment_blobs
                     WHERE id = ?1",
                    [&blob_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
                )
                .optional()?;
            let Some((storage_key, orphaned_at)) = blob else {
                return Err(StorageError::not_found("Attachment not found"));
            };
            if orphaned_at.is_none() {
                return Err(StorageError::conflict(
                    "Only orphaned attachments can be removed",
                ));
            }
            let active_links: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM attachment_links
                 WHERE blob_id = ?1 AND deleted_at IS NULL",
                [&blob_id],
                |row| row.get(0),
            )?;
            if active_links > 0 {
                return Err(StorageError::conflict("Attachment is still referenced"));
            }
            transaction.execute("DELETE FROM attachment_blobs WHERE id = ?1", [&blob_id])?;
            transaction.commit()?;
            Ok(storage_key)
        })?;

        let path = self.resolve_path(&storage_key)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(StorageError::storage(format!(
                "failed to remove orphaned attachment file: {error}"
            ))),
        }
    }

    fn persist_content(&self, storage_key: &str, bytes: &[u8]) -> Result<bool, StorageError> {
        let destination = self.resolve_path(storage_key)?;
        if destination.is_file() {
            return Ok(false);
        }
        let parent = destination
            .parent()
            .ok_or_else(|| StorageError::validation("Attachment storage key has no parent"))?;
        fs::create_dir_all(parent).map_err(|error| {
            StorageError::storage(format!("failed to create attachment path: {error}"))
        })?;

        let temporary = self
            .root
            .join("attachments/.tmp")
            .join(format!("{}.tmp", Uuid::now_v7()));
        if let Err(error) = fs::write(&temporary, bytes) {
            let _ = fs::remove_file(&temporary);
            return Err(StorageError::storage(format!(
                "failed to write attachment temporary file: {error}"
            )));
        }

        let persisted_bytes = match fs::read(&temporary) {
            Ok(bytes) => bytes,
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                return Err(StorageError::storage(format!(
                    "failed to verify attachment temporary file: {error}"
                )));
            }
        };
        if sha256_hex(&persisted_bytes) != sha256_hex(bytes) {
            let _ = fs::remove_file(&temporary);
            return Err(StorageError::storage(
                "Attachment content hash verification failed",
            ));
        }

        if destination.exists() {
            let _ = fs::remove_file(&temporary);
            return Ok(false);
        }
        match fs::rename(&temporary, &destination) {
            Ok(()) => Ok(true),
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                Err(StorageError::storage(format!(
                    "failed to commit attachment file: {error}"
                )))
            }
        }
    }

    fn resolve_path(&self, storage_key: &str) -> Result<PathBuf, StorageError> {
        if storage_key.is_empty()
            || storage_key.contains('\\')
            || Path::new(storage_key).is_absolute()
        {
            return Err(StorageError::validation("Invalid attachment storage key"));
        }

        let relative = Path::new(storage_key);
        let components = relative.components().collect::<Vec<_>>();
        if components.len() != 4
            || components
                .iter()
                .any(|component| !matches!(component, Component::Normal(_)))
            || components.first().and_then(|component| match component {
                Component::Normal(value) => Some(*value),
                _ => None,
            }) != Some(OsStr::new("attachments"))
        {
            return Err(StorageError::validation("Invalid attachment storage key"));
        }

        let path = self.root.join(relative);
        if !path.starts_with(&self.root) {
            return Err(StorageError::validation("Invalid attachment storage key"));
        }
        Ok(path)
    }
}

fn validate_put_input(input: &AttachmentPutInput) -> Result<(), StorageError> {
    validate_uuid(&input.owner_id, "ownerId")?;
    validate_timestamp(&input.created_at, "createdAt")?;
    if input.display_name.trim().is_empty() || input.display_name.chars().count() > 255 {
        return Err(StorageError::validation(
            "displayName must contain between 1 and 255 characters",
        ));
    }
    if !ALLOWED_MIME_TYPES.contains(&input.mime_type.as_str()) {
        return Err(StorageError::validation(
            "Attachment MIME type is not allowed",
        ));
    }
    if input.bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(StorageError::validation(
            "Attachment exceeds the 50 MB size limit",
        ));
    }
    if input.sort_order < 0 {
        return Err(StorageError::validation("sortOrder must not be negative"));
    }
    if input
        .alt_text
        .as_ref()
        .is_some_and(|value| value.len() > 500)
    {
        return Err(StorageError::validation(
            "altText must not exceed 500 characters",
        ));
    }
    Ok(())
}

fn validate_uuid(value: &str, field: &str) -> Result<(), StorageError> {
    if value.len() != 36 || Uuid::parse_str(value).is_err() {
        return Err(StorageError::validation(format!("{field} must be a UUID")));
    }
    Ok(())
}

fn validate_timestamp(value: &str, field: &str) -> Result<(), StorageError> {
    if value.len() < 20 || !value.contains('T') || !value.ends_with('Z') {
        return Err(StorageError::validation(format!(
            "{field} must be an ISO-8601 UTC timestamp"
        )));
    }
    Ok(())
}

fn sha256_hex(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn storage_key_for_hash(sha256: &str) -> String {
    format!(
        "attachments/{}/{}/{}.bin",
        &sha256[0..2],
        &sha256[2..4],
        sha256
    )
}
