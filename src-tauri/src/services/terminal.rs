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
    /// tmux session name if this terminal is backed by tmux
    tmux_session: Option<String>,
}

/// Information about a discovered tmux session
#[derive(Debug, Clone)]
pub struct TmuxSessionInfo {
    pub session_name: String,
    pub terminal_id: String,
    pub attached: bool,
}

pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    persistence: Arc<PersistenceService>,
    tmux_available: bool,
}

impl TerminalService {
    pub fn new(persistence: Arc<PersistenceService>) -> Self {
        let tmux_available = detect_tmux();
        info!(tmux_available = tmux_available, "terminal service initialized");
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            persistence,
            tmux_available,
        }
    }

    /// Returns whether tmux was detected at initialization
    pub fn has_tmux(&self) -> bool {
        self.tmux_available
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
        let tmux_session_name = if self.tmux_available {
            Some(tmux_session_name(&id))
        } else {
            None
        };

        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        let cmd = if let Some(ref session_name) = tmux_session_name {
            let mut cmd = CommandBuilder::new("tmux");
            cmd.args([
                "new-session",
                "-A",
                "-s",
                session_name,
                "-x",
                &cols.to_string(),
                "-y",
                &rows.to_string(),
            ]);
            cmd.cwd(&cwd);
            cmd
        } else {
            let mut cmd = CommandBuilder::new_default_prog();
            cmd.cwd(&cwd);
            cmd
        };

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
            tmux_session: tmux_session_name.clone(),
        };

        self.sessions.lock().unwrap().insert(id.clone(), session);
        info!(
            terminal_id = %id,
            tmux_session = ?tmux_session_name,
            "terminal created"
        );

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
        let removed = sessions
            .remove(id)
            .ok_or_else(|| AppError::TerminalNotFound(id.to_string()))?;

        // Kill the backing tmux session so it doesn't linger
        if let Some(ref tmux_name) = removed.tmux_session {
            kill_tmux_session(tmux_name);
        }

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

        // Check if there is a tmux session we can reattach to
        let tmux_name = tmux_session_name(id);
        let can_reattach = self.tmux_available && tmux_session_exists(&tmux_name);

        // Clean up old scrollback
        self.persistence.cleanup_terminal(id);

        // Remove old session from persisted list
        let updated: Vec<TerminalInfo> = persisted.into_iter().filter(|t| t.id != id).collect();
        if let Err(e) = self.persistence.save_terminal_sessions(&updated) {
            warn!(error = %e, "failed to update persisted sessions during restore");
        }

        if can_reattach {
            // Reattach to existing tmux session, preserving state
            info!(terminal_id = %id, tmux_session = %tmux_name, "reattaching to tmux session");
            self.attach_tmux_session(
                id.to_string(),
                project_id,
                cwd,
                &tmux_name,
                cols,
                rows,
                app_handle,
            )
        } else {
            // Create fresh terminal in same cwd (fallback)
            self.create(project_id, cwd, cols, rows, app_handle)
        }
    }

    /// Attach a PTY to an existing tmux session
    fn attach_tmux_session(
        &self,
        id: String,
        project_id: String,
        cwd: String,
        tmux_name: &str,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
    ) -> Result<TerminalInfo, AppError> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::TerminalError(e.to_string()))?;

        // Attach to existing tmux session (new-session -A reattaches if exists)
        let mut cmd = CommandBuilder::new("tmux");
        cmd.args([
            "new-session",
            "-A",
            "-s",
            tmux_name,
            "-x",
            &cols.to_string(),
            "-y",
            &rows.to_string(),
        ]);
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
            tmux_session: Some(tmux_name.to_string()),
        };

        self.sessions.lock().unwrap().insert(id.clone(), session);
        info!(terminal_id = %id, tmux_session = %tmux_name, "reattached to tmux session");

        self.persist_all_sessions();

        let scrollback_writer = self.persistence.create_scrollback_writer(&id);

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

    /// List tmux sessions managed by mission-control (those with `mc-` prefix)
    pub fn list_tmux_sessions(&self) -> Vec<TmuxSessionInfo> {
        if !self.tmux_available {
            return Vec::new();
        }
        list_mc_tmux_sessions()
    }

    /// Reconnect all orphaned tmux sessions on startup.
    /// Returns the number of sessions successfully reconnected.
    pub fn reconnect_tmux_sessions(&self, app_handle: AppHandle) -> usize {
        if !self.tmux_available {
            return 0;
        }

        let tmux_sessions = list_mc_tmux_sessions();
        if tmux_sessions.is_empty() {
            return 0;
        }

        let mut reconnected = 0;

        // Check which tmux sessions don't have a live PTY session
        let live_ids: Vec<String> = {
            let sessions = self.sessions.lock().unwrap();
            sessions.keys().cloned().collect()
        };

        for ts in &tmux_sessions {
            if live_ids.contains(&ts.terminal_id) {
                continue; // Already has a live session
            }

            // Try to find persisted metadata for this terminal
            let persisted = self.persistence.load_terminal_sessions();
            let meta = persisted.iter().find(|t| t.id == ts.terminal_id);

            let (project_id, cwd) = match meta {
                Some(m) => (m.project_id.clone(), m.cwd.clone()),
                None => {
                    // No persisted metadata -- we can still reattach with defaults
                    let cwd = dirs::home_dir()
                        .unwrap_or_else(|| std::path::PathBuf::from("/"))
                        .to_string_lossy()
                        .to_string();
                    ("unknown".to_string(), cwd)
                }
            };

            match self.attach_tmux_session(
                ts.terminal_id.clone(),
                project_id,
                cwd,
                &ts.session_name,
                80,
                24,
                app_handle.clone(),
            ) {
                Ok(_) => {
                    info!(terminal_id = %ts.terminal_id, tmux = %ts.session_name, "reconnected tmux session");
                    reconnected += 1;
                }
                Err(e) => {
                    warn!(terminal_id = %ts.terminal_id, tmux = %ts.session_name, error = %e, "failed to reconnect tmux session");
                }
            }
        }

        reconnected
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

// --- tmux helper functions ---

/// Generate the tmux session name for a given terminal id.
/// Format: `mc-{first 8 chars of terminal_id}`
pub(crate) fn tmux_session_name(terminal_id: &str) -> String {
    let short = if terminal_id.len() >= 8 {
        &terminal_id[..8]
    } else {
        terminal_id
    };
    format!("mc-{}", short)
}

/// Detect whether tmux is available on the system.
pub(crate) fn detect_tmux() -> bool {
    std::process::Command::new("which")
        .arg("tmux")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if a specific tmux session exists.
fn tmux_session_exists(session_name: &str) -> bool {
    std::process::Command::new("tmux")
        .args(["has-session", "-t", session_name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Kill a tmux session by name (best-effort, errors are logged and ignored).
fn kill_tmux_session(session_name: &str) {
    match std::process::Command::new("tmux")
        .args(["kill-session", "-t", session_name])
        .output()
    {
        Ok(o) if o.status.success() => {
            info!(session = %session_name, "killed tmux session");
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            warn!(session = %session_name, stderr = %stderr, "tmux kill-session returned non-zero");
        }
        Err(e) => {
            warn!(session = %session_name, error = %e, "failed to run tmux kill-session");
        }
    }
}

/// List all tmux sessions with the `mc-` prefix.
fn list_mc_tmux_sessions() -> Vec<TmuxSessionInfo> {
    let output = match std::process::Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}:#{session_attached}"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if !line.starts_with("mc-") {
                return None;
            }
            // Format: "mc-{id_prefix}:{0|1}"
            let parts: Vec<&str> = line.rsplitn(2, ':').collect();
            if parts.len() != 2 {
                return None;
            }
            let session_name = parts[1].to_string();
            let attached = parts[0] == "1";
            // Extract terminal_id prefix from session name (strip "mc-")
            let id_prefix = session_name.strip_prefix("mc-")?.to_string();
            Some(TmuxSessionInfo {
                session_name,
                terminal_id: id_prefix,
                attached,
            })
        })
        .collect()
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

    // --- tmux unit tests ---

    #[test]
    fn tmux_session_name_from_uuid() {
        let id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        let name = tmux_session_name(id);
        assert_eq!(name, "mc-a1b2c3d4");
    }

    #[test]
    fn tmux_session_name_short_id() {
        let id = "abc";
        let name = tmux_session_name(id);
        assert_eq!(name, "mc-abc");
    }

    #[test]
    fn tmux_session_name_exact_eight() {
        let id = "12345678";
        let name = tmux_session_name(id);
        assert_eq!(name, "mc-12345678");
    }

    #[test]
    fn detect_tmux_runs_without_panic() {
        // Just verify it doesn't panic; result depends on CI environment
        let _available = detect_tmux();
    }

    #[test]
    fn has_tmux_matches_detection() {
        let svc = make_service();
        // The service's tmux flag should match a fresh detection
        assert_eq!(svc.has_tmux(), detect_tmux());
    }

    #[test]
    fn list_tmux_sessions_returns_vec() {
        let svc = make_service();
        // Should not panic regardless of tmux availability
        let sessions = svc.list_tmux_sessions();
        // If tmux not available, should be empty
        if !svc.has_tmux() {
            assert!(sessions.is_empty());
        }
    }
}
