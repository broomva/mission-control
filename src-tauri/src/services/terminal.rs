use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_specta::Event;
use tracing::{error, info};
use uuid::Uuid;

use crate::models::{AppError, TerminalDataEvent, TerminalExitEvent, TerminalInfo};

struct TerminalSession {
    info: TerminalInfo,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn MasterPty + Send>,
}

pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl TerminalService {
    pub fn new() -> Self {
        info!("terminal service initialized");
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
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
        cmd.cwd(cwd);

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

        let info = TerminalInfo {
            id: id.clone(),
            project_id,
            title: "Terminal".to_string(),
            cols,
            rows,
        };

        let session = TerminalSession {
            info: info.clone(),
            writer,
            _master: pair.master,
        };

        self.sessions.lock().unwrap().insert(id.clone(), session);
        info!(terminal_id = %id, "terminal created");

        // Spawn reader thread for PTY output
        let sessions_clone = Arc::clone(&self.sessions);
        let terminal_id = id.clone();
        Self::spawn_reader(reader, terminal_id, app_handle, sessions_clone);

        Ok(info)
    }

    fn spawn_reader(
        mut reader: Box<dyn Read + Send>,
        terminal_id: String,
        app_handle: AppHandle,
        sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    ) {
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        info!(terminal_id = %terminal_id, "terminal EOF");
                        let _ = TerminalExitEvent {
                            terminal_id: terminal_id.clone(),
                        }
                        .emit(&app_handle);
                        break;
                    }
                    Ok(n) => {
                        let _ = TerminalDataEvent {
                            terminal_id: terminal_id.clone(),
                            data: buf[..n].to_vec(),
                        }
                        .emit(&app_handle);
                    }
                    Err(e) => {
                        error!(terminal_id = %terminal_id, error = %e, "terminal read error");
                        let _ = TerminalExitEvent {
                            terminal_id: terminal_id.clone(),
                        }
                        .emit(&app_handle);
                        break;
                    }
                }
            }
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
        Ok(())
    }

    pub fn list(&self) -> Vec<TerminalInfo> {
        let sessions = self.sessions.lock().unwrap();
        sessions.values().map(|s| s.info.clone()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_service_has_no_sessions() {
        let svc = TerminalService::new();
        assert!(svc.list().is_empty());
    }

    #[test]
    fn write_to_nonexistent_terminal_fails() {
        let svc = TerminalService::new();
        let result = svc.write("nonexistent", b"hello");
        assert!(result.is_err());
    }

    #[test]
    fn resize_nonexistent_terminal_fails() {
        let svc = TerminalService::new();
        let result = svc.resize("nonexistent", 120, 40);
        assert!(result.is_err());
    }

    #[test]
    fn close_nonexistent_terminal_fails() {
        let svc = TerminalService::new();
        let result = svc.close("nonexistent");
        assert!(result.is_err());
    }
}
