use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use tauri::AppHandle;
use tauri_specta::Event;
use tracing::{info, warn};

use crate::models::events::{FsChangeEvent, GitRefChangedEvent};
use crate::models::AppError;

type FsDebouncer = Debouncer<notify::RecommendedWatcher>;

pub struct FsWatcherService {
    watchers: Mutex<HashMap<String, FsDebouncer>>,
}

impl FsWatcherService {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    pub fn watch(
        &self,
        project_id: &str,
        path: &str,
        app_handle: AppHandle,
    ) -> Result<(), AppError> {
        let mut watchers = self.watchers.lock().unwrap();

        // Already watching this project
        if watchers.contains_key(project_id) {
            return Ok(());
        }

        let project_id_clone = project_id.to_string();
        let watch_path = PathBuf::from(path);
        let git_refs_path = watch_path.join(".git").join("refs");
        let git_head_path = watch_path.join(".git").join("HEAD");

        let debouncer = new_debouncer(
            std::time::Duration::from_millis(500),
            move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
                match events {
                    Ok(events) => {
                        let mut is_git_ref_change = false;
                        let mut changed_paths: Vec<String> = Vec::new();

                        for event in &events {
                            if event.kind != DebouncedEventKind::Any {
                                continue;
                            }
                            let p = &event.path;
                            if p.starts_with(&git_refs_path) || p == &git_head_path {
                                is_git_ref_change = true;
                            } else {
                                changed_paths
                                    .push(p.to_string_lossy().to_string());
                            }
                        }

                        if is_git_ref_change {
                            let _ = GitRefChangedEvent {
                                project_id: project_id_clone.clone(),
                            }
                            .emit(&app_handle);
                        }

                        if !changed_paths.is_empty() {
                            let _ = FsChangeEvent {
                                project_id: project_id_clone.clone(),
                                paths: changed_paths,
                            }
                            .emit(&app_handle);
                        }
                    }
                    Err(e) => {
                        warn!("fs watcher error for {}: {:?}", project_id_clone, e);
                    }
                }
            },
        )
        .map_err(|e| AppError::IoError(format!("Failed to create watcher: {}", e)))?;

        let watch_path = PathBuf::from(path);
        watchers.insert(project_id.to_string(), debouncer);

        // Start watching — need to get mutable reference after insert
        if let Some(watcher) = watchers.get_mut(project_id) {
            watcher
                .watcher()
                .watch(&watch_path, RecursiveMode::Recursive)
                .map_err(|e| AppError::IoError(format!("Failed to watch path: {}", e)))?;
            info!("started watching project {} at {:?}", project_id, watch_path);
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn unwatch(&self, project_id: &str) -> Result<(), AppError> {
        let mut watchers = self.watchers.lock().unwrap();
        if watchers.remove(project_id).is_some() {
            info!("stopped watching project {}", project_id);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_service() {
        let service = FsWatcherService::new();
        let watchers = service.watchers.lock().unwrap();
        assert!(watchers.is_empty());
    }
}
