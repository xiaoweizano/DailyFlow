use std::fs;
use std::path::{Path, PathBuf};

use dailyflow_desktop::storage_location::{migrate_data_dir, StorageLocationConfig};
use rusqlite::Connection;
use tempfile::TempDir;

struct StorageFixture {
    root: TempDir,
    source: PathBuf,
    destination: PathBuf,
    config_path: PathBuf,
}

impl StorageFixture {
    fn new() -> Self {
        let root = tempfile::tempdir().expect("temporary storage root");
        let source = root.path().join("default-data");
        let destination = root.path().join("selected-data");
        let config_path = root.path().join("config/data-location.json");
        fs::create_dir_all(source.join("attachments/.tmp")).expect("source fixture");
        create_valid_database(&source.join("dailyflow.db"));
        fs::write(source.join("attachments/example.txt"), b"attachment")
            .expect("attachment fixture");
        StorageLocationConfig::write(&config_path, &source).expect("write location config");
        Self {
            root,
            source,
            destination,
            config_path,
        }
    }

    fn database_path(&self) -> PathBuf {
        self.source.join("dailyflow.db")
    }

    fn configured_location(&self) -> PathBuf {
        StorageLocationConfig::read(&self.config_path)
            .expect("read location config")
            .unwrap_or_else(|| self.root.path().join("default-data"))
    }

    fn migrate_to_with_corrupt_copy(&self) -> Result<(), String> {
        fs::write(self.database_path(), b"not a sqlite database").expect("corrupt database");
        migrate_data_dir(&self.source, &self.destination)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

fn create_valid_database(path: &Path) {
    let connection = Connection::open(path).expect("open fixture database");
    connection
        .execute_batch(
            "CREATE TABLE journals (id TEXT PRIMARY KEY, title TEXT NOT NULL);
             INSERT INTO journals (id, title) VALUES ('fixture', 'Preserved journal');",
        )
        .expect("create fixture schema");
}

#[test]
fn storage_location_migration_keeps_the_original_database_when_validation_fails() {
    let fixture = StorageFixture::new();
    let original = fixture.database_path();
    let result = fixture.migrate_to_with_corrupt_copy();
    assert!(result.is_err());
    assert_eq!(fixture.configured_location(), original.parent().unwrap());
    assert!(original.exists());
}
