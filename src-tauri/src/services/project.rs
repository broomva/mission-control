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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_project_service() -> ProjectService {
        let dir = tempfile::tempdir().unwrap();
        let persistence = PersistenceService::with_base_dir(dir.path().to_path_buf());
        // Leak the tempdir so it lives long enough for all test operations
        std::mem::forget(dir);
        ProjectService::new(persistence)
    }

    #[test]
    fn list_empty() {
        let svc = test_project_service();
        assert!(svc.list().is_empty());
    }

    #[test]
    fn add_and_list() {
        let svc = test_project_service();
        let project = svc.add("test-proj".into(), "/tmp/test-proj".into()).unwrap();
        assert_eq!(project.name, "test-proj");

        let projects = svc.list();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, project.id);
    }

    #[test]
    fn add_duplicate_path_fails() {
        let svc = test_project_service();
        svc.add("first".into(), "/tmp/same-path".into()).unwrap();
        let result = svc.add("second".into(), "/tmp/same-path".into());
        assert!(result.is_err());
    }

    #[test]
    fn remove_project() {
        let svc = test_project_service();
        let project = svc.add("removable".into(), "/tmp/removable".into()).unwrap();
        let removed = svc.remove(&project.id).unwrap();
        assert_eq!(removed.id, project.id);
        assert!(svc.list().is_empty());
    }

    #[test]
    fn remove_nonexistent_fails() {
        let svc = test_project_service();
        let result = svc.remove("nonexistent-id");
        assert!(result.is_err());
    }

    #[test]
    fn get_project() {
        let svc = test_project_service();
        let project = svc.add("gettable".into(), "/tmp/gettable".into()).unwrap();
        let fetched = svc.get(&project.id).unwrap();
        assert_eq!(fetched.name, "gettable");
    }

    #[test]
    fn get_nonexistent_fails() {
        let svc = test_project_service();
        let result = svc.get("no-such-id");
        assert!(result.is_err());
    }
}
