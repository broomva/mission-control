use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_specta::Event;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::models::{
    AgentEvent, AgentExitEvent, AgentInfo, AgentOutputEvent, AgentStatusEvent, AppError,
    TokenUsage,
};
use crate::services::hook_config::HookConfigGuard;
use crate::services::hook_server::HookAgentContext;
use crate::services::parsers;

struct AgentSession {
    info: AgentInfo,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn MasterPty + Send>,
    _hook_guard: Option<HookConfigGuard>,
}

pub struct AgentService {
    agents: Arc<Mutex<HashMap<String, AgentSession>>>,
    timeline: Arc<Mutex<Vec<AgentEvent>>>,
}

impl AgentService {
    pub fn new(timeline: Arc<Mutex<Vec<AgentEvent>>>) -> Self {
        info!("agent service initialized");
        Self {
            agents: Arc::new(Mutex::new(HashMap::new())),
            timeline,
        }
    }

    pub fn spawn(
        &self,
        project_id: String,
        agent_type: String,
        prompt: Option<String>,
        cwd: String,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
        hook_port: Option<u16>,
        hook_agents: Option<&Arc<Mutex<HashMap<String, HookAgentContext>>>>,
        gateway_proxy_url: Option<String>,
    ) -> Result<AgentInfo, AppError> {
        let id = Uuid::new_v4().to_string();
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::AgentError(e.to_string()))?;

        // Install hook config for claude-code interactive mode (no prompt = interactive)
        let hooks_active = agent_type == "claude-code" && hook_port.is_some();
        let hook_guard = if hooks_active {
            let port = hook_port.unwrap();

            // Register agent in hook server's agent map
            if let Some(agents_map) = hook_agents {
                agents_map.lock().unwrap().insert(
                    id.clone(),
                    HookAgentContext {
                        project_id: project_id.clone(),
                        project_path: Some(cwd.clone()),
                    },
                );
            }

            match HookConfigGuard::install(&cwd, port, &id) {
                Ok(guard) => {
                    info!(agent_id = %id, port, "hook config installed");
                    Some(guard)
                }
                Err(e) => {
                    warn!(agent_id = %id, error = %e, "failed to install hook config, falling back to parser");
                    None
                }
            }
        } else {
            None
        };

        let mut cmd = match agent_type.as_str() {
            "claude-code" => {
                let mut c = CommandBuilder::new("claude");
                c.arg("--dangerously-skip-permissions");
                // Always start in interactive mode when hooks are active.
                // The prompt (if any) will be sent via PTY input after startup.
                // Only use -p mode when hooks are NOT active (headless/batch).
                if !hooks_active {
                    if let Some(ref p) = prompt {
                        c.arg("--output-format");
                        c.arg("stream-json");
                        c.arg("-p");
                        c.arg(p);
                    }
                }
                c
            }
            "codex" => {
                let mut c = CommandBuilder::new("codex");
                c.arg("--json");
                if let Some(ref p) = prompt {
                    c.arg(p);
                }
                c
            }
            "gemini" => {
                let mut c = CommandBuilder::new("gemini");
                c.arg("--output-format");
                c.arg("json");
                if let Some(ref p) = prompt {
                    c.arg(p);
                }
                c
            }
            _ => {
                // Custom: prompt is the full command
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                let mut c = CommandBuilder::new(&shell);
                c.arg("-c");
                c.arg(prompt.as_deref().unwrap_or("echo 'No command provided'"));
                c
            }
        };
        // Auth gateway proxy is disabled by default until fully production-ready.
        // When enabled, it routes agent API calls through the gateway which
        // swaps in real credentials (SuperHQ pattern).
        // TODO: Re-enable once gateway handles all API providers correctly.
        if let Some(ref proxy_url) = gateway_proxy_url {
            if std::env::var("MC_ENABLE_AUTH_GATEWAY").unwrap_or_default() == "1" {
                cmd.env("HTTP_PROXY", proxy_url);
                cmd.env("HTTPS_PROXY", proxy_url);
                info!(agent_id = %id, proxy = %proxy_url, "gateway proxy env set");
            } else {
                info!(agent_id = %id, proxy = %proxy_url, "gateway proxy available but disabled (set MC_ENABLE_AUTH_GATEWAY=1 to enable)");
            }
        }

