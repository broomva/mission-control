use std::fs;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use sqlx::sqlite::SqlitePool;
use tracing::{info, warn};

use crate::models::{AgentEvent, AgentInfo, AppError, Project, TerminalInfo, TokenUsage, WorkspaceState};

/// Runs an async block on the current tokio runtime.
///
/// Uses `block_in_place` when called from within a tokio runtime (which is
/// the common case inside Tauri commands), otherwise falls back to creating
/// a new current-thread runtime.
fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        tokio::task::block_in_place(|| handle.block_on(fut))
    } else {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build fallback runtime")
            .block_on(fut)
    }
}

pub struct PersistenceService {
    base_dir: PathBuf,
    pool: SqlitePool,
}

impl PersistenceService {
    /// Create a new PersistenceService backed by SQLite.
    ///
    /// The database file lives at `~/.mission-control/mission-control.db`.
    /// On first run, any existing JSON data is migrated automatically.
    pub fn new() -> Self {
        let base_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".mission-control");
        fs::create_dir_all(&base_dir).ok();
        fs::create_dir_all(base_dir.join("terminals")).ok();

        let db_path = base_dir.join("mission-control.db");
        let pool = block_on(crate::services::database::init_pool(&db_path))
            .expect("failed to initialize database");

        info!(path = %base_dir.display(), "persistence directory initialized (SQLite)");

        let svc = Self { base_dir, pool };

        // Auto-migrate legacy JSON data on first run
        svc.migrate_json_data();

