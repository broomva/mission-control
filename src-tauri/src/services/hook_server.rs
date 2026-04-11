use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::extract::{Query, State};
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;
use tauri::AppHandle;
use tauri_specta::Event;
use tracing::{error, info, warn};

use crate::models::{AgentEvent, AgentStatusEvent, TokenUsage};
use crate::services::git::GitService;

/// Context stored per agent for hook correlation.
pub struct HookAgentContext {
    pub project_id: String,
    pub project_path: Option<String>,
}

/// Shared state for the hook server.
pub struct HookServerState {
    pub port: u16,
    pub agents: Arc<Mutex<HashMap<String, HookAgentContext>>>,
    #[allow(dead_code)]
    session_map: Arc<Mutex<HashMap<String, String>>>,
    #[allow(dead_code)]
    app_handle: AppHandle,
    #[allow(dead_code)]
    timeline: Arc<Mutex<Vec<AgentEvent>>>,
}

#[derive(Clone)]
struct AppState {
    agents: Arc<Mutex<HashMap<String, HookAgentContext>>>,
    session_map: Arc<Mutex<HashMap<String, String>>>,
    app_handle: AppHandle,
    timeline: Arc<Mutex<Vec<AgentEvent>>>,
    git_service: Arc<GitService>,
    /// Rate limiter: agent_id -> last checkpoint timestamp (unix seconds)
    checkpoint_rate: Arc<Mutex<HashMap<String, i64>>>,
}

#[derive(Deserialize)]
struct AgentQuery {
    agent_id: Option<String>,
}

/// Generic Claude Code hook payload — we only extract the fields we need.
#[derive(Deserialize)]
struct HookPayload {
    /// The hook event name (e.g. "PreToolUse", "PostToolUse")
    #[serde(default)]
    #[allow(dead_code)]
    event: Option<String>,
    /// Session ID from Claude Code
    #[serde(default)]
    session_id: Option<String>,
    /// Tool name (for PreToolUse/PostToolUse)
    #[serde(default)]
    tool_name: Option<String>,
    /// Tool input (for PreToolUse)
    #[serde(default)]
    tool_input: Option<serde_json::Value>,
    /// Message/notification text
    #[serde(default)]
    message: Option<String>,
    /// Model used (from SessionStart)
    #[serde(default)]
    model: Option<String>,
    /// Transcript path (from SessionStart)
    #[serde(default)]
    #[allow(dead_code)]
    transcript_path: Option<String>,
    /// Token usage (from Stop/SessionEnd)
    #[serde(default)]
    usage: Option<HookUsage>,
    /// Stop reason
    #[serde(default)]
    stop_reason: Option<String>,
    /// Error message (for PostToolUseFailure)
    #[serde(default)]
    error: Option<String>,
}

#[derive(Deserialize, Default)]
struct HookUsage {
    #[serde(default)]
    input_tokens: u64,
    #[serde(default)]
    output_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
}

/// Pricing per million tokens.
const SONNET_INPUT_PER_MILLION: f64 = 3.0;
const SONNET_OUTPUT_PER_MILLION: f64 = 15.0;

fn compute_cost(usage: &TokenUsage) -> f64 {
    let input_cost =
        (usage.input_tokens + usage.cache_read_tokens + usage.cache_creation_tokens) as f64
            * SONNET_INPUT_PER_MILLION
            / 1_000_000.0;
    let output_cost = usage.output_tokens as f64 * SONNET_OUTPUT_PER_MILLION / 1_000_000.0;
    input_cost + output_cost
}

