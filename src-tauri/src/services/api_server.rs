use std::sync::Arc;
use std::time::Instant;

use axum::extract::{Path, Query, State as AxumState};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::models::{AgentInfo, AppError};
use crate::models::git::CheckpointInfo;
use crate::models::Project;
use crate::services::auth_gateway::AuthGateway;
use crate::services::hook_server::HookServerState;
use crate::services::{AgentService, GitService, ProjectService};

// ── Shared state ──────────────────────────────────────────────────

#[derive(Clone)]
struct ApiState {
    project_service: Arc<ProjectService>,
    agent_service: Arc<AgentService>,
    git_service: Arc<GitService>,
    hook_state: Arc<HookServerState>,
    gateway: Arc<AuthGateway>,
    started_at: Instant,
}

// ── Query / body types ────────────────────────────────────────────

#[derive(Deserialize)]
struct ProjectQuery {
    project: Option<String>,
}

#[derive(Deserialize)]
struct SpawnRequest {
    project_id: String,
    agent_type: String,
    prompt: Option<String>,
    #[allow(dead_code)]
    model: Option<String>,
}

// ── Response types ────────────────────────────────────────────────

#[derive(Serialize)]
struct StatusResponse {
    version: String,
    uptime_secs: u64,
    agent_count: usize,
    gateway_port: u16,
    hook_port: u16,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// ── Helpers ───────────────────────────────────────────────────────

fn app_error_to_status(e: &AppError) -> StatusCode {
    match e {
        AppError::ProjectNotFound(_) | AppError::AgentNotFound(_) => StatusCode::NOT_FOUND,
        AppError::ProjectAlreadyExists(_) => StatusCode::CONFLICT,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn err_json(e: AppError) -> (StatusCode, Json<ErrorResponse>) {
    let status = app_error_to_status(&e);
    (
        status,
        Json(ErrorResponse {
            error: e.to_string(),
        }),
    )
}

// ── Route handlers ────────────────────────────────────────────────

async fn handle_status(AxumState(state): AxumState<ApiState>) -> Json<StatusResponse> {
    let agent_count = state.agent_service.list().len();
    Json(StatusResponse {
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs: state.started_at.elapsed().as_secs(),
        agent_count,
        gateway_port: state.gateway.port,
        hook_port: state.hook_state.port,
    })
}

async fn handle_list_projects(
    AxumState(state): AxumState<ApiState>,
) -> Json<Vec<Project>> {
    Json(state.project_service.list())
}

async fn handle_list_agents(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<ProjectQuery>,
) -> Json<Vec<AgentInfo>> {
    match q.project {
        Some(pid) => Json(state.agent_service.list_project(&pid)),
        None => Json(state.agent_service.list()),
    }
}

async fn handle_spawn_agent(
    AxumState(state): AxumState<ApiState>,
    Json(body): Json<SpawnRequest>,
) -> Result<Json<AgentInfo>, (StatusCode, Json<ErrorResponse>)> {
    // Resolve the project to get its path for the agent cwd
    let project = state
        .project_service
        .get(&body.project_id)
        .map_err(err_json)?;

    let proxy_url = state.gateway.proxy_url();

    let info = state
        .agent_service
        .spawn(
            body.project_id,
            body.agent_type,
            body.prompt,
            project.path,
            80,
            24,
            state.hook_state.app_handle.clone(),
            Some(state.hook_state.port),
            Some(&state.hook_state.agents),
            Some(proxy_url),
            None,
        )
        .map_err(err_json)?;

    // Create a gateway session for the agent
    state.gateway.create_session(&info.id);

    Ok(Json(info))
}

async fn handle_stop_agent(
    AxumState(state): AxumState<ApiState>,
    Path(agent_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    state.gateway.revoke_session(&agent_id);
    state.agent_service.stop(&agent_id).map_err(err_json)?;
    Ok(Json(serde_json::json!({ "stopped": agent_id })))
}

async fn handle_list_checkpoints(
    AxumState(state): AxumState<ApiState>,
    Query(q): Query<ProjectQuery>,
) -> Result<Json<Vec<CheckpointInfo>>, (StatusCode, Json<ErrorResponse>)> {
    let project_id = q.project.unwrap_or_default();
    if project_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "query parameter 'project' is required".to_string(),
            }),
        ));
    }

    let project = state
        .project_service
        .get(&project_id)
        .map_err(err_json)?;

    let checkpoints = state
        .git_service
        .list_checkpoints(&project_id, &project.path)
        .map_err(|e| err_json(e))?;

    Ok(Json(checkpoints))
}

// ── Server startup ────────────────────────────────────────────────

/// Start the REST API server on a fixed port (default 19420, configurable via MC_API_PORT).
pub async fn start_api_server(
    project_service: Arc<ProjectService>,
    agent_service: Arc<AgentService>,
    git_service: Arc<GitService>,
    hook_state: Arc<HookServerState>,
    gateway: Arc<AuthGateway>,
) -> Result<u16, Box<dyn std::error::Error>> {
    let port: u16 = std::env::var("MC_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(19420);

    let state = ApiState {
        project_service,
        agent_service,
        git_service,
        hook_state,
        gateway,
        started_at: Instant::now(),
    };

    let app = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/projects", get(handle_list_projects))
        .route("/api/agents", get(handle_list_agents))
        .route("/api/agents/spawn", post(handle_spawn_agent))
        .route("/api/agents/{id}/stop", post(handle_stop_agent))
        .route("/api/checkpoints", get(handle_list_checkpoints))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    let actual_port = listener.local_addr()?.port();
    info!(port = actual_port, "API server started on http://127.0.0.1:{}", actual_port);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            error!(error = %e, "API server error");
        }
    });

    Ok(actual_port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_response_serializes() {
        let resp = StatusResponse {
            version: "0.1.0".to_string(),
            uptime_secs: 42,
            agent_count: 3,
            gateway_port: 19421,
            hook_port: 12345,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"version\":\"0.1.0\""));
        assert!(json.contains("\"agent_count\":3"));
    }

    #[test]
    fn error_response_serializes() {
        let resp = ErrorResponse {
            error: "not found".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"error\":\"not found\""));
    }

    #[test]
    fn app_error_maps_to_correct_status() {
        assert_eq!(
            app_error_to_status(&AppError::ProjectNotFound("x".into())),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            app_error_to_status(&AppError::AgentNotFound("x".into())),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            app_error_to_status(&AppError::ProjectAlreadyExists("x".into())),
            StatusCode::CONFLICT
        );
        assert_eq!(
            app_error_to_status(&AppError::IoError("x".into())),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn spawn_request_deserializes() {
        let json = r#"{"project_id":"p1","agent_type":"claude-code","prompt":"fix bug"}"#;
        let req: SpawnRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.project_id, "p1");
        assert_eq!(req.agent_type, "claude-code");
        assert_eq!(req.prompt, Some("fix bug".to_string()));
        assert!(req.model.is_none());
    }

    #[test]
    fn spawn_request_minimal() {
        let json = r#"{"project_id":"p1","agent_type":"claude-code"}"#;
        let req: SpawnRequest = serde_json::from_str(json).unwrap();
        assert!(req.prompt.is_none());
        assert!(req.model.is_none());
    }
}
