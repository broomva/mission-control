use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct WorkspaceState {
    pub layout: Option<String>,
    pub active_project_id: Option<String>,
}