        svc
    }

    #[cfg(test)]
    pub fn with_base_dir(base_dir: PathBuf) -> Self {
        fs::create_dir_all(&base_dir).ok();
        fs::create_dir_all(base_dir.join("terminals")).ok();

        let db_path = base_dir.join("mission-control.db");
        let pool = block_on(crate::services::database::init_pool(&db_path))
            .expect("failed to initialize test database");

        Self { base_dir, pool }
    }

    pub fn db_pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub fn scrollback_path(&self, terminal_id: &str) -> PathBuf {
        self.base_dir
            .join("terminals")
            .join(format!("{}.scrollback", terminal_id))
    }

    // ── JSON migration ──────────────────────────────────────────────────

    fn migrate_json_data(&self) {
        self.migrate_projects_json();
        self.migrate_workspace_state_json();
        self.migrate_terminals_json();
    }

    fn migrate_projects_json(&self) {
        let path = self.base_dir.join("projects.json");
        if !path.exists() {
            return;
        }

        // Only migrate if the DB table is empty
        let count: (i64,) = block_on(
            sqlx::query_as("SELECT count(*) FROM projects").fetch_one(&self.pool),
        )
        .unwrap_or((0,));

        if count.0 > 0 {
            info!("projects table already populated, skipping JSON migration");
            return;
        }

        match fs::read_to_string(&path) {
            Ok(data) => {
                if let Ok(projects) = serde_json::from_str::<Vec<Project>>(&data) {
                    for p in &projects {
                        let res = block_on(
                            sqlx::query(
                                "INSERT OR IGNORE INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)",
                            )
                            .bind(&p.id)
                            .bind(&p.name)
                            .bind(&p.path)
                            .bind(&p.created_at)
                            .execute(&self.pool),
                        );
                        if let Err(e) = res {
                            warn!(error = %e, "failed to migrate project");
                        }
                    }
                    info!(count = projects.len(), "migrated projects from JSON to SQLite");
                    // Rename the old file so we don't re-migrate
                    let _ = fs::rename(&path, path.with_extension("json.bak"));
                }
            }
            Err(e) => warn!(error = %e, "could not read projects.json for migration"),
        }
    }

    fn migrate_workspace_state_json(&self) {
        let path = self.base_dir.join("state.json");
        if !path.exists() {
            return;
        }

        match fs::read_to_string(&path) {
            Ok(data) => {
                if let Ok(state) = serde_json::from_str::<WorkspaceState>(&data) {
                    let res = block_on(
                        sqlx::query(
                            "UPDATE workspace_state SET layout = ?, active_project_id = ? WHERE id = 1",
                        )
                        .bind(&state.layout)
                        .bind(&state.active_project_id)
                        .execute(&self.pool),
                    );
                    if let Err(e) = res {
                        warn!(error = %e, "failed to migrate workspace state");
                    } else {
                        info!("migrated workspace state from JSON to SQLite");
                        let _ = fs::rename(&path, path.with_extension("json.bak"));
                    }
                }
            }
            Err(e) => warn!(error = %e, "could not read state.json for migration"),
        }
    }

    fn migrate_terminals_json(&self) {
        let path = self.base_dir.join("terminals.json");
        if !path.exists() {
            return;
        }

        let count: (i64,) = block_on(
            sqlx::query_as("SELECT count(*) FROM terminals").fetch_one(&self.pool),
        )
        .unwrap_or((0,));

        if count.0 > 0 {
            info!("terminals table already populated, skipping JSON migration");
            return;
        }

        match fs::read_to_string(&path) {
            Ok(data) => {
                if let Ok(terminals) = serde_json::from_str::<Vec<TerminalInfo>>(&data) {
                    for t in &terminals {
                        let res = block_on(
                            sqlx::query(
                                "INSERT OR IGNORE INTO terminals \
                                 (id, project_id, title, cols, rows, cwd, created_at, status, scrollback_path) \
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            )
                            .bind(&t.id)
                            .bind(&t.project_id)
                            .bind(&t.title)
                            .bind(t.cols as i64)
                            .bind(t.rows as i64)
                            .bind(&t.cwd)
                            .bind(&t.created_at)
                            .bind(&t.status)
                            .bind(&t.scrollback_path)
                            .execute(&self.pool),
                        );
                        if let Err(e) = res {
                            warn!(error = %e, "failed to migrate terminal");
                        }
                    }
                    info!(count = terminals.len(), "migrated terminals from JSON to SQLite");
                    let _ = fs::rename(&path, path.with_extension("json.bak"));
                }
            }
            Err(e) => warn!(error = %e, "could not read terminals.json for migration"),
        }
    }

    // ── Projects ────────────────────────────────────────────────────────

    pub fn load_projects(&self) -> Vec<Project> {
        let rows: Result<Vec<(String, String, String, String)>, _> = block_on(
            sqlx::query_as("SELECT id, name, path, created_at FROM projects ORDER BY created_at")
                .fetch_all(&self.pool),
        );

        match rows {
            Ok(rows) => {
                info!(count = rows.len(), "loaded projects from database");
                rows.into_iter()
                    .map(|(id, name, path, created_at)| Project {
                        id,
                        name,
                        path,
                        created_at,
                    })
                    .collect()
            }
            Err(e) => {
                warn!(error = %e, "failed to load projects from database");
                Vec::new()
            }
        }
    }

    pub fn save_projects(&self, projects: &[Project]) -> Result<(), AppError> {
        block_on(async {
            // Use a transaction: delete all then re-insert
            let mut tx = self
                .pool
                .begin()
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            sqlx::query("DELETE FROM projects")
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            for p in projects {
                sqlx::query(
                    "INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)",
                )
                .bind(&p.id)
                .bind(&p.name)
                .bind(&p.path)
                .bind(&p.created_at)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;
            }

            tx.commit()
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            info!(count = projects.len(), "saved projects to database");
            Ok(())
        })
    }

    // ── Workspace State ─────────────────────────────────────────────────

    pub fn load_workspace_state(&self) -> WorkspaceState {
        let row: Result<(Option<String>, Option<String>), _> = block_on(
            sqlx::query_as("SELECT layout, active_project_id FROM workspace_state WHERE id = 1")
                .fetch_one(&self.pool),
        );

        match row {
            Ok((layout, active_project_id)) => {
                info!("loaded workspace state from database");
                WorkspaceState {
                    layout,
                    active_project_id,
                }
            }
            Err(e) => {
                warn!(error = %e, "failed to load workspace state, returning defaults");
                WorkspaceState::default()
            }
        }
    }

    pub fn save_workspace_state(&self, state: &WorkspaceState) -> Result<(), AppError> {
        block_on(
            sqlx::query(
                "UPDATE workspace_state SET layout = ?, active_project_id = ? WHERE id = 1",
            )
            .bind(&state.layout)
            .bind(&state.active_project_id)
            .execute(&self.pool),
        )
        .map_err(|e| AppError::IoError(e.to_string()))?;

        info!("saved workspace state to database");
        Ok(())
    }

    // ── Terminal Sessions ───────────────────────────────────────────────

    pub fn save_terminal_sessions(&self, sessions: &[TerminalInfo]) -> Result<(), AppError> {
        block_on(async {
            let mut tx = self
                .pool
                .begin()
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            sqlx::query("DELETE FROM terminals")
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            for t in sessions {
                sqlx::query(
                    "INSERT INTO terminals \
                     (id, project_id, title, cols, rows, cwd, created_at, status, scrollback_path) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&t.id)
                .bind(&t.project_id)
                .bind(&t.title)
                .bind(t.cols as i64)
                .bind(t.rows as i64)
                .bind(&t.cwd)
                .bind(&t.created_at)
                .bind(&t.status)
                .bind(&t.scrollback_path)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;
            }

            tx.commit()
                .await
                .map_err(|e| AppError::IoError(e.to_string()))?;

            info!(count = sessions.len(), "saved terminal sessions to database");
            Ok(())
        })
    }

    pub fn load_terminal_sessions(&self) -> Vec<TerminalInfo> {
        let rows: Result<Vec<(String, String, String, i64, i64, String, String, String, Option<String>)>, _> = block_on(
            sqlx::query_as(
                "SELECT id, project_id, title, cols, rows, cwd, created_at, status, scrollback_path \
                 FROM terminals ORDER BY created_at",
            )
            .fetch_all(&self.pool),
        );

        match rows {
            Ok(rows) => {
                info!(count = rows.len(), "loaded terminal sessions from database");
                rows.into_iter()
                    .map(|(id, project_id, title, cols, rows, cwd, created_at, status, scrollback_path)| {
                        TerminalInfo {
                            id,
                            project_id,
                            title,
                            cols: cols as u16,
                            rows: rows as u16,
                            cwd,
                            created_at,
                            status,
                            scrollback_path,
                        }
                    })
                    .collect()
            }
            Err(e) => {
                warn!(error = %e, "failed to load terminal sessions from database");
                Vec::new()
            }
        }
    }

    // ── Scrollback (disk-based, paths referenced in DB) ─────────────────

    pub fn load_scrollback(&self, terminal_id: &str) -> Vec<u8> {
        let path = self.scrollback_path(terminal_id);
        match fs::read(&path) {
            Ok(data) => {
                info!(terminal_id = %terminal_id, bytes = data.len(), "loaded scrollback");
                data
            }
            Err(_) => {
                info!(terminal_id = %terminal_id, "no scrollback file found");
                Vec::new()
            }
        }
    }

    pub fn cleanup_terminal(&self, terminal_id: &str) {
        let path = self.scrollback_path(terminal_id);
        if path.exists() {
            if let Err(e) = fs::remove_file(&path) {
                warn!(terminal_id = %terminal_id, error = %e, "failed to remove scrollback file");
            } else {
                info!(terminal_id = %terminal_id, "cleaned up scrollback file");
            }
        }
    }

    pub fn create_scrollback_writer(
        &self,
        terminal_id: &str,
    ) -> Option<Arc<Mutex<BufWriter<fs::File>>>> {
        let path = self.scrollback_path(terminal_id);
        match fs::File::create(&path) {
            Ok(file) => Some(Arc::new(Mutex::new(BufWriter::new(file)))),
            Err(e) => {
                warn!(terminal_id = %terminal_id, error = %e, "failed to create scrollback file");
                None
            }
        }
    }

    /// Update a single terminal's status in the database
    pub fn update_terminal_status(&self, terminal_id: &str, status: &str) {
        let res = block_on(
            sqlx::query("UPDATE terminals SET status = ? WHERE id = ?")
                .bind(status)
                .bind(terminal_id)
                .execute(&self.pool),
        );
        if let Err(e) = res {
            warn!(error = %e, "failed to update terminal status");
        }
    }

    // ── Agents ──────────────────────────────────────────────────────────

    pub fn save_agent(&self, agent: &AgentInfo) -> Result<(), AppError> {
        block_on(
            sqlx::query(
                "INSERT OR REPLACE INTO agents \
                 (id, project_id, agent_type, status, prompt, pid, session_id, started_at, cwd, \
                  input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&agent.id)
            .bind(&agent.project_id)
            .bind(&agent.agent_type)
            .bind(&agent.status)
            .bind(&agent.prompt)
            .bind(agent.pid.map(|p| p as i64))
            .bind(&agent.session_id)
            .bind(&agent.started_at)
            .bind(&agent.cwd)
            .bind(agent.token_usage.input_tokens as i64)
            .bind(agent.token_usage.output_tokens as i64)
            .bind(agent.token_usage.cache_read_tokens as i64)
            .bind(agent.token_usage.cache_creation_tokens as i64)
            .bind(agent.token_usage.cost_usd)
            .execute(&self.pool),
        )
        .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    pub fn load_agents(&self) -> Vec<AgentInfo> {
        type AgentRow = (
            String,  // id
            String,  // project_id
            String,  // agent_type
            String,  // status
            Option<String>,  // prompt
            Option<i64>,     // pid
            Option<String>,  // session_id
            String,  // started_at
            String,  // cwd
            i64,     // input_tokens
            i64,     // output_tokens
            i64,     // cache_read_tokens
            i64,     // cache_creation_tokens
            f64,     // cost_usd
        );

        let rows: Result<Vec<AgentRow>, _> = block_on(
            sqlx::query_as(
                "SELECT id, project_id, agent_type, status, prompt, pid, session_id, \
                 started_at, cwd, input_tokens, output_tokens, cache_read_tokens, \
                 cache_creation_tokens, cost_usd \
                 FROM agents ORDER BY started_at",
            )
            .fetch_all(&self.pool),
        );

        match rows {
            Ok(rows) => rows
                .into_iter()
                .map(|r| AgentInfo {
                    id: r.0,
                    project_id: r.1,
                    agent_type: r.2,
                    status: r.3,
                    prompt: r.4,
                    pid: r.5.map(|p| p as u32),
                    session_id: r.6,
                    started_at: r.7,
                    cwd: r.8,
                    token_usage: TokenUsage {
                        input_tokens: r.9 as u64,
                        output_tokens: r.10 as u64,
                        cache_read_tokens: r.11 as u64,
                        cache_creation_tokens: r.12 as u64,
                        cost_usd: r.13,
                    },
                })
                .collect(),
            Err(e) => {
                warn!(error = %e, "failed to load agents from database");
                Vec::new()
            }
        }
    }

    // ── Agent Events (Timeline) ─────────────────────────────────────────

    pub fn save_agent_event(&self, event: &AgentEvent) -> Result<(), AppError> {
        block_on(
            sqlx::query(
                "INSERT INTO agent_events (agent_id, project_id, timestamp, event_type, summary, detail) \
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&event.agent_id)
            .bind(&event.project_id)
            .bind(&event.timestamp)
            .bind(&event.event_type)
            .bind(&event.summary)
            .bind(&event.detail)
            .execute(&self.pool),
        )
        .map_err(|e| AppError::IoError(e.to_string()))?;

        Ok(())
    }

    pub fn load_agent_events(&self, project_id: &str, offset: i64, limit: i64) -> Vec<AgentEvent> {
        let rows: Result<Vec<(String, String, String, String, String, Option<String>)>, _> = block_on(
            sqlx::query_as(
                "SELECT agent_id, project_id, timestamp, event_type, summary, detail \
                 FROM agent_events WHERE project_id = ? ORDER BY timestamp \
                 LIMIT ? OFFSET ?",
            )
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool),
        );

        match rows {
            Ok(rows) => rows
                .into_iter()
                .map(|(agent_id, project_id, timestamp, event_type, summary, detail)| {
                    AgentEvent {
                        agent_id,
                        project_id,
                        timestamp,
                        event_type,
                        summary,
                        detail,
                    }
                })
                .collect(),
            Err(e) => {
                warn!(error = %e, "failed to load agent events from database");
                Vec::new()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_persistence() -> (tempfile::TempDir, PersistenceService) {
        let dir = tempfile::tempdir().unwrap();
        let svc = PersistenceService::with_base_dir(dir.path().to_path_buf());
        (dir, svc)
    }

    #[test]
    fn load_projects_empty() {
        let (_dir, svc) = temp_persistence();
        let projects = svc.load_projects();
        assert!(projects.is_empty());
    }

    #[test]
    fn save_and_load_projects() {
        let (_dir, svc) = temp_persistence();
        let projects = vec![
            Project::new("alpha".into(), "/tmp/alpha".into()),
            Project::new("beta".into(), "/tmp/beta".into()),
        ];
        svc.save_projects(&projects).unwrap();

        let loaded = svc.load_projects();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].name, "alpha");
        assert_eq!(loaded[1].name, "beta");
    }

    #[test]
    fn save_and_load_workspace_state() {
        let (_dir, svc) = temp_persistence();
        let state = WorkspaceState {
            layout: Some("{\"grid\":{}}".into()),
            active_project_id: Some("proj-1".into()),
        };
        svc.save_workspace_state(&state).unwrap();

        let loaded = svc.load_workspace_state();
        assert_eq!(loaded.layout.unwrap(), "{\"grid\":{}}");
        assert_eq!(loaded.active_project_id.unwrap(), "proj-1");
    }

    #[test]
    fn load_workspace_state_defaults() {
        let (_dir, svc) = temp_persistence();
        let state = svc.load_workspace_state();
        assert!(state.layout.is_none());
        assert!(state.active_project_id.is_none());
    }

    #[test]
    fn save_and_load_terminal_sessions() {
        let (_dir, svc) = temp_persistence();
        let sessions = vec![TerminalInfo {
            id: "t1".into(),
            project_id: "p1".into(),
            title: "Terminal".into(),
            cols: 80,
            rows: 24,
            cwd: "/tmp".into(),
            created_at: "2024-01-01T00:00:00Z".into(),
            status: "running".into(),
            scrollback_path: None,
        }];
        svc.save_terminal_sessions(&sessions).unwrap();

        let loaded = svc.load_terminal_sessions();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "t1");
        assert_eq!(loaded[0].cwd, "/tmp");
    }

    #[test]
    fn load_terminal_sessions_empty() {
        let (_dir, svc) = temp_persistence();
        let sessions = svc.load_terminal_sessions();
        assert!(sessions.is_empty());
    }

    #[test]
    fn scrollback_roundtrip() {
        let (_dir, svc) = temp_persistence();
        let writer = svc.create_scrollback_writer("test-term");
        assert!(writer.is_some());

        if let Some(w) = writer {
            let mut guard = w.lock().unwrap();
            guard.write_all(b"hello world").unwrap();
            guard.flush().unwrap();
            drop(guard);
        }

        let data = svc.load_scrollback("test-term");
        assert_eq!(data, b"hello world");
    }

    #[test]
    fn cleanup_terminal_removes_scrollback() {
        let (_dir, svc) = temp_persistence();
        let writer = svc.create_scrollback_writer("cleanup-test");
        assert!(writer.is_some());
        if let Some(w) = writer {
            let mut guard = w.lock().unwrap();
            guard.write_all(b"data").unwrap();
            guard.flush().unwrap();
            drop(guard);
        }

        svc.cleanup_terminal("cleanup-test");
        let data = svc.load_scrollback("cleanup-test");
        assert!(data.is_empty());
    }

    #[test]
    fn update_terminal_status() {
        let (_dir, svc) = temp_persistence();
        let sessions = vec![TerminalInfo {
            id: "t1".into(),
            project_id: "p1".into(),
            title: "Terminal".into(),
            cols: 80,
            rows: 24,
            cwd: "/tmp".into(),
            created_at: "2024-01-01T00:00:00Z".into(),
            status: "running".into(),
            scrollback_path: None,
        }];
        svc.save_terminal_sessions(&sessions).unwrap();

        svc.update_terminal_status("t1", "exited");

        let loaded = svc.load_terminal_sessions();
        assert_eq!(loaded[0].status, "exited");
    }

    #[test]
    fn save_and_load_agent() {
        let (_dir, svc) = temp_persistence();
        let agent = AgentInfo {
            id: "a1".into(),
            project_id: "p1".into(),
            agent_type: "claude-code".into(),
            status: "running".into(),
            prompt: Some("fix bugs".into()),
            pid: Some(12345),
            session_id: None,
            token_usage: TokenUsage {
                input_tokens: 100,
                output_tokens: 200,
                cache_read_tokens: 50,
                cache_creation_tokens: 10,
                cost_usd: 0.05,
            },
            started_at: "2024-01-01T00:00:00Z".into(),
            cwd: "/tmp".into(),
        };
        svc.save_agent(&agent).unwrap();

        let loaded = svc.load_agents();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "a1");
        assert_eq!(loaded[0].token_usage.input_tokens, 100);
        assert_eq!(loaded[0].pid, Some(12345));
    }

    #[test]
    fn save_and_load_agent_events() {
        let (_dir, svc) = temp_persistence();
        let event = AgentEvent {
            agent_id: "a1".into(),
            project_id: "p1".into(),
            timestamp: "2024-01-01T00:00:00Z".into(),
            event_type: "tool_use".into(),
            summary: "Read file".into(),
            detail: Some("path: /foo/bar.rs".into()),
        };
        svc.save_agent_event(&event).unwrap();

        let loaded = svc.load_agent_events("p1", 0, 100);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].event_type, "tool_use");
        assert_eq!(loaded[0].summary, "Read file");
    }

    #[test]
    fn migrate_json_projects() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().to_path_buf();
        fs::create_dir_all(&base).ok();

        // Write a legacy JSON file
        let projects = vec![Project::new("legacy".into(), "/tmp/legacy".into())];
        let data = serde_json::to_string_pretty(&projects).unwrap();
        fs::write(base.join("projects.json"), data).unwrap();

        // Creating PersistenceService should auto-migrate
        let svc = PersistenceService::with_base_dir(base.clone());
        // Force migration (with_base_dir doesn't call migrate, so do it manually for the test)
        svc.migrate_json_data();

        let loaded = svc.load_projects();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "legacy");

        // Original file should be renamed
        assert!(!base.join("projects.json").exists());
        assert!(base.join("projects.json.bak").exists());
    }
}
