use std::fs;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

use crate::models::{AppError, Project, TerminalInfo, WorkspaceState};

pub struct PersistenceService {
    base_dir: PathBuf,
}

impl PersistenceService {
    pub fn new() -> Self {
        let base_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".mission-control");
        fs::create_dir_all(&base_dir).ok();
        fs::create_dir_all(base_dir.join("terminals")).ok();
        info!(path = %base_dir.display(), "persistence directory initialized");
        Self { base_dir }
    }

    #[cfg(test)]
    pub fn with_base_dir(base_dir: PathBuf) -> Self {
        fs::create_dir_all(&base_dir).ok();
        fs::create_dir_all(base_dir.join("terminals")).ok();
        Self { base_dir }
    }

    fn projects_path(&self) -> PathBuf {
        self.base_dir.join("projects.json")
    }

    fn state_path(&self) -> PathBuf {
        self.base_dir.join("state.json")
    }

    fn terminals_path(&self) -> PathBuf {
        self.base_dir.join("terminals.json")
    }

    pub fn scrollback_path(&self, terminal_id: &str) -> PathBuf {
        self.base_dir
            .join("terminals")
            .join(format!("{}.scrollback", terminal_id))
    }

    // --- Projects ---

    pub fn load_projects(&self) -> Vec<Project> {
        let path = self.projects_path();
        match fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str(&data) {
                Ok(projects) => {
                    info!("loaded projects from disk");
                    projects
                }
                Err(e) => {
                    warn!(error = %e, "corrupt projects file, returning empty list");
                    Vec::new()
                }
            },
            Err(_) => {
                info!("no projects file found, starting fresh");
                Vec::new()
            }
        }
    }

    pub fn save_projects(&self, projects: &[Project]) -> Result<(), AppError> {
        let data = serde_json::to_string_pretty(projects)?;
        fs::write(self.projects_path(), data)?;
        info!(count = projects.len(), "saved projects to disk");
        Ok(())
    }

    // --- Workspace State ---

    pub fn load_workspace_state(&self) -> WorkspaceState {
        let path = self.state_path();
        match fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str(&data) {
                Ok(state) => {
                    info!("loaded workspace state from disk");
                    state
                }
                Err(e) => {
                    warn!(error = %e, "corrupt state file, returning defaults");
                    WorkspaceState::default()
                }
            },
            Err(_) => {
                info!("no state file found, using defaults");
                WorkspaceState::default()
            }
        }
    }

    pub fn save_workspace_state(&self, state: &WorkspaceState) -> Result<(), AppError> {
        let data = serde_json::to_string_pretty(state)?;
        fs::write(self.state_path(), data)?;
        info!("saved workspace state to disk");
        Ok(())
    }

    // --- Terminal Sessions ---

    pub fn save_terminal_sessions(&self, sessions: &[TerminalInfo]) -> Result<(), AppError> {
        let data = serde_json::to_string_pretty(sessions)?;
        fs::write(self.terminals_path(), data)?;
        info!(count = sessions.len(), "saved terminal sessions to disk");
        Ok(())
    }

    pub fn load_terminal_sessions(&self) -> Vec<TerminalInfo> {
        let path = self.terminals_path();
        match fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str(&data) {
                Ok(sessions) => {
                    info!("loaded terminal sessions from disk");
                    sessions
                }
                Err(e) => {
                    warn!(error = %e, "corrupt terminal sessions file, returning empty");
                    Vec::new()
                }
            },
            Err(_) => {
                info!("no terminal sessions file found");
                Vec::new()
            }
        }
    }

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

    /// Update a single terminal's status in the persisted sessions file
    pub fn update_terminal_status(&self, terminal_id: &str, status: &str) {
        let mut sessions = self.load_terminal_sessions();
        if let Some(session) = sessions.iter_mut().find(|t| t.id == terminal_id) {
            session.status = status.to_string();
            if let Err(e) = self.save_terminal_sessions(&sessions) {
                warn!(error = %e, "failed to update terminal status");
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
    fn corrupt_projects_file_returns_empty() {
        let (dir, svc) = temp_persistence();
        fs::write(dir.path().join("projects.json"), "not json!").unwrap();
        let projects = svc.load_projects();
        assert!(projects.is_empty());
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
    fn corrupt_state_file_returns_default() {
        let (dir, svc) = temp_persistence();
        fs::write(dir.path().join("state.json"), "{{bad}}").unwrap();
        let state = svc.load_workspace_state();
        assert!(state.layout.is_none());
        assert!(state.active_project_id.is_none());
    }

    #[test]
    fn load_workspace_state_no_file() {
        let (_dir, svc) = temp_persistence();
        let state = svc.load_workspace_state();
        assert!(state.layout.is_none());
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
}