        cmd.cwd(&cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::AgentError(e.to_string()))?;

        let child_pid = child.process_id();

        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::AgentError(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::AgentError(e.to_string()))?;

        let info = AgentInfo {
            id: id.clone(),
            project_id: project_id.clone(),
            agent_type: agent_type.clone(),
            status: "starting".to_string(),
            prompt: prompt.clone(),
            pid: child_pid,
            session_id: None,
            token_usage: TokenUsage::default(),
            started_at: chrono::Utc::now().to_rfc3339(),
            cwd,
        };

        let session = AgentSession {
            info: info.clone(),
            writer,
            _master: pair.master,
            _hook_guard: hook_guard,
        };

        let use_hooks = session._hook_guard.is_some();

        self.agents.lock().unwrap().insert(id.clone(), session);
        info!(agent_id = %id, agent_type = %agent_type, hooks_active = use_hooks, "agent spawned");

        // Spawn dual-output reader thread
        Self::spawn_agent_reader(
            reader,
            id.clone(),
            project_id,
            agent_type,
            app_handle,
            Arc::clone(&self.agents),
            Arc::clone(&self.timeline),
            use_hooks,
        );

        // If hooks are active and a prompt was provided, send it via PTY
        // after a brief delay to let the agent start up.
        if use_hooks {
            if let Some(ref p) = prompt {
                let prompt_text = p.clone();
                let agents_ref = Arc::clone(&self.agents);
                let agent_id_clone = id.clone();
                std::thread::spawn(move || {
                    // Wait for Claude Code to initialize and show its prompt
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    if let Some(session) = agents_ref.lock().unwrap().get_mut(&agent_id_clone)
                    {
                        use std::io::Write;
                        let _ = session.writer.write_all(prompt_text.as_bytes());
                        let _ = session.writer.write_all(b"\n");
                        let _ = session.writer.flush();
                    }
                });
            }
        }

