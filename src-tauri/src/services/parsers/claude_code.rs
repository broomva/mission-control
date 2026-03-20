use crate::models::{AgentEvent, TokenUsage};

use super::{strip_ansi, AgentOutputParser};

/// Pricing per million tokens for known models.
const SONNET_INPUT_PER_MILLION: f64 = 3.0;
const SONNET_OUTPUT_PER_MILLION: f64 = 15.0;

/// JSON-only parser for Claude Code's `--output-format stream-json` mode.
/// Used as a fallback for non-interactive `-p` mode and non-Claude agents.
/// Interactive mode timeline is now handled by the hook server.
pub struct ClaudeCodeParser {
    agent_id: String,
    project_id: String,
    accumulated_usage: TokenUsage,
}

impl ClaudeCodeParser {
    pub fn new(agent_id: &str, project_id: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            project_id: project_id.to_string(),
            accumulated_usage: TokenUsage::default(),
        }
    }

    fn now_iso(&self) -> String {
        chrono::Utc::now().to_rfc3339()
    }

    fn compute_cost(usage: &TokenUsage) -> f64 {
        let input_cost =
            (usage.input_tokens + usage.cache_read_tokens + usage.cache_creation_tokens) as f64
                * SONNET_INPUT_PER_MILLION
                / 1_000_000.0;
        let output_cost = usage.output_tokens as f64 * SONNET_OUTPUT_PER_MILLION / 1_000_000.0;
        input_cost + output_cost
    }

    fn parse_json(&mut self, value: &serde_json::Value) -> Option<AgentEvent> {
        let event_type = value.get("type")?.as_str()?;

        match event_type {
            "system" => {
                let summary = "Agent session started".to_string();
                Some(AgentEvent {
                    agent_id: self.agent_id.clone(),
                    project_id: self.project_id.clone(),
                    timestamp: self.now_iso(),
                    event_type: "status_change".to_string(),
                    summary,
                    detail: Some(value.to_string()),
                })
            }

            "assistant" => {
                if let Some(usage) = value.get("usage") {
                    self.update_usage(usage);
                }
                if let Some(message) = value.get("message") {
                    if let Some(usage) = message.get("usage") {
                        self.update_usage(usage);
                    }
                }

                let model = value
                    .get("message")
                    .and_then(|m| m.get("model"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown");

                Some(AgentEvent {
                    agent_id: self.agent_id.clone(),
                    project_id: self.project_id.clone(),
                    timestamp: self.now_iso(),
                    event_type: "token_usage".to_string(),
                    summary: format!(
                        "Token usage: {}in/{}out (model: {})",
                        self.accumulated_usage.input_tokens,
                        self.accumulated_usage.output_tokens,
                        model,
                    ),
                    detail: Some(
                        serde_json::to_string(&self.accumulated_usage).unwrap_or_default(),
                    ),
                })
            }

            "content_block_start" => {
                let content_block = value.get("content_block")?;
                let block_type = content_block.get("type")?.as_str()?;

                if block_type == "tool_use" {
                    let tool_name = content_block
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("unknown_tool");

                    Some(AgentEvent {
                        agent_id: self.agent_id.clone(),
                        project_id: self.project_id.clone(),
                        timestamp: self.now_iso(),
                        event_type: "tool_use".to_string(),
                        summary: format!("Using tool: {}", tool_name),
                        detail: Some(content_block.to_string()),
                    })
                } else {
                    None
                }
            }

            "result" => {
                if let Some(usage) = value.get("usage") {
                    self.update_usage(usage);
                }

                let cost = Self::compute_cost(&self.accumulated_usage);
                self.accumulated_usage.cost_usd = cost;

                Some(AgentEvent {
                    agent_id: self.agent_id.clone(),
                    project_id: self.project_id.clone(),
                    timestamp: self.now_iso(),
                    event_type: "status_change".to_string(),
                    summary: format!(
                        "Completed ({}in/{}out, ${:.4})",
                        self.accumulated_usage.input_tokens,
                        self.accumulated_usage.output_tokens,
                        cost,
                    ),
                    detail: Some(
                        serde_json::to_string(&self.accumulated_usage).unwrap_or_default(),
                    ),
                })
            }

            _ => None,
        }
    }

    fn update_usage(&mut self, usage: &serde_json::Value) {
        if let Some(input) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
            self.accumulated_usage.input_tokens = input;
        }
        if let Some(output) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
            self.accumulated_usage.output_tokens = output;
        }
        if let Some(cache_read) = usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_u64())
        {
            self.accumulated_usage.cache_read_tokens = cache_read;
        }
        if let Some(cache_creation) = usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_u64())
        {
            self.accumulated_usage.cache_creation_tokens = cache_creation;
        }
        self.accumulated_usage.cost_usd = Self::compute_cost(&self.accumulated_usage);
    }
}

