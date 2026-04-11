use std::sync::Arc;

use tauri::State;

use crate::models::AppError;
use crate::services::auth_gateway::{AuthGateway, GatewayStatus};
use crate::services::credential_store::CredentialStore;

#[tauri::command]
#[specta::specta]
pub fn list_credentials(store: State<'_, Arc<CredentialStore>>) -> Result<Vec<String>, AppError> {
    Ok(store.list_services())
}

#[tauri::command]
#[specta::specta]
pub fn add_credential(
    service: String,
    key: String,
    store: State<'_, Arc<CredentialStore>>,
) -> Result<(), AppError> {
    if service.is_empty() {
        return Err(AppError::AgentError("service name cannot be empty".into()));
    }
    if key.is_empty() {
        return Err(AppError::AgentError("API key cannot be empty".into()));
    }
    store.add(&service, &key);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn remove_credential(
    service: String,
    store: State<'_, Arc<CredentialStore>>,
) -> Result<(), AppError> {
    store.remove(&service);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_gateway_status(
    gateway: State<'_, AuthGateway>,
) -> Result<GatewayStatus, AppError> {
    Ok(gateway.status())
}
