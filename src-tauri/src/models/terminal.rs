use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TerminalInfo {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub cols: u16,
    pub rows: u16,
}