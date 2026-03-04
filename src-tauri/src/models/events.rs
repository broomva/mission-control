use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct TerminalDataEvent {
    pub terminal_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct TerminalExitEvent {
    pub terminal_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct FsChangeEvent {
    pub project_id: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct GitRefChangedEvent {
    pub project_id: String,
}
