use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentInfo {
    pub id: String,
    pub project_id: String,
    pub agent_type: String,
    pub status: String,
    pub prompt: Option<String>,
    pub pid: Option<u32>,
    pub session_id: Option<String>,
    pub token_usage: TokenUsage,
    pub started_at: String,
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentEvent {
    pub agent_id: String,
    pub project_id: String,
    pub timestamp: String,
    pub event_type: String,
    pub summary: String,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelPricing {
    pub model_id: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
}