        Ok(info)
    }

    pub fn stop(&self, agent_id: &str) -> Result<(), AppError> {
        let pid = {
            let agents = self.agents.lock().unwrap();
            let session = agents
                .get(agent_id)
                .ok_or_else(|| AppError::AgentNotFound(agent_id.to_string()))?;
            session.info.pid
        };

        if let Some(pid) = pid {
            unsafe {
                libc::kill(pid as i32, libc::SIGTERM);
            }

            let pid_copy = pid;
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                unsafe {
                    if libc::kill(pid_copy as i32, 0) == 0 {
                        warn!(pid = pid_copy, "agent did not exit after SIGTERM, sending SIGKILL");
                        libc::kill(pid_copy as i32, libc::SIGKILL);
                    }
                }
            });
        }

        if let Ok(mut agents) = self.agents.lock() {
            if let Some(session) = agents.get_mut(agent_id) {
                session.info.status = "stopped".to_string();
            }
        }

        info!(agent_id = %agent_id, "agent stop requested");
        Ok(())
    }

    pub fn resume(
        &self,
        agent_id: &str,
        cols: u16,
        rows: u16,
        app_handle: AppHandle,
        hook_port: Option<u16>,
        hook_agents: Option<&Arc<Mutex<HashMap<String, HookAgentContext>>>>,
        gateway_proxy_url: Option<String>,
    ) -> Result<AgentInfo, AppError> {
        let (session_id, agent_type, project_id, cwd) = {
            let agents = self.agents.lock().unwrap();
            let session = agents
                .get(agent_id)
                .ok_or_else(|| AppError::AgentNotFound(agent_id.to_string()))?;
            (
                session.info.session_id.clone(),
                session.info.agent_type.clone(),
                session.info.project_id.clone(),
                session.info.cwd.clone(),
            )
        };

        let prompt = session_id.map(|sid| format!("--session-id {}", sid));

        self.spawn(
            project_id,
            agent_type,
            prompt,
            cwd,
            cols,
            rows,
            app_handle,
            hook_port,
            hook_agents,
            gateway_proxy_url,
        )
    }

    pub fn write(&self, agent_id: &str, data: &[u8]) -> Result<(), AppError> {
        let mut agents = self.agents.lock().unwrap();
        let session = agents
            .get_mut(agent_id)
            .ok_or_else(|| AppError::AgentNotFound(agent_id.to_string()))?;
        session
            .writer
            .write_all(data)
            .map_err(|e| AppError::AgentError(e.to_string()))?;
        session
            .writer
            .flush()
            .map_err(|e| AppError::AgentError(e.to_string()))?;
        Ok(())
    }

    pub fn resize(&self, agent_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let agents = self.agents.lock().unwrap();
        let session = agents
            .get(agent_id)
            .ok_or_else(|| AppError::AgentNotFound(agent_id.to_string()))?;
        session
            ._master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::AgentError(e.to_string()))?;
        info!(agent_id = %agent_id, cols, rows, "agent PTY resized");
        Ok(())
    }

    pub fn list(&self) -> Vec<AgentInfo> {
        let agents = self.agents.lock().unwrap();
        agents.values().map(|s| s.info.clone()).collect()
    }

    pub fn list_project(&self, project_id: &str) -> Vec<AgentInfo> {
        let agents = self.agents.lock().unwrap();
        agents
            .values()
            .filter(|s| s.info.project_id == project_id)
            .map(|s| s.info.clone())
            .collect()
    }

    pub fn get(&self, agent_id: &str) -> Result<AgentInfo, AppError> {
        let agents = self.agents.lock().unwrap();
        agents
            .get(agent_id)
            .map(|s| s.info.clone())
            .ok_or_else(|| AppError::AgentNotFound(agent_id.to_string()))
    }

    pub fn get_timeline(
        &self,
        project_id: &str,
        offset: usize,
        limit: usize,
    ) -> Vec<AgentEvent> {
        let timeline = self.timeline.lock().unwrap();
        timeline
            .iter()
            .filter(|e| e.project_id == project_id)
            .skip(offset)
            .take(limit)
            .cloned()
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    fn spawn_agent_reader(
        mut reader: Box<dyn Read + Send>,
        agent_id: String,
        project_id: String,
        agent_type: String,
        app_handle: AppHandle,
        agents: Arc<Mutex<HashMap<String, AgentSession>>>,
        timeline: Arc<Mutex<Vec<AgentEvent>>>,
        hooks_active: bool,
    ) {
        std::thread::spawn(move || {
            // Only create parser when hooks are NOT active (fallback for -p mode or non-claude agents)
            let mut parser = if !hooks_active {
                Some(parsers::create_parser(&agent_type, &agent_id, &project_id))
            } else {
                None
            };
            let mut buf = [0u8; 4096];
            let mut line_buf = String::new();
            let mut first_output = true;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF — flush remaining line_buf (parser mode only)
                        if let Some(ref mut p) = parser {
                            if !line_buf.is_empty() {
                                let remaining = std::mem::take(&mut line_buf);
                                if let Some(event) = p.parse_line(&remaining) {
                                    timeline.lock().unwrap().push(event.clone());
                                    let usage = p.get_token_usage();
                                    let _ = AgentStatusEvent {
                                        agent_id: agent_id.clone(),
                                        status: "running".to_string(),
                                        event: Some(event),
                                        token_usage: Some(usage),
                                    }
                                    .emit(&app_handle);
                                }
                            }
                        }

                        info!(agent_id = %agent_id, "agent EOF");
                        let _ = AgentExitEvent {
                            agent_id: agent_id.clone(),
                            exit_code: None,
                        }
                        .emit(&app_handle);
                        break;
                    }
                    Ok(n) => {
                        let data = &buf[..n];

                        // 1. Always emit raw bytes for xterm
                        let _ = AgentOutputEvent {
                            agent_id: agent_id.clone(),
                            data: data.to_vec(),
                        }
                        .emit(&app_handle);

                        // 2. Auto-transition to "running" on first output
                        if first_output {
                            first_output = false;
                            if let Ok(mut agents) = agents.lock() {
                                if let Some(session) = agents.get_mut(&agent_id) {
                                    session.info.status = "running".to_string();
                                }
                            }
                            let _ = AgentStatusEvent {
                                agent_id: agent_id.clone(),
                                status: "running".to_string(),
                                event: None,
                                token_usage: None,
                            }
                            .emit(&app_handle);
                        }

                        // 3. Line-buffer for parser (skip when hooks handle structured events)
                        if let Some(ref mut p) = parser {
                            let text = String::from_utf8_lossy(data);
                            line_buf.push_str(&text);

                            // Process complete lines
                            while let Some(newline_pos) = line_buf.find('\n') {
                                let line: String = line_buf[..newline_pos].to_string();
                                line_buf = line_buf[newline_pos + 1..].to_string();

                                if let Some(event) = p.parse_line(&line) {
                                    timeline.lock().unwrap().push(event.clone());

                                    let usage = p.get_token_usage();

                                    if let Ok(mut agents) = agents.lock() {
                                        if let Some(session) = agents.get_mut(&agent_id) {
                                            session.info.token_usage = usage.clone();
                                        }
                                    }

                                    let _ = AgentStatusEvent {
                                        agent_id: agent_id.clone(),
                                        status: "running".to_string(),
                                        event: Some(event),
                                        token_usage: Some(usage),
                                    }
                                    .emit(&app_handle);
                                }

                                if let Some(new_status) = p.detect_status(&line) {
                                    if let Ok(mut agents) = agents.lock() {
                                        if let Some(session) = agents.get_mut(&agent_id) {
                                            session.info.status = new_status.clone();
                                        }
                                    }
                                    let _ = AgentStatusEvent {
                                        agent_id: agent_id.clone(),
                                        status: new_status,
                                        event: None,
                                        token_usage: Some(p.get_token_usage()),
                                    }
                                    .emit(&app_handle);
                                }

                                if let Some(sid) = p.extract_session_id(&line) {
                                    if let Ok(mut agents) = agents.lock() {
                                        if let Some(session) = agents.get_mut(&agent_id) {
                                            session.info.session_id = Some(sid);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!(agent_id = %agent_id, error = %e, "agent read error");
                        let _ = AgentExitEvent {
                            agent_id: agent_id.clone(),
                            exit_code: None,
                        }
                        .emit(&app_handle);
                        break;
                    }
                }
            }

            // Cleanup: update status if not already set
            if let Ok(mut agents) = agents.lock() {
                if let Some(session) = agents.get_mut(&agent_id) {
                    if session.info.status != "stopped" && session.info.status != "completed" {
                        session.info.status = "completed".to_string();
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_service_empty() {
        let timeline = Arc::new(Mutex::new(Vec::new()));
        let svc = AgentService::new(timeline);
        assert!(svc.list().is_empty());
    }

    #[test]
    fn test_timeline_empty() {
        let timeline = Arc::new(Mutex::new(Vec::new()));
        let svc = AgentService::new(timeline);
        let result = svc.get_timeline("any-project", 0, 100);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_nonexistent_agent() {
        let timeline = Arc::new(Mutex::new(Vec::new()));
        let svc = AgentService::new(timeline);
        let result = svc.get("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_write_nonexistent_agent() {
        let timeline = Arc::new(Mutex::new(Vec::new()));
        let svc = AgentService::new(timeline);
        let result = svc.write("nonexistent", b"hello");
        assert!(result.is_err());
    }

    #[test]
    fn test_stop_nonexistent_agent() {
        let timeline = Arc::new(Mutex::new(Vec::new()));
        let svc = AgentService::new(timeline);
        let result = svc.stop("nonexistent");
        assert!(result.is_err());
    }
}
