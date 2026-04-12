use serde::{Deserialize, Serialize};
use specta::Type;

/// A Claude Code session read from ~/.claude/sessions/*.json
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ClaudeSession {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub started_at: f64,
    pub kind: String,
    pub entrypoint: String,
}
