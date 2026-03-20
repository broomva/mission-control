pub mod claude_code;

use crate::models::{AgentEvent, TokenUsage};

pub trait AgentOutputParser: Send {
    fn parse_line(&mut self, line: &str) -> Option<AgentEvent>;
    fn detect_status(&self, line: &str) -> Option<String>;
    fn extract_session_id(&self, line: &str) -> Option<String>;
    fn get_token_usage(&self) -> TokenUsage;
}

pub fn create_parser(
    agent_type: &str,
    agent_id: &str,
    project_id: &str,
) -> Box<dyn AgentOutputParser> {
    match agent_type {
        "claude-code" => Box::new(claude_code::ClaudeCodeParser::new(agent_id, project_id)),
        _ => Box::new(claude_code::ClaudeCodeParser::new(agent_id, project_id)),
    }
}

/// Strip ANSI escape sequences from a string, returning only visible text.
pub fn strip_ansi(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next(); // consume '['
                    // CSI sequence: read params until final byte (letter or @-~)
                    loop {
                        match chars.next() {
                            Some(c) if c.is_ascii_alphabetic() || c == '@' || c == '~' => break,
                            Some(_) => continue,
                            None => break,
                        }
                    }
                }
                Some(']') => {
                    chars.next(); // consume ']'
                    // OSC sequence: read until BEL (\x07) or ST (\x1b\\)
                    loop {
                        match chars.next() {
                            Some('\x07') => break,
                            Some('\x1b') => {
                                if chars.peek() == Some(&'\\') {
                                    chars.next();
                                    break;
                                }
                            }
                            Some(_) => continue,
                            None => break,
                        }
                    }
                }
                Some('(') | Some(')') | Some('*') | Some('+') => {
                    chars.next(); // consume designator
                    chars.next(); // consume charset
                }
                Some(_) => {
                    chars.next(); // skip one char for 2-byte escapes
                }
                None => {}
            }
        } else if c == '\r' || c == '\x07' || c == '\x08' {
            // Skip carriage returns, bells, backspaces
            continue;
        } else {
            result.push(c);
        }
    }

    result
}
