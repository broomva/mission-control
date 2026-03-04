use tauri::{AppHandle, State};

use crate::models::git::{BranchInfo, CommitInfo, DiffInfo, FileStatusEntry};
use crate::models::AppError;
use crate::services::{FsWatcherService, GitService};

#[tauri::command]
#[specta::specta]
pub fn git_status(
    project_id: String,
    path: String,
    service: State<'_, GitService>,
) -> Result<Vec<FileStatusEntry>, AppError> {
    service.get_status(&project_id, &path)
}

#[tauri::command]
#[specta::specta]
pub fn git_log(
    project_id: String,
    path: String,
    offset: u32,
    limit: u32,
    service: State<'_, GitService>,
) -> Result<Vec<CommitInfo>, AppError> {
    service.get_log(&project_id, &path, offset, limit)
}

#[tauri::command]
#[specta::specta]
pub fn git_diff(
    project_id: String,
    path: String,
    oid: String,
    service: State<'_, GitService>,
) -> Result<DiffInfo, AppError> {
    service.get_diff(&project_id, &path, &oid)
}

#[tauri::command]
#[specta::specta]
pub fn git_branches(
    project_id: String,
    path: String,
    service: State<'_, GitService>,
) -> Result<Vec<BranchInfo>, AppError> {
    service.get_branches(&project_id, &path)
}

#[tauri::command]
#[specta::specta]
pub fn watch_project(
    project_id: String,
    path: String,
    service: State<'_, FsWatcherService>,
    app_handle: AppHandle,
) -> Result<(), AppError> {
    service.watch(&project_id, &path, app_handle)
}
