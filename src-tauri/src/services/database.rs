use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;
use tracing::info;

pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Enable WAL mode and foreign keys
    sqlx::query("PRAGMA journal_mode=WAL")
        .execute(&pool)
        .await?;
    sqlx::query("PRAGMA foreign_keys=ON")
        .execute(&pool)
        .await?;

    // Run migrations
    run_migrations(&pool).await?;

    info!("Database initialized at {}", db_path.display());
    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    // Check if _meta table exists
    let has_meta: (i64,) = sqlx::query_as(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='_meta'",
    )
    .fetch_one(pool)
    .await?;

    if has_meta.0 == 0 {
        info!("Running initial database migration");
        let migration_sql = include_str!("../../migrations/001_init.sql");

        // Strip comment lines, then split by semicolons
        let cleaned: String = migration_sql
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                !trimmed.starts_with("--") && !trimmed.is_empty()
            })
            .collect::<Vec<_>>()
            .join("\n");

        for statement in cleaned.split(';') {
            let stmt = statement.trim();
            if stmt.is_empty() {
                continue;
            }
            sqlx::query(stmt).execute(pool).await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_init_pool_creates_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();

        // Verify tables exist
        let tables: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        let names: Vec<&str> = tables.iter().map(|t| t.0.as_str()).collect();
        assert!(names.contains(&"projects"));
        assert!(names.contains(&"workspace_state"));
        assert!(names.contains(&"terminals"));
        assert!(names.contains(&"agents"));
        assert!(names.contains(&"agent_events"));
        assert!(names.contains(&"_meta"));
    }

    #[tokio::test]
    async fn test_idempotent_migration() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        // Run init twice — should not fail
        let pool1 = init_pool(&db_path).await.unwrap();
        pool1.close().await;

        let pool2 = init_pool(&db_path).await.unwrap();
        let version: (String,) =
            sqlx::query_as("SELECT value FROM _meta WHERE key='schema_version'")
                .fetch_one(&pool2)
                .await
                .unwrap();
        assert_eq!(version.0, "1");
    }
}
