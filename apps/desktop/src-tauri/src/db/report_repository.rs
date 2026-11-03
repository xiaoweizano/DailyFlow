use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use super::{
    models::{Report, ReportGenerator, ReportPeriodQuery, ReportPeriodType, ReportSaveCommand},
    StorageError,
};

fn report_select() -> &'static str {
    "SELECT id, period_type, period_start, period_end, timezone, title, content_json,
            editor_schema_version, content_markdown, content_plain_text, projection_version,
            stats_json, generated_by, source_watermark, revision, created_at, updated_at,
            deleted_at
     FROM reports"
}

fn report_from_row(row: &Row<'_>) -> rusqlite::Result<Report> {
    let content_json = row.get::<_, String>(6)?;
    let period_type = row.get::<_, String>(1)?;
    let generated_by = row.get::<_, String>(12)?;

    Ok(Report {
        id: row.get(0)?,
        period_type: ReportPeriodType::from_database(&period_type).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        period_start: row.get(2)?,
        period_end: row.get(3)?,
        timezone: row.get(4)?,
        title: row.get(5)?,
        content_json: serde_json::from_str(&content_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        editor_schema_version: row.get(7)?,
        content_markdown: row.get(8)?,
        content_plain_text: row.get(9)?,
        projection_version: row.get(10)?,
        stats_json: row.get(11)?,
        generated_by: ReportGenerator::from_database(&generated_by).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                12,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        source_watermark: row.get(13)?,
        revision: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        deleted_at: row.get(17)?,
    })
}

fn is_valid_id(value: &str) -> bool {
    value.len() == 36 && Uuid::parse_str(value).is_ok()
}

fn is_valid_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }

    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap_year => 29,
        2 => 28,
        _ => return false,
    };
    (1..=days_in_month).contains(&day)
}

fn validate_period(
    period_type: ReportPeriodType,
    period_start: &str,
    period_end: &str,
    timezone: &str,
) -> Result<(), StorageError> {
    let _ = period_type;
    if !is_valid_date(period_start) || !is_valid_date(period_end) {
        return Err(StorageError::validation(
            "report period must use valid YYYY-MM-DD dates",
        ));
    }
    if period_start > period_end {
        return Err(StorageError::validation(
            "report period start must be on or before its end",
        ));
    }
    if timezone.trim().is_empty() {
        return Err(StorageError::validation(
            "report timezone must not be blank",
        ));
    }
    Ok(())
}

fn validate_report(report: &Report) -> Result<(), StorageError> {
    if !is_valid_id(&report.id) {
        return Err(StorageError::validation("report id must be a UUID"));
    }
    validate_period(
        report.period_type,
        &report.period_start,
        &report.period_end,
        &report.timezone,
    )?;
    if report.title.trim().is_empty() || report.title.chars().count() > 500 {
        return Err(StorageError::validation(
            "report title must contain between 1 and 500 characters",
        ));
    }
    if !report.content_json.is_object() {
        return Err(StorageError::validation(
            "report contentJson must be a JSON object",
        ));
    }
    if !serde_json::from_str::<serde_json::Value>(&report.stats_json)
        .is_ok_and(|value| value.is_object())
    {
        return Err(StorageError::validation(
            "report statsJson must be a JSON object",
        ));
    }
    if report.editor_schema_version < 1 || report.projection_version < 1 {
        return Err(StorageError::validation(
            "report schema and projection versions must be positive",
        ));
    }
    Ok(())
}

fn get_by_id(connection: &Connection, report_id: &str) -> Result<Option<Report>, StorageError> {
    connection
        .query_row(
            &format!("{} WHERE id = ?1 AND deleted_at IS NULL", report_select()),
            [report_id],
            report_from_row,
        )
        .optional()
        .map_err(StorageError::from)
}

pub fn get_by_period(
    connection: &Connection,
    query: &ReportPeriodQuery,
) -> Result<Option<Report>, StorageError> {
    validate_period(
        query.period_type,
        &query.period_start,
        &query.period_end,
        &query.timezone,
    )?;
    connection
        .query_row(
            &format!(
                "{} WHERE period_type = ?1 AND period_start = ?2 AND period_end = ?3
                   AND timezone = ?4 AND deleted_at IS NULL",
                report_select()
            ),
            params![
                query.period_type.as_str(),
                query.period_start,
                query.period_end,
                query.timezone
            ],
            report_from_row,
        )
        .optional()
        .map_err(StorageError::from)
}

