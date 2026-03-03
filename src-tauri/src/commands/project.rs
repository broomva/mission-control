use tauri::State;

use crate::models::{AppError, Project};
use crate::services::ProjectService;

#[tauri::command]
#[specta::specta]
pub fn list_projects(service: State<'_, ProjectService>) -> Result<Vec<Project>, AppError> {
    Ok(service.list())
}

#[tauri::command]
#[specta::specta]
pub fn add_project(
    name: String,
    path: String,
    service: State<'_, ProjectService>,
) -> Result<Project, AppError> {
    service.add(name, path)
}

#[tauri::command]
#[specta::specta]
pub fn remove_project(
    id: String,
    service: State<'_, ProjectService>,
) -> Result<Project, AppError> {
    service.remove(&id)
}

#[tauri::command]
#[specta::specta]
pub fn get_project(id: String, service: State<'_, ProjectService>) -> Result<Project, AppError> {
    service.get(&id)
}
