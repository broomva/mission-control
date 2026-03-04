use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{BufWriter, Read, Write};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_specta::Event;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::models::{AppError, TerminalDataEvent, TerminalExitEvent, TerminalInfo};
use crate::services::PersistenceService;

pub(crate) struct TerminalSession {
    pub info: TerminalInfo,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn MasterPty + Send>,
}

pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    persistence: Arc<PersistenceService>,
}

impl TerminalService {
    pub fn new(persistence: Arc<PersistenceService>) -> Self {
        info!("terminal service initialized");
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            persistence,
        }
    }

    pub fn create(
        &self,
        project_id: String,
        cwd: String,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
    ) -> Result<TerminalInfo, AppError> {
        let id = Uuid::new_v4().to_string();
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.cwd(&cwd);

        pair.slave
            .spawn_command(cmd)
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        let scrollback_path = self.persistence.scrollback_path(&id);
        let scrollback_path_str = scrollback_path.to_string_lossy().to_string();

        let info = TerminalInfo {
            id: id.clone(),
            project_id,
            title: "Terminal".to_string(),
            cols,
            rows,
            cwd,
            created_at: chrono::Utc::now().to_rfc3339(),
            status: "running".to_string(),
            scrollback_path: Some(scrollback_path_str),
        };

        let session = TerminalSession {
            info: info.clone(),
            writer,
            _master: pair.master,
        };

        self.sessions.lock().unwrap().insert(id.clone(), session);
        info!(terminal_id = %id, "terminal created");

        // Persist session metadata
        self.persist_all_sessions();

        // Create scrollback file writer
        let scrollback_writer = self.persistence.create_scrollback_writer(&id);

        // Spawn reader thread for PTY output
        let sessions_clone = Arc::clone(&self.sessions);
        let persistence_clone = Arc::clone(&self.persistence);
        let terminal_id = id.clone();
        Self::spawn_reader(
            reader,
            terminal_id,
            app_handle,
            sessions_clone,
            persistence_clone,
            scrollback_writer,
        );

        Ok(info)
    }

    fn spawn_reader(
        mut reader: Box<dyn Read + Send>,
        terminal_id: String,
        app_handle: AppHandle,
        sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
        persistence: Arc<PersistenceService>,
        scrollback_writer: Option<Arc<Mutex<BufWriter<std::fs::File>>>>,
    ) {
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            const MAX_SCROLLBACK: u64 = 1_048_576; // 1MB
            let mut total_written: u64 = 0;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        info!(terminal_id = %terminal_id, "terminal EOF");
                        persistence.update_terminal_status(&terminal_id, "exited");
                        let _ = TerminalExitEvent {
                            terminal_id: terminal_id.clone(),
                        }
                        .emit(&app_handle);
                        break;
                    }
                    Ok(n) => {
                        let data = &buf[..n];

                        // Write to scrollback file
                        if let Some(ref writer) = scrollback_writer {
                            if total_written < MAX_SCROLLBACK {
                                if let Ok(mut w) = writer.lock() {
                                    if w.write_all(data).is_ok() {
                                        let _ = w.flush();
                                        total_written += n as u64;
                                    }
                                }
                            }
                        }

                        let _ = TerminalDataEvent {
                            terminal_id: terminal_id.clone(),
                            data: data.to_vec(),
                        }
                        .emit(&app_handle);
                    }
                    Err(e) => {
                        error!(terminal_id = %terminal_id, error = %e, "terminal read error");
                        persistence.update_terminal_status(&terminal_id, "exited");
                        let _ = TerminalExitEvent {
                            terminal_id: terminal_id.clone(),
                        }
                        .emit(&app_handle);
                        break;
                    }
                }
            }
            // Remove from live sessions but keep persisted metadata
            sessions.lock().unwrap().remove(&terminal_id);
        });
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| AppError::TerminalNotFound(id.to_string()))?;
        session
            .writer
            .write_all(data)
            .map_err(|e| AppError::TerminalError(e.to_string()))?;
        session
            .writer
            .flush()
            .map_err(|e| AppError::TerminalError(e.to_string()))?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(id)
            .ok_or_else(|| AppError::TerminalNotFound(id.to_string()))?;
        session
            ._master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::TerminalError(e.to_string()))?;
        info!(terminal_id = %id, cols, rows, "terminal resized");
        Ok(())
    }

    pub fn close(&self, id: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions
            .remove(id)
            .ok_or_else(|| AppError::TerminalNotFound(id.to_string()))?;
        info!(terminal_id = %id, "terminal closed");
        drop(sessions);

        // Persist updated session list
        self.persist_all_sessions();
        Ok(())
    }

    pub fn list(&self) -> Vec<TerminalInfo> {
        let sessions = self.sessions.lock().unwrap();
        sessions.values().map(|s| s.info.clone()).collect()
    }

    pub fn list_project_terminals(&self, project_id: &str) -> Vec<TerminalInfo> {
        // First get running terminals
        let mut terminals: Vec<TerminalInfo> = {
            let sessions = self.sessions.lock().unwrap();
            sessions
                .values()
                .filter(|s| s.info.project_id == project_id)
                .map(|s| s.info.clone())
                .collect()
        };

        // Then get persisted (exited) terminals
        let persisted = self.persistence.load_terminal_sessions();
        for t in persisted {
            if t.project_id == project_id && t.status == "exited" {
                // Only add if not already in running list
                if !terminals.iter().any(|r| r.id == t.id) {
                    terminals.push(t);
                }
            }
        }

        terminals
    }

    pub fn restore_terminal(
        &self,
        id: &str,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
    ) -> Result<TerminalInfo, AppError> {
        // Load persisted session to get cwd and project_id
        let persisted = self.persistence.load_terminal_sessions();
        let old_session = persisted
            .iter()
            .find(|t| t.id == id)
            .ok_or_else(|| AppError::TerminalNotFound(id.to_string()))?;

        let project_id = old_session.project_id.clone();
        let cwd = old_session.cwd.clone();

        // Clean up old scrollback
        self.persistence.cleanup_terminal(id);

        // Remove old session from persisted list
        let updated: Vec<TerminalInfo> = persisted.into_iter().filter(|t| t.id != id).collect();
        if let Err(e) = self.persistence.save_terminal_sessions(&updated) {
            warn!(error = %e, "failed to update persisted sessions during restore");
        }

        // Create fresh terminal in same cwd
        self.create(project_id, cwd, cols, rows, app_handle)
    }

    fn persist_all_sessions(&self) {
        let sessions = self.sessions.lock().unwrap();
        let infos: Vec<TerminalInfo> = sessions.values().map(|s| s.info.clone()).collect();
        drop(sessions);

        // Merge with existing persisted exited sessions
        let mut all = self.persistence.load_terminal_sessions();
        // Remove any that we have live versions of
        all.retain(|t| !infos.iter().any(|i| i.id == t.id));
        all.extend(infos);

        if let Err(e) = self.persistence.save_terminal_sessions(&all) {
            warn!(error = %e, "failed to persist terminal sessions");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_service() -> TerminalService {
        let persistence = Arc::new(PersistenceService::new());
        TerminalService::new(persistence)
    }

    #[test]
    fn new_service_has_no_sessions() {
        let svc = make_service();
        assert!(svc.list().is_empty());
    }

    #[test]
    fn write_to_nonexistent_terminal_fails() {
        let svc = make_service();
        let result = svc.write("nonexistent", b"hello");
        assert!(result.is_err());
    }

    #[test]
    fn resize_nonexistent_terminal_fails() {
        let svc = make_service();
        let result = svc.resize("nonexistent", 120, 40);
        assert!(result.is_err());
    }

    #[test]
    fn close_nonexistent_terminal_fails() {
        let svc = make_service();
        let result = svc.close("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn list_project_terminals_empty() {
        let svc = make_service();
        let terminals = svc.list_project_terminals("some-project");
        assert!(terminals.is_empty());
    }
}