impl AgentOutputParser for ClaudeCodeParser {
    fn parse_line(&mut self, line: &str) -> Option<AgentEvent> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }

        // 1. Try direct JSON parsing (for stream-json mode with -p)
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
            return self.parse_json(&value);
        }

        // 2. Strip ANSI and try JSON again (JSON might be wrapped in escape codes)
        let stripped = strip_ansi(trimmed);
        let stripped = stripped.trim();
        if !stripped.is_empty() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(stripped) {
                return self.parse_json(&value);
            }
        }

        None
    }

    fn detect_status(&self, line: &str) -> Option<String> {
        let trimmed = line.trim();

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if let Some(event_type) = value.get("type").and_then(|t| t.as_str()) {
                return match event_type {
                    "system" => Some("running".to_string()),
                    "result" => Some("completed".to_string()),
                    _ => None,
                };
            }
        }

        // Try ANSI-stripped JSON
        let stripped = strip_ansi(trimmed);
        let stripped = stripped.trim();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(stripped) {
            if let Some(event_type) = value.get("type").and_then(|t| t.as_str()) {
                return match event_type {
                    "system" => Some("running".to_string()),
                    "result" => Some("completed".to_string()),
                    _ => None,
                };
            }
        }

        None
    }

    fn extract_session_id(&self, line: &str) -> Option<String> {
        let trimmed = line.trim();

        if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if value.get("type").and_then(|t| t.as_str()) == Some("system") {
                return value
                    .get("session_id")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
            }
        }

        // Try ANSI-stripped JSON
        let stripped = strip_ansi(trimmed);
        let stripped = stripped.trim();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(stripped) {
            if value.get("type").and_then(|t| t.as_str()) == Some("system") {
                return value
                    .get("session_id")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
            }
        }

        None
    }

    fn get_token_usage(&self) -> TokenUsage {
        self.accumulated_usage.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_parser() -> ClaudeCodeParser {
        ClaudeCodeParser::new("agent-1", "project-1")
    }

    #[test]
    fn test_parse_system_event() {
        let mut parser = make_parser();
        let line = r#"{"type":"system","session_id":"sess-abc-123","tools":[]}"#;

        let event = parser.parse_line(line).expect("should parse system event");
        assert_eq!(event.event_type, "status_change");
        assert!(event.summary.contains("started"));

        let sid = parser.extract_session_id(line);
        assert_eq!(sid, Some("sess-abc-123".to_string()));
    }

    #[test]
    fn test_parse_assistant_message() {
        let mut parser = make_parser();
        let line = r#"{"type":"assistant","message":{"model":"claude-sonnet-4-5-20250514","usage":{"input_tokens":1200,"output_tokens":340}}}"#;

        let event = parser
            .parse_line(line)
            .expect("should parse assistant message");
        assert_eq!(event.event_type, "token_usage");
        assert!(event.summary.contains("1200"));
        assert!(event.summary.contains("340"));

        assert_eq!(parser.accumulated_usage.input_tokens, 1200);
        assert_eq!(parser.accumulated_usage.output_tokens, 340);
    }

    #[test]
    fn test_parse_tool_use_content_block() {
        let mut parser = make_parser();
        let line = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01","name":"Read","input":{}}}"#;

        let event = parser.parse_line(line).expect("should parse tool_use block");
        assert_eq!(event.event_type, "tool_use");
        assert!(event.summary.contains("Read"));
    }

    #[test]
    fn test_parse_result_event() {
        let mut parser = make_parser();
        parser.accumulated_usage.input_tokens = 5000;
        parser.accumulated_usage.output_tokens = 2000;

        let line = r#"{"type":"result","result":"success","usage":{"input_tokens":5000,"output_tokens":2000}}"#;

        let event = parser.parse_line(line).expect("should parse result");
        assert_eq!(event.event_type, "status_change");
        assert!(event.summary.contains("Completed"));

        let status = parser.detect_status(line);
        assert_eq!(status, Some("completed".to_string()));
    }

    #[test]
    fn test_parse_invalid_json() {
        let mut parser = make_parser();
        // Non-JSON text now returns None (no heuristic parsing)
        let result = parser.parse_line("this is not json at all");
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_empty_line() {
        let mut parser = make_parser();
        let result = parser.parse_line("");
        assert!(result.is_none());

        let result2 = parser.parse_line("   ");
        assert!(result2.is_none());
    }

    #[test]
    fn test_cost_calculation() {
        let usage = TokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            cost_usd: 0.0,
        };

        let cost = ClaudeCodeParser::compute_cost(&usage);
        let expected = 18.0;
        assert!(
            (cost - expected).abs() < 0.001,
            "Expected ~{}, got {}",
            expected,
            cost
        );
    }

    #[test]
    fn test_strip_ansi() {
        assert_eq!(strip_ansi("\x1b[31mhello\x1b[0m"), "hello");
        assert_eq!(strip_ansi("\x1b[2K\x1b[1GText"), "Text");
        assert_eq!(strip_ansi("no escapes"), "no escapes");
        assert_eq!(strip_ansi(""), "");
    }

    #[test]
    fn test_get_token_usage() {
        let mut parser = make_parser();
        let line = r#"{"type":"assistant","message":{"model":"test","usage":{"input_tokens":100,"output_tokens":50}}}"#;
        parser.parse_line(line);

        let usage = parser.get_token_usage();
        assert_eq!(usage.input_tokens, 100);
        assert_eq!(usage.output_tokens, 50);
    }
}
