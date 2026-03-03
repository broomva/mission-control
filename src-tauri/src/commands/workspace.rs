use tauri::State;

use crate::models::{AppError, WorkspaceState};
use crate::services::PersistenceService;

#[tauri::command]
#[specta::specta]
pub fn load_workspace_state(
    service: State<'_, PersistenceService>,
) -> Result<WorkspaceState, AppError> {
    Ok(service.load_workspace_state())
}

#[tauri::command]
#[specta::specta]
pub fn save_workspace_state(
    state: WorkspaceState,
    service: State<'_, PersistenceService>,
) -> Result<(), AppError> {
    service.save_workspace_state(&state)
}