pub fn save(
    connection: &mut Connection,
    command: &ReportSaveCommand,
) -> Result<Report, StorageError> {
    validate_report(&command.report)?;
    if command
        .expected_revision
        .is_some_and(|revision| revision < 1)
    {
        return Err(StorageError::validation(
            "expectedRevision must be positive",
        ));
    }

    let transaction = connection.transaction()?;
    let existing = transaction
        .query_row(
            "SELECT revision, created_at, deleted_at FROM reports WHERE id = ?1",
            [&command.report.id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?;

    match command.expected_revision {
        None => {
            if existing
                .as_ref()
                .is_some_and(|(_, _, deleted_at)| deleted_at.is_none())
            {
                return Err(StorageError::conflict("report already exists"));
            }
        }
        Some(expected_revision) => match &existing {
            None => return Err(StorageError::not_found("report does not exist")),
            Some((_, _, deleted_at)) if deleted_at.is_some() => {
                return Err(StorageError::not_found("report does not exist"));
            }
            Some((revision, _, _)) if *revision != expected_revision => {
                return Err(StorageError::conflict(format!(
                    "report revision conflict: expected {expected_revision}, found {revision}"
                )));
            }
            Some(_) => {}
        },
    }

    let period_owner = transaction
        .query_row(
            "SELECT id
             FROM reports
             WHERE period_type = ?1
               AND period_start = ?2
               AND period_end = ?3
               AND timezone = ?4
               AND id <> ?5
               AND deleted_at IS NULL",
            params![
                command.report.period_type.as_str(),
                command.report.period_start,
                command.report.period_end,
                command.report.timezone,
                command.report.id
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(owner) = period_owner {
        return Err(StorageError::conflict(format!(
            "report already exists for this period: {owner}"
        )));
    }

    let revision = existing
        .as_ref()
        .map_or(1, |(revision, _, _)| revision.saturating_add(1));
    let created_at = existing.as_ref().map_or_else(
        || command.report.created_at.clone(),
        |(_, created_at, _)| created_at.clone(),
    );
    let content_json = serde_json::to_string(&command.report.content_json)?;
    transaction.execute(
        "INSERT INTO reports (
           id, period_type, period_start, period_end, timezone, title, content_json,
           content_markdown, content_plain_text, editor_schema_version, projection_version,
           stats_json, generated_by, source_watermark, revision, created_at, updated_at,
           deleted_at
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, NULL
         )
         ON CONFLICT(id) DO UPDATE SET
           period_type = excluded.period_type,
           period_start = excluded.period_start,
           period_end = excluded.period_end,
           timezone = excluded.timezone,
           title = excluded.title,
           content_json = excluded.content_json,
           content_markdown = excluded.content_markdown,
           content_plain_text = excluded.content_plain_text,
           editor_schema_version = excluded.editor_schema_version,
           projection_version = excluded.projection_version,
           stats_json = excluded.stats_json,
           generated_by = excluded.generated_by,
           source_watermark = excluded.source_watermark,
           revision = excluded.revision,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = NULL",
        params![
            command.report.id,
            command.report.period_type.as_str(),
            command.report.period_start,
            command.report.period_end,
            command.report.timezone,
            command.report.title,
            content_json,
            command.report.content_markdown,
            command.report.content_plain_text,
            command.report.editor_schema_version,
            command.report.projection_version,
            command.report.stats_json,
            command.report.generated_by.as_str(),
            command.report.source_watermark,
            revision,
            created_at,
            command.report.updated_at,
        ],
    )?;
    transaction.commit()?;

    get_by_id(connection, &command.report.id)?
        .ok_or_else(|| StorageError::storage("saved report cannot be read back"))
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;
    use serde_json::json;

    use crate::db::{
        migrations,
        models::{Report, ReportGenerator, ReportPeriodQuery, ReportPeriodType, ReportSaveCommand},
        StorageErrorCode,
    };

    use super::{get_by_period, save};

    const REPORT_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c40";
    const OTHER_REPORT_ID: &str = "0198e2f4-7e33-7c70-a8b2-18c1520f9c41";
    const CREATED_AT: &str = "2026-10-31T03:20:11.123Z";
    const UPDATED_AT: &str = "2026-10-31T04:20:11.123Z";

    fn connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        migrations::run(&mut connection).expect("run migrations");
        connection
    }

    fn report(id: &str, title: &str) -> Report {
        Report {
            id: id.to_owned(),
            period_type: ReportPeriodType::Month,
            period_start: "2026-10-01".to_owned(),
            period_end: "2026-10-31".to_owned(),
            timezone: "Asia/Shanghai".to_owned(),
            title: title.to_owned(),
            content_json: json!({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "本月完成离线导入。" }]
                }]
            }),
            editor_schema_version: 1,
            content_markdown: "本月完成离线导入。\n".to_owned(),
            content_plain_text: "本月完成离线导入。\n".to_owned(),
            projection_version: 1,
            stats_json: "{\"journalCount\":1}".to_owned(),
            generated_by: ReportGenerator::Local,
            source_watermark: None,
            revision: 0,
            created_at: CREATED_AT.to_owned(),
            updated_at: CREATED_AT.to_owned(),
            deleted_at: None,
        }
    }

    fn period_query() -> ReportPeriodQuery {
        ReportPeriodQuery {
            period_type: ReportPeriodType::Month,
            period_start: "2026-10-01".to_owned(),
            period_end: "2026-10-31".to_owned(),
            timezone: "Asia/Shanghai".to_owned(),
        }
    }

    #[test]
    fn creates_reads_and_updates_reports_with_revision_checks() {
        let mut connection = connection();
        let created = save(
            &mut connection,
            &ReportSaveCommand {
                report: report(REPORT_ID, "2026 年 10 月月报"),
                expected_revision: None,
            },
        )
        .expect("create report");
        assert_eq!(created.revision, 1);
        assert_eq!(created.created_at, CREATED_AT);

        let found = get_by_period(&connection, &period_query())
            .expect("read report")
            .expect("report exists");
        assert_eq!(found.id, REPORT_ID);
        assert_eq!(found.title, "2026 年 10 月月报");

        let mut edited = found.clone();
        edited.title = "2026 年 10 月工作月报".to_owned();
        edited.updated_at = UPDATED_AT.to_owned();
        let updated = save(
            &mut connection,
            &ReportSaveCommand {
                report: edited,
                expected_revision: Some(1),
            },
        )
        .expect("update report");
        assert_eq!(updated.revision, 2);
        assert_eq!(updated.created_at, CREATED_AT);
        assert_eq!(updated.updated_at, UPDATED_AT);

        let stale = save(
            &mut connection,
            &ReportSaveCommand {
                report: found,
                expected_revision: Some(1),
            },
        )
        .expect_err("stale revision must conflict");
        assert_eq!(stale.code, StorageErrorCode::Conflict);
    }

    #[test]
    fn rejects_a_second_active_report_for_the_same_period() {
        let mut connection = connection();
        save(
            &mut connection,
            &ReportSaveCommand {
                report: report(REPORT_ID, "第一份月报"),
                expected_revision: None,
            },
        )
        .expect("create first report");

        let duplicate = save(
            &mut connection,
            &ReportSaveCommand {
                report: report(OTHER_REPORT_ID, "重复月报"),
                expected_revision: None,
            },
        )
        .expect_err("same period must be unique");
        assert_eq!(duplicate.code, StorageErrorCode::Conflict);
    }

    #[test]
    fn rejects_invalid_report_fields() {
        let mut connection = connection();
        let mut invalid = report(REPORT_ID, "月报");
        invalid.period_end = "2026-09-01".to_owned();
        let reversed = save(
            &mut connection,
            &ReportSaveCommand {
                report: invalid,
                expected_revision: None,
            },
        )
        .expect_err("reversed period must fail");
        assert_eq!(reversed.code, StorageErrorCode::ValidationError);

        let mut invalid = report(REPORT_ID, " ");
        invalid.stats_json = "not-json".to_owned();
        let invalid_fields = save(
            &mut connection,
            &ReportSaveCommand {
                report: invalid,
                expected_revision: None,
            },
        )
        .expect_err("invalid fields must fail");
        assert_eq!(invalid_fields.code, StorageErrorCode::ValidationError);
    }
}
