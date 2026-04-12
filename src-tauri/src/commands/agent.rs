use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::models::{AgentEvent, AgentInfo, AppError};
use crate::services::auth_gateway::AuthGateway;
use crate::services::hook_server::HookServerState;
use crate::services::AgentService;

#[tauri::command]
#[specta::specta]
pub fn spawn_agent(
    project_id: String,
    agent_type: String,
    prompt: Option<String>,
    cwd: String,
    resume_session_id: Option<String>,
    service: State<'_, Arc<AgentService>>,
    hook_state: State<'_, Arc<HookServerState>>,
    gateway: State<'_, Arc<AuthGateway>>,
    app_handle: AppHandle,
) -> Result<AgentInfo, AppError> {
    let proxy_url = gateway.proxy_url();

    let info = service.spawn(
        project_id,
        agent_type,
        prompt,
        cwd,
        80,
        24,
        app_handle,
        Some(hook_state.port),
        Some(&hook_state.agents),
        Some(proxy_url),
        resume_session_id,
    )?;

    // Create a gateway session for this agent
    gateway.create_session(&info.id);

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub fn stop_agent(
    agent_id: String,
    service: State<'_, Arc<AgentService>>,
    hook_state: State<'_, Arc<HookServerState>>,
    gateway: State<'_, Arc<AuthGateway>>,
) -> Result<(), AppError> {
    // Revoke the gateway session on stop
    gateway.revoke_session(&agent_id);
    // Unregister from hook server so stale events are rejected
    if let Ok(mut agents_map) = hook_state.agents.lock() {
        agents_map.remove(&agent_id);
    }
    service.stop(&agent_id)
}

#[tauri::command]
#[specta::specta]
pub fn resume_agent(
    agent_id: String,
    service: State<'_, Arc<AgentService>>,
    hook_state: State<'_, Arc<HookServerState>>,
    gateway: State<'_, Arc<AuthGateway>>,
    app_handle: AppHandle,
) -> Result<AgentInfo, AppError> {
    let proxy_url = gateway.proxy_url();

    let info = service.resume(
        &agent_id,
        80,
        24,
        app_handle,
        Some(hook_state.port),
        Some(&hook_state.agents),
        Some(proxy_url),
    )?;

    // Create a new gateway session for the resumed agent
    gateway.create_session(&info.id);

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub fn write_agent(
    agent_id: String,
    data: Vec<u8>,
    service: State<'_, Arc<AgentService>>,
) -> Result<(), AppError> {
    service.write(&agent_id, &data)
}

#[tauri::command]
#[specta::specta]
pub fn resize_agent(
    agent_id: String,
    cols: u16,
    rows: u16,
    service: State<'_, Arc<AgentService>>,
) -> Result<(), AppError> {
    service.resize(&agent_id, cols, rows)
}

#[tauri::command]
#[specta::specta]
pub fn list_agents(
    project_id: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<Vec<AgentInfo>, AppError> {
    match project_id {
        Some(pid) => Ok(service.list_project(&pid)),
        None => Ok(service.list()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_agent(
    agent_id: String,
    service: State<'_, Arc<AgentService>>,
) -> Result<AgentInfo, AppError> {
    service.get(&agent_id)
}

#[tauri::command]
#[specta::specta]
pub fn get_timeline(
    project_id: String,
    offset: usize,
    limit: usize,
    service: State<'_, Arc<AgentService>>,
) -> Result<Vec<AgentEvent>, AppError> {
    Ok(service.get_timeline(&project_id, offset, limit))
}
