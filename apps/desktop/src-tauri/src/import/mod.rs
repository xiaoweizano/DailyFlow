use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScanCandidate {
    pub relative_path: String,
    pub file_name: String,
    pub byte_size: Option<u64>,
    pub last_modified_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportScanResult {
    pub root_label: String,
    pub candidates: Vec<ImportScanCandidate>,
    pub ignored_entry_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTxtFile {
    pub relative_path: String,
    pub file_name: String,
    pub bytes_base64: String,
    pub byte_size: u64,
    pub last_modified_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceError {
    pub code: String,
    pub message: String,
}

impl ImportSourceError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
        }
    }
}

pub fn scan_txt_files(root_path: &Path) -> Result<ImportScanResult, ImportSourceError> {
    let root = canonical_directory(root_path)?;
    let root_label = root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map_or_else(|| root.to_string_lossy().into_owned(), str::to_owned);
    let mut scan = DirectoryScan {
        root: &root,
        candidates: Vec::new(),
        ignored_entry_count: 0,
    };
    scan.visit_directory(&root)?;
    scan.candidates.sort_by(|left, right| {
        left.relative_path
            .to_lowercase()
            .cmp(&right.relative_path.to_lowercase())
    });

    Ok(ImportScanResult {
        root_label,
        candidates: scan.candidates,
        ignored_entry_count: scan.ignored_entry_count,
    })
}

pub fn read_txt_file(
    root_path: &Path,
    relative_path: &str,
) -> Result<ImportTxtFile, ImportSourceError> {
    let root = canonical_directory(root_path)?;
    let file_path = secure_file_path(&root, relative_path)?;
    let metadata = fs::metadata(&file_path).map_err(|error| {
        ImportSourceError::new(
            "FILE_READ_FAILED",
            format!("Failed to read TXT metadata for {relative_path}: {error}"),
        )
    })?;
    if !metadata.is_file() {
        return Err(ImportSourceError::new(
            "FILE_READ_FAILED",
            format!("Import path is not a regular file: {relative_path}"),
        ));
    }

    let bytes = fs::read(&file_path).map_err(|error| {
        ImportSourceError::new(
            "FILE_READ_FAILED",
            format!("Failed to read TXT file {relative_path}: {error}"),
        )
    })?;
    let file_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            ImportSourceError::new(
                "FILE_READ_FAILED",
                format!("TXT file name is not valid UTF-8: {relative_path}"),
            )
        })?
        .to_owned();

    Ok(ImportTxtFile {
        relative_path: relative_path.to_owned(),
        file_name,
        bytes_base64: STANDARD.encode(bytes),
        byte_size: metadata.len(),
        last_modified_ms: metadata.modified().ok().and_then(system_time_ms),
    })
}

struct DirectoryScan<'a> {
    root: &'a Path,
    candidates: Vec<ImportScanCandidate>,
    ignored_entry_count: usize,
}

impl DirectoryScan<'_> {
    fn visit_directory(&mut self, directory: &Path) -> Result<(), ImportSourceError> {
        let entries = fs::read_dir(directory).map_err(|error| {
            ImportSourceError::new(
                "IMPORT_ROOT_INVALID",
                format!("Failed to scan directory {}: {error}", directory.display()),
            )
        })?;

        for entry_result in entries {
            let entry = match entry_result {
                Ok(entry) => entry,
                Err(_) => {
                    self.ignored_entry_count += 1;
                    continue;
                }
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
                    self.ignored_entry_count += 1;
                    continue;
                }
            };

            if file_type.is_symlink() {
                self.ignored_entry_count += 1;
            } else if file_type.is_dir() {
                self.visit_directory(&entry.path())?;
            } else if file_type.is_file() && is_txt_path(&entry.path()) {
                self.push_candidate(entry.path())?;
            } else {
                self.ignored_entry_count += 1;
            }
        }

        Ok(())
    }

    fn push_candidate(&mut self, path: PathBuf) -> Result<(), ImportSourceError> {
        let Ok(relative_path) = path.strip_prefix(self.root) else {
            self.ignored_entry_count += 1;
            return Ok(());
        };
        let relative_path = logical_relative_path(relative_path).ok_or_else(|| {
            ImportSourceError::new(
                "FILE_PATH_INVALID",
                "A TXT file path could not be represented as relative UTF-8",
            )
        })?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                ImportSourceError::new(
                    "FILE_PATH_INVALID",
                    "A TXT file name could not be represented as UTF-8",
                )
            })?
            .to_owned();
        let metadata = fs::metadata(&path).ok();

        self.candidates.push(ImportScanCandidate {
            relative_path,
            file_name,
            byte_size: metadata.as_ref().map(fs::Metadata::len),
            last_modified_ms: metadata
                .as_ref()
                .and_then(|value| value.modified().ok())
                .and_then(system_time_ms),
        });
        Ok(())
    }
}

fn canonical_directory(root_path: &Path) -> Result<PathBuf, ImportSourceError> {
    let root = fs::canonicalize(root_path).map_err(|error| {
        ImportSourceError::new(
            "IMPORT_ROOT_INVALID",
            format!(
                "Failed to open import root {}: {error}",
                root_path.display()
            ),
        )
    })?;
    if !root.is_dir() {
        return Err(ImportSourceError::new(
            "IMPORT_ROOT_INVALID",
            "Import root must be a directory",
        ));
    }
    Ok(root)
}

