use std::path::PathBuf;

use crate::models::{AppError, ClaudeSession};

/// Read recent Claude Code sessions from ~/.claude/sessions/*.json
#[tauri::command]
#[specta::specta]
pub fn list_claude_sessions(limit: Option<u32>) -> Result<Vec<ClaudeSession>, AppError> {
    let limit = limit.unwrap_or(20) as usize;

    let sessions_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("sessions");

    if !sessions_dir.is_dir() {
        return Ok(Vec::new());
    }

    let read_dir = std::fs::read_dir(&sessions_dir)
        .map_err(|e| AppError::IoError(format!("Failed to read sessions dir: {e}")))?;

    let mut sessions: Vec<ClaudeSession> = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Claude session JSON uses camelCase keys
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RawSession {
            pid: u32,
            session_id: String,
            cwd: String,
            started_at: f64,
            #[serde(default = "default_kind")]
            kind: String,
            #[serde(default = "default_entrypoint")]
            entrypoint: String,
        }

        fn default_kind() -> String {
            "interactive".to_string()
        }
        fn default_entrypoint() -> String {
            "cli".to_string()
        }

        match serde_json::from_str::<RawSession>(&contents) {
            Ok(raw) => {
                sessions.push(ClaudeSession {
                    pid: raw.pid,
                    session_id: raw.session_id,
                    cwd: raw.cwd,
                    started_at: raw.started_at,
                    kind: raw.kind,
                    entrypoint: raw.entrypoint,
                });
            }
            Err(_) => continue,
        }
    }

    // Sort by started_at descending (most recent first)
    sessions.sort_by(|a, b| b.started_at.partial_cmp(&a.started_at).unwrap_or(std::cmp::Ordering::Equal));
    sessions.truncate(limit);

    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_sessions_returns_results() {
        let sessions = list_claude_sessions(Some(5)).expect("should not error");
        // Only assert structure if sessions dir exists on this machine
        let sessions_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".claude")
            .join("sessions");
        if sessions_dir.is_dir() {
            // We know this dev machine has session files
            assert!(!sessions.is_empty(), "expected at least one session");
            // Most recent first
            if sessions.len() > 1 {
                assert!(
                    sessions[0].started_at >= sessions[1].started_at,
                    "sessions should be sorted most-recent-first"
                );
            }
            // Verify fields are populated
            let first = &sessions[0];
            assert!(!first.session_id.is_empty());
            assert!(!first.cwd.is_empty());
            assert!(first.started_at > 0.0);
            assert!(sessions.len() <= 5, "should respect limit");
        }
    }
}
