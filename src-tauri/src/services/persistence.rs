use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::models::{AppError, Project, WorkspaceState};

pub struct PersistenceService {
    base_dir: PathBuf,
}

impl PersistenceService {
    pub fn new() -> Self {
        let base_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".mission-control");
        fs::create_dir_all(&base_dir).ok();
        info!(path = %base_dir.display(), "persistence directory initialized");
        Self { base_dir }
    }

    #[cfg(test)]
    pub fn with_base_dir(base_dir: PathBuf) -> Self {
        fs::create_dir_all(&base_dir).ok();
        Self { base_dir }
    }

    fn projects_path(&self) -> PathBuf {
        self.base_dir.join("projects.json")
    }

    fn state_path(&self) -> PathBuf {
        self.base_dir.join("state.json")
    }

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
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
