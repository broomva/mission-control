use std::collections::HashMap;
use std::sync::Mutex;
use tracing::info;

use crate::models::{AppError, Project};
use crate::services::persistence::PersistenceService;

pub struct ProjectService {
    projects: Mutex<HashMap<String, Project>>,
    persistence: PersistenceService,
}

impl ProjectService {
    pub fn new(persistence: PersistenceService) -> Self {
        let saved = persistence.load_projects();
        let mut map = HashMap::new();
        for p in saved {
            map.insert(p.id.clone(), p);
        }
        info!(count = map.len(), "project service initialized");
        Self {
            projects: Mutex::new(map),
            persistence,
        }
    }

    pub fn list(&self) -> Vec<Project> {
        let map = self.projects.lock().unwrap();
        let mut projects: Vec<Project> = map.values().cloned().collect();
        projects.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        projects
    }

    pub fn add(&self, name: String, path: String) -> Result<Project, AppError> {
        let mut map = self.projects.lock().unwrap();

        // Check for duplicate path
        if map.values().any(|p| p.path == path) {
            return Err(AppError::ProjectAlreadyExists(path));
        }

        let project = Project::new(name, path);
        map.insert(project.id.clone(), project.clone());
        info!(id = %project.id, name = %project.name, "project added");

        let projects: Vec<Project> = map.values().cloned().collect();
        self.persistence.save_projects(&projects)?;

        Ok(project)
    }

    pub fn remove(&self, id: &str) -> Result<Project, AppError> {
        let mut map = self.projects.lock().unwrap();
        let project = map
            .remove(id)
            .ok_or_else(|| AppError::ProjectNotFound(id.to_string()))?;
        info!(id = %project.id, name = %project.name, "project removed");

        let projects: Vec<Project> = map.values().cloned().collect();
        self.persistence.save_projects(&projects)?;

        Ok(project)
    }

    pub fn get(&self, id: &str) -> Result<Project, AppError> {
        let map = self.projects.lock().unwrap();
        map.get(id)
            .cloned()
            .ok_or_else(|| AppError::ProjectNotFound(id.to_string()))
    }
}
