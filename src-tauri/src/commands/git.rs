use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::models::git::{
    BranchInfo, CheckpointInfo, CommitDetail, CommitInfo, DiffInfo, FileStatusEntry, GitGraphData,
    WorktreeInfo,
};
use crate::models::AppError;
use crate::services::{FsWatcherService, GitService};

#[tauri::command]
#[specta::specta]
pub fn git_status(
    project_id: String,
    path: String,
    service: State<'_, Arc<GitService>>,
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
    service: State<'_, Arc<GitService>>,
) -> Result<Vec<CommitInfo>, AppError> {
    service.get_log(&project_id, &path, offset, limit)
}

#[tauri::command]
#[specta::specta]
pub fn git_diff(
    project_id: String,
    path: String,
    oid: String,
    service: State<'_, Arc<GitService>>,
) -> Result<DiffInfo, AppError> {
    service.get_diff(&project_id, &path, &oid)
}

#[tauri::command]
#[specta::specta]
pub fn git_branches(
    project_id: String,
    path: String,
    service: State<'_, Arc<GitService>>,
) -> Result<Vec<BranchInfo>, AppError> {
    service.get_branches(&project_id, &path)
}

#[tauri::command]
#[specta::specta]
pub fn list_worktrees(
    project_id: String,
    path: String,
    service: State<'_, Arc<GitService>>,
) -> Result<Vec<WorktreeInfo>, AppError> {
    service.list_worktrees(&project_id, &path)
}

#[tauri::command]
#[specta::specta]
pub fn create_worktree(
    project_id: String,
    path: String,
    name: String,
    branch: String,
    service: State<'_, Arc<GitService>>,
) -> Result<WorktreeInfo, AppError> {
    service.create_worktree(&project_id, &path, &name, &branch)
}

#[tauri::command]
#[specta::specta]
pub fn remove_worktree(
    project_id: String,
    path: String,
    name: String,
    service: State<'_, Arc<GitService>>,
) -> Result<(), AppError> {
    service.remove_worktree(&project_id, &path, &name)
}

#[tauri::command]
#[specta::specta]
pub fn create_checkpoint(
    project_id: String,
    path: String,
    description: String,
    agent_id: Option<String>,
    service: State<'_, Arc<GitService>>,
) -> Result<CheckpointInfo, AppError> {
    service.create_checkpoint(
        &project_id,
        &path,
        &description,
        agent_id.as_deref(),
    )
}

#[tauri::command]
#[specta::specta]
pub fn list_checkpoints(
    project_id: String,
    path: String,
    service: State<'_, Arc<GitService>>,
) -> Result<Vec<CheckpointInfo>, AppError> {
    service.list_checkpoints(&project_id, &path)
}

#[tauri::command]
#[specta::specta]
pub fn rollback_to_checkpoint(
    project_id: String,
    path: String,
    checkpoint_id: String,
    service: State<'_, Arc<GitService>>,
) -> Result<(), AppError> {
    service.rollback_to_checkpoint(&project_id, &path, &checkpoint_id)
}

#[tauri::command]
#[specta::specta]
pub fn delete_checkpoint(
    project_id: String,
    path: String,
    checkpoint_id: String,
    service: State<'_, Arc<GitService>>,
) -> Result<(), AppError> {
    service.delete_checkpoint(&project_id, &path, &checkpoint_id)
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

#[tauri::command]
#[specta::specta]
pub fn git_graph(
    project_id: String,
    path: String,
    max_count: u32,
    service: State<'_, Arc<GitService>>,
) -> Result<GitGraphData, AppError> {
    service.get_graph(&project_id, &path, max_count)
}

#[tauri::command]
#[specta::specta]
pub fn git_commit_detail(
    project_id: String,
    path: String,
    sha: String,
    service: State<'_, Arc<GitService>>,
) -> Result<CommitDetail, AppError> {
    service.get_commit_detail(&project_id, &path, &sha)
}