fn secure_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, ImportSourceError> {
    let segments = validated_relative_segments(relative_path)?;
    let mut current = root.to_path_buf();

    for (index, segment) in segments.iter().enumerate() {
        current.push(segment);
        let metadata = fs::symlink_metadata(&current).map_err(|error| {
            ImportSourceError::new(
                "FILE_READ_FAILED",
                format!("Failed to inspect import path {relative_path}: {error}"),
            )
        })?;
        if metadata.file_type().is_symlink() {
            return Err(ImportSourceError::new(
                "SYMLINK_REJECTED",
                format!("Symbolic links are not allowed in import paths: {relative_path}"),
            ));
        }
        let is_last = index + 1 == segments.len();
        if !is_last && !metadata.is_dir() {
            return Err(ImportSourceError::new(
                "FILE_READ_FAILED",
                format!("Import path contains a non-directory segment: {relative_path}"),
            ));
        }
    }

    let canonical_file = fs::canonicalize(&current).map_err(|error| {
        ImportSourceError::new(
            "FILE_READ_FAILED",
            format!("Failed to resolve TXT file {relative_path}: {error}"),
        )
    })?;
    if !canonical_file.starts_with(root) {
        return Err(ImportSourceError::new(
            "PATH_TRAVERSAL_REJECTED",
            "Import file resolved outside the selected root",
        ));
    }
    if !is_txt_path(&canonical_file) {
        return Err(ImportSourceError::new(
            "FILE_TYPE_UNSUPPORTED",
            "Only .txt files can be imported",
        ));
    }
    Ok(canonical_file)
}

fn validated_relative_segments(relative_path: &str) -> Result<Vec<String>, ImportSourceError> {
    if relative_path.is_empty() || relative_path.contains('\0') {
        return Err(ImportSourceError::new(
            "PATH_TRAVERSAL_REJECTED",
            "Import path must be a non-empty relative path",
        ));
    }
    let drive_prefixed = relative_path
        .as_bytes()
        .get(1)
        .is_some_and(|value| *value == b':')
        && relative_path
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic);
    if relative_path.starts_with('/') || relative_path.starts_with('\\') || drive_prefixed {
        return Err(ImportSourceError::new(
            "PATH_TRAVERSAL_REJECTED",
            "Import path must be relative to the selected root",
        ));
    }

    let segments = relative_path
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty() && *segment != ".")
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if segments.is_empty() || segments.iter().any(|segment| segment == "..") {
        return Err(ImportSourceError::new(
            "PATH_TRAVERSAL_REJECTED",
            "Import path contains traversal segments",
        ));
    }
    Ok(segments)
}

fn logical_relative_path(path: &Path) -> Option<String> {
    let segments = path
        .components()
        .map(|component| match component {
            Component::Normal(value) => value.to_str().map(str::to_owned),
            Component::CurDir => Some(String::new()),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => None,
        })
        .collect::<Option<Vec<_>>>()?;

    let logical = segments
        .into_iter()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    (!logical.is_empty()).then_some(logical)
}

fn is_txt_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("txt"))
}

fn system_time_ms(value: std::time::SystemTime) -> Option<u64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{read_txt_file, scan_txt_files};

    #[test]
    fn scans_txt_files_recursively_with_logical_paths_and_stable_order() {
        let root = tempdir().expect("temporary root");
        fs::create_dir_all(root.path().join("202504").join("nested")).expect("create directories");
        fs::write(root.path().join("202504").join("20250402.txt"), "second")
            .expect("write second file");
        fs::write(
            root.path()
                .join("202504")
                .join("nested")
                .join("20250401.TXT"),
            "first",
        )
        .expect("write first file");
        fs::write(root.path().join("202504").join("ignore.md"), "ignored")
            .expect("write ignored file");

        let scan = scan_txt_files(root.path()).expect("scan TXT files");

        assert_eq!(
            scan.candidates
                .iter()
                .map(|candidate| candidate.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["202504/20250402.txt", "202504/nested/20250401.TXT"]
        );
        assert_eq!(scan.ignored_entry_count, 1);
    }

    #[test]
    fn reads_a_txt_file_through_a_validated_relative_path() {
        let root = tempdir().expect("temporary root");
        fs::create_dir_all(root.path().join("202504")).expect("create directory");
        fs::write(root.path().join("202504").join("20250401.txt"), "日志")
            .expect("write source file");

        let file =
            read_txt_file(root.path(), "202504/20250401.txt").expect("read TXT through root");

        assert_eq!(file.relative_path, "202504/20250401.txt");
        assert_eq!(file.byte_size, 6);
        assert_eq!(file.bytes_base64, "5pel5b+X");
    }

    #[test]
    fn rejects_parent_and_absolute_import_paths() {
        let root = tempdir().expect("temporary root");
        for path in [
            "../outside.txt",
            "202504/../../outside.txt",
            "/absolute.txt",
            "C:\\logs\\file.txt",
            "\\\\server\\share\\file.txt",
        ] {
            let error = read_txt_file(root.path(), path).expect_err("path must be rejected");
            assert!(
                error.code == "PATH_TRAVERSAL_REJECTED",
                "unexpected error for {path}: {error:?}"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn skips_symbolic_links_during_scanning_and_rejects_them_when_reading() {
        use std::os::unix::fs::symlink;

        let root = tempdir().expect("temporary root");
        let outside = tempdir().expect("outside directory");
        fs::write(outside.path().join("outside.txt"), "outside").expect("write outside file");
        symlink(outside.path(), root.path().join("escape")).expect("create escaping symlink");

        let scan = scan_txt_files(root.path()).expect("scan files");

        assert!(scan.candidates.is_empty());
        assert_eq!(scan.ignored_entry_count, 1);
        expect_error_code(
            read_txt_file(root.path(), "escape/outside.txt"),
            "SYMLINK_REJECTED",
        );
    }

    #[cfg(unix)]
    fn expect_error_code(
        result: Result<super::ImportTxtFile, super::ImportSourceError>,
        expected: &str,
    ) {
        assert_eq!(result.expect_err("operation must fail").code, expected);
    }
}
