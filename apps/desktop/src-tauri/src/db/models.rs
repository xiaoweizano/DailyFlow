use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JournalSaveCheckpoint {
    Autosave,
    Explicit,
    Restore,
    Import,
}

impl JournalSaveCheckpoint {
    pub(crate) fn change_source(self) -> JournalChangeSource {
        match self {
            Self::Autosave => JournalChangeSource::Autosave,
            Self::Explicit => JournalChangeSource::Explicit,
            Self::Restore => JournalChangeSource::Restore,
            Self::Import => JournalChangeSource::Import,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JournalChangeSource {
    Autosave,
    Explicit,
    Restore,
    Import,
    Migration,
}

impl JournalChangeSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Autosave => "autosave",
            Self::Explicit => "explicit",
            Self::Restore => "restore",
            Self::Import => "import",
            Self::Migration => "migration",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchEntityType {
    Journal,
    KnowledgeItem,
    Task,
    StructuredBlock,
}

impl SearchEntityType {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Journal => "journal",
            Self::KnowledgeItem => "knowledge_item",
            Self::Task => "task",
            Self::StructuredBlock => "structured_block",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredBlockInput {
    pub id: String,
    pub block_type: String,
    pub schema_version: i64,
    pub data: Value,
    pub order_key: String,
    pub rendered_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDocumentInput {
    pub id: String,
    pub entity_type: SearchEntityType,
    pub entity_id: String,
    pub title: String,
    pub body_text: String,
    pub structured_text: String,
    pub tags_text: String,
    pub normalized_text: String,
    pub tokenized_text: String,
    pub local_date: Option<String>,
    pub updated_at: String,
    pub content_hash: String,
    pub index_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveJournalSnapshot {
    pub journal_id: String,
    pub journal_date: String,
    pub timezone: String,
    pub title: String,
    pub content_json: Value,
    pub editor_schema_version: i64,
    pub content_markdown: String,
    pub content_plain_text: String,
    pub content_hash: String,
    pub projection_version: i64,
    pub excerpt: String,
    pub expected_revision: Option<i64>,
    pub checkpoint: JournalSaveCheckpoint,
    pub tags: Vec<String>,
    pub structured_blocks: Vec<StructuredBlockInput>,
    pub search_documents: Vec<SearchDocumentInput>,
    pub saved_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedJournalSnapshot {
    pub journal_id: String,
    pub revision: i64,
    pub saved_at: String,
    pub content_hash: String,
    pub version_created: bool,
    pub search_index_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSessionInput {
    pub id: String,
    pub root_label: String,
    pub status: String,
    pub options: Value,
    pub revision: i64,
    pub scanned_count: i64,
    pub ready_count: i64,
    pub imported_count: i64,
    pub skipped_count: i64,
    pub conflict_count: i64,
    pub invalid_count: i64,
    pub entries: Vec<ImportEntryInput>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub error_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEntryInput {
    pub id: String,
    pub relative_path: String,
    pub original_file_name: String,
    pub detected_date: Option<String>,
    pub encoding: String,
    pub newline_style: String,
    pub file_sha256: Option<String>,
    pub raw_size: Option<i64>,
    pub raw_capture_status: String,
    pub raw_bytes_base64: Option<String>,
    pub raw_cleaned_at: Option<String>,
    pub status: String,
    pub conflict_kind: Option<String>,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub journal_id: Option<String>,
    pub previous_journal_revision: Option<i64>,
    pub created_at: String,
    pub committed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportExistingMatch {
    pub relative_path: Option<String>,
    pub detected_date: Option<String>,
    pub file_sha256: Option<String>,
    pub journal_id: Option<String>,
    pub journal_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginImportCommitInput {
    pub session_id: String,
    pub expected_revision: i64,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitEntryInput {
    pub entry_id: String,
    pub journal_id: String,
    pub previous_journal_revision: Option<i64>,
    pub snapshot: SaveJournalSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitBatchInput {
    pub session_id: String,
    pub expected_revision: i64,
    pub committed_at: String,
    pub entries: Vec<ImportCommitEntryInput>,
    pub skipped_entry_ids: Vec<String>,
    pub failed_entry_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitSummary {
    pub session_id: String,
    pub imported_count: i64,
    pub skipped_count: i64,
    pub failed_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordImportFailureInput {
    pub session_id: String,
    pub expected_revision: i64,
    pub failed_at: String,
    pub error_summary: String,
    pub failed_entry_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreJournalVersionInput {
    pub journal_id: String,
    pub version_revision: i64,
    pub expected_current_revision: i64,
    pub restored_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Journal {
    pub id: String,
    pub journal_date: String,
    pub timezone: String,
    pub title: String,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_plain_text: String,
    pub editor_schema_version: i64,
    pub projection_version: i64,
    pub content_hash: String,
    pub excerpt: String,
    pub status: String,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub tags: Vec<String>,
    pub structured_blocks: Vec<StructuredBlockInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSaveState {
    pub journal_id: String,
    pub journal_date: String,
    pub timezone: String,
    pub revision: i64,
    pub title: String,
    pub content_hash: String,
    pub projection_version: i64,
    pub tags: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalVersion {
    pub id: String,
    pub journal_id: String,
    pub revision: i64,
    pub title: String,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_plain_text: String,
    pub editor_schema_version: i64,
    pub projection_version: i64,
    pub content_hash: String,
    pub change_source: JournalChangeSource,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalVersionSummary {
    pub journal_id: String,
    pub revision: i64,
    pub title: String,
    pub change_source: JournalChangeSource,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub id: String,
    pub journal_date: String,
    pub title: String,
    pub excerpt: String,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalListQuery {
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub status: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub text: String,
    pub entity_types: Option<Vec<SearchEntityType>>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub entity_type: SearchEntityType,
    pub entity_id: String,
    pub title: String,
    pub snippet: String,
    pub local_date: Option<String>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPage {
    pub items: Vec<SearchHit>,
    pub next_cursor: Option<String>,
    pub index_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRebuildResult {
    pub indexed_count: i64,
    pub completed_at: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRebuildProgress {
    pub phase: String,
    pub processed_count: usize,
    pub total_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Open,
    InProgress,
    Done,
    Cancelled,
}

impl TaskStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::InProgress => "in_progress",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Urgent,
}

impl TaskPriority {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Normal => "normal",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description_json: Option<Value>,
    pub description_text: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub journal_id: Option<String>,
    pub knowledge_item_id: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSaveCommand {
    pub task: Task,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCompleteCommand {
    pub task_id: String,
    pub completed_at: String,
    pub expected_revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskListQuery {
    pub status: Option<Vec<TaskStatus>>,
    pub due_from: Option<String>,
    pub due_to: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeKind {
    Note,
    Issue,
    Solution,
    Decision,
    Reference,
}

impl KnowledgeKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Issue => "issue",
            Self::Solution => "solution",
            Self::Decision => "decision",
            Self::Reference => "reference",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeStatus {
    Active,
    Archived,
}

impl KnowledgeStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeItem {
    pub id: String,
    pub kind: KnowledgeKind,
    pub status: KnowledgeStatus,
    pub title: String,
    pub content_json: Value,
    pub content_markdown: String,
    pub content_plain_text: String,
    pub editor_schema_version: i64,
    pub content_hash: Option<String>,
    pub projection_version: i64,
    pub summary: String,
    pub revision: i64,
    pub source_journal_id: Option<String>,
    pub source_block_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeListQuery {
    pub kind: Option<KnowledgeKind>,
    pub status: Option<KnowledgeStatus>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSaveCommand {
    pub item: KnowledgeItem,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineCalendarQuery {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineListQuery {
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineDaySummary {
    pub date: String,
    pub journal_id: Option<String>,
    pub journal_count: i64,
    pub task_due_count: i64,
    pub title: String,
    pub excerpt: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsPeriodQuery {
    pub start: String,
    pub end: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsJournalSource {
    pub id: String,
    pub journal_date: String,
    pub title: String,
    pub content_plain_text: String,
    pub tags: Vec<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsTaskSource {
    pub id: String,
    pub status: TaskStatus,
    pub completed_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsKnowledgeSource {
    pub id: String,
    pub kind: KnowledgeKind,
    pub title: String,
    pub created_at: String,
    pub tags: Vec<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSource {
    pub journals: Vec<AnalyticsJournalSource>,
    pub tasks: Vec<AnalyticsTaskSource>,
    pub knowledge: Vec<AnalyticsKnowledgeSource>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportPeriodType {
    Week,
    Month,
    Year,
}

impl ReportPeriodType {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Week => "week",
            Self::Month => "month",
            Self::Year => "year",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportGenerator {
    Local,
    AiAssisted,
}

impl ReportGenerator {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::AiAssisted => "ai_assisted",
        }
    }

    pub(crate) fn from_database(value: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_value(Value::String(value.to_owned()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: String,
    pub period_type: ReportPeriodType,
    pub period_start: String,
    pub period_end: String,
    pub timezone: String,
    pub title: String,
    pub content_json: Value,
    pub editor_schema_version: i64,
    pub content_markdown: String,
    pub content_plain_text: String,
    pub projection_version: i64,
    pub stats_json: String,
    pub generated_by: ReportGenerator,
    pub source_watermark: Option<String>,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPeriodQuery {
    pub period_type: ReportPeriodType,
    pub period_start: String,
    pub period_end: String,
    pub timezone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSaveCommand {
    pub report: Report,
    pub expected_revision: Option<i64>,
}