/// Map Claude Code tool names to our event_type categories.
fn tool_name_to_event_type(tool_name: &str) -> &'static str {
    match tool_name {
        "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => "file_write",
        "Bash" | "BashTool" => "command_exec",
        _ => "tool_use",
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Resolve agent_id from query param or session_map fallback.
fn resolve_agent_id(
    query_agent_id: &Option<String>,
    session_id: &Option<String>,
    session_map: &Mutex<HashMap<String, String>>,
) -> Option<String> {
    // Primary: query parameter
    if let Some(id) = query_agent_id {
        if !id.is_empty() {
            return Some(id.clone());
        }
    }
    // Fallback: session_id -> agent_id map
    if let Some(sid) = session_id {
        if let Ok(map) = session_map.lock() {
            if let Some(aid) = map.get(sid) {
                return Some(aid.clone());
            }
        }
    }
    None
}

fn make_event(agent_id: &str, project_id: &str, event_type: &str, summary: String) -> AgentEvent {
    AgentEvent {
        agent_id: agent_id.to_string(),
        project_id: project_id.to_string(),
        timestamp: now_iso(),
        event_type: event_type.to_string(),
        summary,
        detail: None,
    }
}

fn emit_status(state: &AppState, agent_id: &str, event: AgentEvent, token_usage: Option<TokenUsage>) {
    state.timeline.lock().unwrap().push(event.clone());
    let _ = AgentStatusEvent {
        agent_id: agent_id.to_string(),
        status: "running".to_string(),
        event: Some(event),
        token_usage,
    }
    .emit(&state.app_handle);
}

fn get_project_id(agent_id: &str, agents: &Mutex<HashMap<String, HookAgentContext>>) -> String {
    agents
        .lock()
        .ok()
        .and_then(|map| map.get(agent_id).map(|ctx| ctx.project_id.clone()))
        .unwrap_or_default()
}

fn get_project_path(agent_id: &str, agents: &Mutex<HashMap<String, HookAgentContext>>) -> Option<String> {
    agents
        .lock()
        .ok()
        .and_then(|map| map.get(agent_id).and_then(|ctx| ctx.project_path.clone()))
}

// ─── Route Handlers ───

async fn handle_session_start(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => {
            warn!("session-start: could not resolve agent_id");
            return;
        }
    };

    // Register session_id -> agent_id mapping
    if let Some(sid) = &payload.session_id {
        state
            .session_map
            .lock()
            .unwrap()
            .insert(sid.clone(), agent_id.clone());
    }

    let project_id = get_project_id(&agent_id, &state.agents);
    let model = payload.model.as_deref().unwrap_or("unknown");
    let summary = format!("Session started (model: {})", model);
    let event = make_event(&agent_id, &project_id, "status_change", summary);
    emit_status(&state, &agent_id, event, None);
    info!(agent_id = %agent_id, "hook: session-start");
}

/// Minimum seconds between auto-checkpoints per agent.
const CHECKPOINT_RATE_LIMIT_SECS: i64 = 30;

