use std::path::PathBuf;

use tracing::{info, warn};

/// RAII guard that writes `.claude/settings.local.json` with hook URLs
/// before agent spawns, and restores/removes it on drop.
pub struct HookConfigGuard {
    settings_path: PathBuf,
    original_content: Option<String>,
}

impl HookConfigGuard {
    /// Install hook configuration into `{cwd}/.claude/settings.local.json`.
    pub fn install(cwd: &str, port: u16, agent_id: &str) -> std::io::Result<Self> {
        let claude_dir = PathBuf::from(cwd).join(".claude");
        std::fs::create_dir_all(&claude_dir)?;

        let settings_path = claude_dir.join("settings.local.json");

        // Preserve existing content for restore on drop
        let original_content = std::fs::read_to_string(&settings_path).ok();

        // Build hook URLs
        let base = format!("http://127.0.0.1:{}", port);
        let aid = agent_id;

        let hooks_config = serde_json::json!({
            "hooks": {
                "SessionStart": [{
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/session-start?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "PreToolUse": [{
                    "matcher": ".*",
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/pre-tool-use?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "PostToolUse": [{
                    "matcher": ".*",
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/post-tool-use?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "PostToolUseFailure": [{
                    "matcher": ".*",
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/post-tool-use-failure?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "Stop": [{
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/stop?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "SubagentStart": [{
                    "matcher": ".*",
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/subagent-start?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "SubagentStop": [{
                    "matcher": ".*",
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/subagent-stop?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "Notification": [{
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/notification?agent_id={}", base, aid), "timeout": 5 }]
                }],
                "SessionEnd": [{
                    "hooks": [{ "type": "http", "url": format!("{}/hooks/session-end?agent_id={}", base, aid), "timeout": 5 }]
                }]
            }
        });

        // Merge with existing config if present
        let merged = if let Some(ref existing) = original_content {
            if let Ok(mut existing_val) = serde_json::from_str::<serde_json::Value>(existing) {
                if let Some(obj) = existing_val.as_object_mut() {
                    obj.insert(
                        "hooks".to_string(),
                        hooks_config.get("hooks").unwrap().clone(),
                    );
                    existing_val
                } else {
                    hooks_config
                }
            } else {
                hooks_config
            }
        } else {
            hooks_config
        };

        let content = serde_json::to_string_pretty(&merged)?;
        std::fs::write(&settings_path, &content)?;

        info!(path = %settings_path.display(), "hook config installed");

        Ok(Self {
            settings_path,
            original_content,
        })
    }
}

impl Drop for HookConfigGuard {
    fn drop(&mut self) {
        match &self.original_content {
            Some(content) => {
                if let Err(e) = std::fs::write(&self.settings_path, content) {
                    warn!(error = %e, "failed to restore original settings.local.json");
                } else {
                    info!(path = %self.settings_path.display(), "hook config restored");
                }
            }
            None => {
                if let Err(e) = std::fs::remove_file(&self.settings_path) {
                    // File might already be gone, that's OK
                    if e.kind() != std::io::ErrorKind::NotFound {
                        warn!(error = %e, "failed to remove settings.local.json");
                    }
                } else {
                    info!(path = %self.settings_path.display(), "hook config removed");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();

        let guard = HookConfigGuard::install(cwd, 12345, "agent-1").unwrap();
        let settings_path = dir.path().join(".claude/settings.local.json");
        assert!(settings_path.exists());

        let content = std::fs::read_to_string(&settings_path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(val.get("hooks").is_some());

        let hooks = val.get("hooks").unwrap();
        assert!(hooks.get("SessionStart").is_some());
        assert!(hooks.get("PreToolUse").is_some());
        assert!(hooks.get("PostToolUse").is_some());
        assert!(hooks.get("Stop").is_some());
        assert!(hooks.get("SessionEnd").is_some());

        // Check URL contains port and agent_id
        let url = hooks["SessionStart"][0]["hooks"][0]["url"]
            .as_str()
            .unwrap();
        assert!(url.contains("12345"));
        assert!(url.contains("agent-1"));

        drop(guard);
    }

    #[test]
    fn test_install_merges_existing() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();

        let existing = r#"{"apiKey": "test-key", "theme": "dark"}"#;
        std::fs::write(claude_dir.join("settings.local.json"), existing).unwrap();

        let _guard = HookConfigGuard::install(cwd, 9999, "agent-2").unwrap();
        let content =
            std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Original keys preserved
        assert_eq!(val["apiKey"], "test-key");
        assert_eq!(val["theme"], "dark");
        // Hooks added
        assert!(val.get("hooks").is_some());
    }

    #[test]
    fn test_drop_restores_original() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();

        let original = r#"{"original": true}"#;
        std::fs::write(claude_dir.join("settings.local.json"), original).unwrap();

        {
            let _guard = HookConfigGuard::install(cwd, 8080, "agent-3").unwrap();
            // While guard is alive, file has hooks
            let content =
                std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
            let val: serde_json::Value = serde_json::from_str(&content).unwrap();
            assert!(val.get("hooks").is_some());
        }
        // After drop, original restored
        let restored =
            std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
        assert_eq!(restored, original);
    }

    #[test]
    fn test_drop_deletes_when_no_original() {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let settings_path = dir.path().join(".claude/settings.local.json");

        {
            let _guard = HookConfigGuard::install(cwd, 7777, "agent-4").unwrap();
            assert!(settings_path.exists());
        }
        // After drop, file should be deleted
        assert!(!settings_path.exists());
    }
}
