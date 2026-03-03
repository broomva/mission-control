use tauri::{AppHandle, State};

use crate::models::{AppError, TerminalInfo};
use crate::services::TerminalService;

#[tauri::command]
#[specta::specta]
pub fn create_terminal(
    project_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    service: State<'_, TerminalService>,
    app_handle: AppHandle,
) -> Result<TerminalInfo, AppError> {
    service.create(project_id, cwd, cols, rows, app_handle)
}

#[tauri::command]
#[specta::specta]
pub fn write_terminal(
    id: String,
    data: Vec<u8>,
    service: State<'_, TerminalService>,
) -> Result<(), AppError> {
    service.write(&id, &data)
}

#[tauri::command]
#[specta::specta]
pub fn resize_terminal(
    id: String,
    cols: u16,
    rows: u16,
    service: State<'_, TerminalService>,
) -> Result<(), AppError> {
    service.resize(&id, cols, rows)
}

#[tauri::command]
#[specta::specta]
pub fn close_terminal(
    id: String,
    service: State<'_, TerminalService>,
) -> Result<(), AppError> {
    service.close(&id)
}

#[tauri::command]
#[specta::specta]
pub fn list_terminals(service: State<'_, TerminalService>) -> Result<Vec<TerminalInfo>, AppError> {
    Ok(service.list())
}
