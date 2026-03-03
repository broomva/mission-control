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
