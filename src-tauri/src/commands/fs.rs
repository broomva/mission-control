use std::path::Path;

use crate::models::{AppError, DirectoryEntry};

#[tauri::command]
#[specta::specta]
pub fn read_directory(path: String) -> Result<Vec<DirectoryEntry>, AppError> {
    let dir_path = Path::new(&path);
    if !dir_path.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "Not a directory: {}",
            path
        )));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir_path).map_err(|e| AppError::IoError(e.to_string()))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| AppError::IoError(e.to_string()))?;
        let metadata = entry
            .metadata()
            .map_err(|e| AppError::IoError(e.to_string()))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');

        entries.push(DirectoryEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            is_hidden,
        });
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}