async fn handle_pre_tool_use(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let tool_name = payload.tool_name.as_deref().unwrap_or("unknown");
    let event_type = tool_name_to_event_type(tool_name);

    let summary = match event_type {
        "file_write" => {
            let path = payload
                .tool_input
                .as_ref()
                .and_then(|v| v.get("file_path").or_else(|| v.get("path")))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("{}: {}", tool_name, truncate(path, 50))
        }
        "command_exec" => {
            let cmd = payload
                .tool_input
                .as_ref()
                .and_then(|v| v.get("command"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("$ {}", truncate(cmd, 50))
        }
        _ => format!("Using tool: {}", tool_name),
    };

    // Auto-checkpoint for file-modifying tools (rate-limited)
    if event_type == "file_write" || event_type == "command_exec" {
        if let Some(project_path) = get_project_path(&agent_id, &state.agents) {
            let now_secs = chrono::Utc::now().timestamp();
            let should_checkpoint = {
                let mut rate = state.checkpoint_rate.lock().unwrap();
                let last = rate.get(&agent_id).copied().unwrap_or(0);
                if now_secs - last >= CHECKPOINT_RATE_LIMIT_SECS {
                    rate.insert(agent_id.clone(), now_secs);
                    true
                } else {
                    false
                }
            };

            if should_checkpoint {
                let cp_desc = format!("Before {}: {}", tool_name, truncate(&summary, 60));
                if let Err(e) = state.git_service.create_checkpoint(
                    &project_id,
                    &project_path,
                    &cp_desc,
                    Some(&agent_id),
                ) {
                    warn!(agent_id = %agent_id, error = %e, "auto-checkpoint failed");
                }
            }
        }
    }

    let event = make_event(&agent_id, &project_id, event_type, summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_post_tool_use(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let tool_name = payload.tool_name.as_deref().unwrap_or("unknown");
    let event_type = tool_name_to_event_type(tool_name);
    let summary = format!("Completed: {}", tool_name);

    let event = make_event(&agent_id, &project_id, event_type, summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_post_tool_use_failure(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let tool_name = payload.tool_name.as_deref().unwrap_or("unknown");
    let error_msg = payload.error.as_deref().unwrap_or("unknown error");
    let summary = format!("Tool failed: {} — {}", tool_name, truncate(error_msg, 40));

    let event = make_event(&agent_id, &project_id, "error", summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_stop(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let reason = payload.stop_reason.as_deref().unwrap_or("end_turn");
    let summary = format!("Response complete ({})", reason);

    let token_usage = payload.usage.map(|u| {
        let mut usage = TokenUsage {
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
            cache_read_tokens: u.cache_read_input_tokens,
            cache_creation_tokens: u.cache_creation_input_tokens,
            cost_usd: 0.0,
        };
        usage.cost_usd = compute_cost(&usage);
        usage
    });

    let event = make_event(&agent_id, &project_id, "status_change", summary);
    emit_status(&state, &agent_id, event, token_usage);
}

async fn handle_subagent_start(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let tool_name = payload.tool_name.as_deref().unwrap_or("subagent");
    let summary = format!("Subagent started: {}", tool_name);

    let event = make_event(&agent_id, &project_id, "subagent", summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_subagent_stop(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let tool_name = payload.tool_name.as_deref().unwrap_or("subagent");
    let summary = format!("Subagent finished: {}", tool_name);

    let event = make_event(&agent_id, &project_id, "subagent", summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_notification(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);
    let message = payload.message.as_deref().unwrap_or("Notification");
    let summary = truncate(message, 80).to_string();

    let event = make_event(&agent_id, &project_id, "notification", summary);
    emit_status(&state, &agent_id, event, None);
}

async fn handle_session_end(
    Query(q): Query<AgentQuery>,
    State(state): State<AppState>,
    Json(payload): Json<HookPayload>,
) {
    let agent_id = match resolve_agent_id(&q.agent_id, &payload.session_id, &state.session_map) {
        Some(id) => id,
        None => return,
    };

    let project_id = get_project_id(&agent_id, &state.agents);

    let token_usage = payload.usage.map(|u| {
        let mut usage = TokenUsage {
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
            cache_read_tokens: u.cache_read_input_tokens,
            cache_creation_tokens: u.cache_creation_input_tokens,
            cost_usd: 0.0,
        };
        usage.cost_usd = compute_cost(&usage);
        usage
    });

    let summary = if let Some(ref u) = token_usage {
        format!(
            "Session ended ({}in/{}out, ${:.4})",
            u.input_tokens, u.output_tokens, u.cost_usd
        )
    } else {
        "Session ended".to_string()
    };

    let event = make_event(&agent_id, &project_id, "status_change", summary);
    emit_status(&state, &agent_id, event, token_usage);

    // Clean up session mapping
    if let Some(sid) = &payload.session_id {
        state.session_map.lock().unwrap().remove(sid);
    }

    info!(agent_id = %agent_id, "hook: session-end");
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

/// Start the hook server on a random free port. Returns the shared state.
pub async fn start_hook_server(
    app_handle: AppHandle,
    timeline: Arc<Mutex<Vec<AgentEvent>>>,
    git_service: Arc<GitService>,
) -> Result<HookServerState, Box<dyn std::error::Error>> {
    let agents: Arc<Mutex<HashMap<String, HookAgentContext>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let session_map: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));

    let app_state = AppState {
        agents: Arc::clone(&agents),
        session_map: Arc::clone(&session_map),
        app_handle: app_handle.clone(),
        timeline: Arc::clone(&timeline),
        git_service,
        checkpoint_rate: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/hooks/session-start", post(handle_session_start))
        .route("/hooks/pre-tool-use", post(handle_pre_tool_use))
        .route("/hooks/post-tool-use", post(handle_post_tool_use))
        .route(
            "/hooks/post-tool-use-failure",
            post(handle_post_tool_use_failure),
        )
        .route("/hooks/stop", post(handle_stop))
        .route("/hooks/subagent-start", post(handle_subagent_start))
        .route("/hooks/subagent-stop", post(handle_subagent_stop))
        .route("/hooks/notification", post(handle_notification))
        .route("/hooks/session-end", post(handle_session_end))
        .with_state(app_state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    info!(port = port, "hook server started");

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            error!(error = %e, "hook server error");
        }
    });

    Ok(HookServerState {
        port,
        agents,
        session_map,
        app_handle,
        timeline,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_agent_id_from_query() {
        let session_map = Mutex::new(HashMap::new());
        let result = resolve_agent_id(&Some("agent-123".to_string()), &None, &session_map);
        assert_eq!(result, Some("agent-123".to_string()));
    }

    #[test]
    fn test_resolve_agent_id_from_session_map() {
        let session_map = Mutex::new(HashMap::new());
        session_map
            .lock()
            .unwrap()
            .insert("sess-abc".to_string(), "agent-456".to_string());

        let result = resolve_agent_id(&None, &Some("sess-abc".to_string()), &session_map);
        assert_eq!(result, Some("agent-456".to_string()));
    }

    #[test]
    fn test_resolve_agent_id_none() {
        let session_map = Mutex::new(HashMap::new());
        let result = resolve_agent_id(&None, &None, &session_map);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_agent_id_query_takes_precedence() {
        let session_map = Mutex::new(HashMap::new());
        session_map
            .lock()
            .unwrap()
            .insert("sess-abc".to_string(), "agent-from-session".to_string());

        let result = resolve_agent_id(
            &Some("agent-from-query".to_string()),
            &Some("sess-abc".to_string()),
            &session_map,
        );
        assert_eq!(result, Some("agent-from-query".to_string()));
    }

    #[test]
    fn test_tool_name_to_event_type() {
        assert_eq!(tool_name_to_event_type("Write"), "file_write");
        assert_eq!(tool_name_to_event_type("Edit"), "file_write");
        assert_eq!(tool_name_to_event_type("MultiEdit"), "file_write");
        assert_eq!(tool_name_to_event_type("NotebookEdit"), "file_write");
        assert_eq!(tool_name_to_event_type("Bash"), "command_exec");
        assert_eq!(tool_name_to_event_type("BashTool"), "command_exec");
        assert_eq!(tool_name_to_event_type("Read"), "tool_use");
        assert_eq!(tool_name_to_event_type("Grep"), "tool_use");
        assert_eq!(tool_name_to_event_type("Glob"), "tool_use");
        assert_eq!(tool_name_to_event_type("WebFetch"), "tool_use");
        assert_eq!(tool_name_to_event_type("Task"), "tool_use");
        assert_eq!(tool_name_to_event_type("unknown_mcp_tool"), "tool_use");
    }

    #[test]
    fn test_compute_cost() {
        let usage = TokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            cost_usd: 0.0,
        };
        let cost = compute_cost(&usage);
        assert!((cost - 18.0).abs() < 0.001);
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 5), "hello");
        assert_eq!(truncate("", 5), "");
    }
}
