use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "mc",
    about = "Mission Control CLI — query and control your agent orchestration"
)]
struct Cli {
    /// API server port (default: 19420, or MC_API_PORT env var)
    #[arg(long, env = "MC_API_PORT", default_value = "19420")]
    port: u16,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all registered projects
    Projects,

    /// List agents (optionally filtered by project)
    Agents {
        /// Filter agents by project ID
        #[arg(long)]
        project: Option<String>,
    },

    /// Spawn a new agent
    Spawn {
        /// Project ID to spawn the agent in
        #[arg(long)]
        project: String,

        /// Agent type (claude-code, codex, gemini, custom)
        #[arg(long, default_value = "claude-code")]
        agent: String,

        /// Prompt to send to the agent
        #[arg(long)]
        prompt: Option<String>,

        /// Model override
        #[arg(long)]
        model: Option<String>,
    },

    /// Stop a running agent
    Stop {
        /// Agent ID to stop
        agent_id: String,
    },

    /// Show app status (version, uptime, agent count)
    Status,

    /// List checkpoints for a project
    Checkpoints {
        /// Project ID
        #[arg(long)]
        project: String,
    },
}

fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{}/api", port)
}

fn connection_error() -> ! {
    eprintln!("Error: Mission Control is not running. Start the app first.");
    std::process::exit(1);
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = reqwest::Client::new();
    let base = base_url(cli.port);

    match cli.command {
        Commands::Status => {
            match client.get(format!("{}/status", base)).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        eprintln!("Error: API returned {}", resp.status());
                        std::process::exit(1);
                    }
                    let status: serde_json::Value = resp.json().await.unwrap_or_default();
                    println!(
                        "Mission Control v{} — running",
                        status["version"].as_str().unwrap_or("?")
                    );
                    println!(
                        "  Uptime:       {}s",
                        status["uptime_secs"].as_u64().unwrap_or(0)
                    );
                    println!(
                        "  Agents:       {}",
                        status["agent_count"].as_u64().unwrap_or(0)
                    );
                    println!(
                        "  Gateway port: {}",
                        status["gateway_port"].as_u64().unwrap_or(0)
                    );
                    println!(
                        "  Hook port:    {}",
                        status["hook_port"].as_u64().unwrap_or(0)
                    );
                }
                Err(_) => connection_error(),
            }
        }

        Commands::Projects => {
            match client.get(format!("{}/projects", base)).send().await {
                Ok(resp) => {
                    let projects: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
                    if projects.is_empty() {
                        println!("No projects registered.");
                        return;
                    }
                    println!("{:<20} {:<40} {}", "NAME", "PATH", "ID");
                    println!("{}", "-".repeat(80));
                    for p in projects {
                        println!(
                            "{:<20} {:<40} {}",
                            truncate(p["name"].as_str().unwrap_or(""), 19),
                            truncate(p["path"].as_str().unwrap_or(""), 39),
                            &p["id"].as_str().unwrap_or("")[..p["id"]
                                .as_str()
                                .unwrap_or("")
                                .len()
                                .min(8)],
                        );
                    }
                }
                Err(_) => connection_error(),
            }
        }

        Commands::Agents { project } => {
            let url = match project {
                Some(ref pid) => format!("{}/agents?project={}", base, pid),
                None => format!("{}/agents", base),
            };

            match client.get(&url).send().await {
                Ok(resp) => {
                    let agents: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
                    if agents.is_empty() {
                        println!("No agents running.");
                        return;
                    }
                    println!(
                        "{:<12} {:<10} {:<14} {:<20} {}",
                        "TYPE", "STATUS", "STARTED", "PROJECT", "ID"
                    );
                    println!("{}", "-".repeat(80));
                    for a in agents {
                        println!(
                            "{:<12} {:<10} {:<14} {:<20} {}",
                            a["agent_type"].as_str().unwrap_or(""),
                            a["status"].as_str().unwrap_or(""),
                            a["started_at"]
                                .as_str()
                                .unwrap_or("")
                                .get(..13)
                                .unwrap_or(""),
                            &a["project_id"]
                                .as_str()
                                .unwrap_or("")[..a["project_id"]
                                .as_str()
                                .unwrap_or("")
                                .len()
                                .min(8)],
                            &a["id"].as_str().unwrap_or("")[..a["id"]
                                .as_str()
                                .unwrap_or("")
                                .len()
                                .min(8)],
                        );
                    }
                }
                Err(_) => connection_error(),
            }
        }

        Commands::Spawn {
            project,
            agent,
            prompt,
            model,
        } => {
            let mut body = serde_json::json!({
                "project_id": project,
                "agent_type": agent,
            });
            if let Some(ref p) = prompt {
                body["prompt"] = serde_json::Value::String(p.clone());
            }
            if let Some(ref m) = model {
                body["model"] = serde_json::Value::String(m.clone());
            }

            match client
                .post(format!("{}/agents/spawn", base))
                .json(&body)
                .send()
                .await
            {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let err: serde_json::Value = resp.json().await.unwrap_or_default();
                        eprintln!(
                            "Error: {}",
                            err["error"].as_str().unwrap_or("unknown error")
                        );
                        std::process::exit(1);
                    }
                    let info: serde_json::Value = resp.json().await.unwrap_or_default();
                    println!("Agent spawned:");
                    println!("  ID:      {}", info["id"].as_str().unwrap_or(""));
                    println!("  Type:    {}", info["agent_type"].as_str().unwrap_or(""));
                    println!("  Status:  {}", info["status"].as_str().unwrap_or(""));
                    println!("  Project: {}", info["project_id"].as_str().unwrap_or(""));
                }
                Err(_) => connection_error(),
            }
        }

        Commands::Stop { agent_id } => {
            match client
                .post(format!("{}/agents/{}/stop", base, agent_id))
                .send()
                .await
            {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let err: serde_json::Value = resp.json().await.unwrap_or_default();
                        eprintln!(
                            "Error: {}",
                            err["error"].as_str().unwrap_or("unknown error")
                        );
                        std::process::exit(1);
                    }
                    println!("Agent {} stopped.", agent_id);
                }
                Err(_) => connection_error(),
            }
        }

        Commands::Checkpoints { project } => {
            match client
                .get(format!("{}/checkpoints?project={}", base, project))
                .send()
                .await
            {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        let err: serde_json::Value = resp.json().await.unwrap_or_default();
                        eprintln!(
                            "Error: {}",
                            err["error"].as_str().unwrap_or("unknown error")
                        );
                        std::process::exit(1);
                    }
                    let checkpoints: Vec<serde_json::Value> =
                        resp.json().await.unwrap_or_default();
                    if checkpoints.is_empty() {
                        println!("No checkpoints for this project.");
                        return;
                    }
                    println!(
                        "{:<20} {:<30} {:<10} {}",
                        "TIMESTAMP", "DESCRIPTION", "AGENT", "ID"
                    );
                    println!("{}", "-".repeat(80));
                    for cp in checkpoints {
                        println!(
                            "{:<20} {:<30} {:<10} {}",
                            cp["timestamp"]
                                .as_str()
                                .unwrap_or("")
                                .get(..19)
                                .unwrap_or(""),
                            truncate(cp["description"].as_str().unwrap_or(""), 29),
                            cp["agent_id"]
                                .as_str()
                                .map(|s| &s[..s.len().min(8)])
                                .unwrap_or("-"),
                            &cp["id"].as_str().unwrap_or("")[..cp["id"]
                                .as_str()
                                .unwrap_or("")
                                .len()
                                .min(8)],
                        );
                    }
                }
                Err(_) => connection_error(),
            }
        }
    }
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        &s[..max]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base_url() {
        assert_eq!(base_url(19420), "http://127.0.0.1:19420/api");
        assert_eq!(base_url(8080), "http://127.0.0.1:8080/api");
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 5), "hello");
        assert_eq!(truncate("", 5), "");
    }

    #[test]
    fn test_cli_parse_status() {
        use clap::Parser;
        let cli = Cli::parse_from(["mc", "status"]);
        assert_eq!(cli.port, 19420);
        assert!(matches!(cli.command, Commands::Status));
    }

    #[test]
    fn test_cli_parse_agents_with_project() {
        use clap::Parser;
        let cli = Cli::parse_from(["mc", "agents", "--project", "abc123"]);
        match cli.command {
            Commands::Agents { project } => assert_eq!(project, Some("abc123".to_string())),
            _ => panic!("expected Agents command"),
        }
    }

    #[test]
    fn test_cli_parse_spawn() {
        use clap::Parser;
        let cli = Cli::parse_from([
            "mc",
            "spawn",
            "--project",
            "p1",
            "--agent",
            "claude-code",
            "--prompt",
            "fix auth bug",
        ]);
        match cli.command {
            Commands::Spawn {
                project,
                agent,
                prompt,
                model,
            } => {
                assert_eq!(project, "p1");
                assert_eq!(agent, "claude-code");
                assert_eq!(prompt, Some("fix auth bug".to_string()));
                assert!(model.is_none());
            }
            _ => panic!("expected Spawn command"),
        }
    }

    #[test]
    fn test_cli_parse_stop() {
        use clap::Parser;
        let cli = Cli::parse_from(["mc", "stop", "agent-xyz"]);
        match cli.command {
            Commands::Stop { agent_id } => assert_eq!(agent_id, "agent-xyz"),
            _ => panic!("expected Stop command"),
        }
    }

    #[test]
    fn test_cli_parse_custom_port() {
        use clap::Parser;
        let cli = Cli::parse_from(["mc", "--port", "8080", "status"]);
        assert_eq!(cli.port, 8080);
    }

    #[test]
    fn test_cli_parse_checkpoints() {
        use clap::Parser;
        let cli = Cli::parse_from(["mc", "checkpoints", "--project", "p1"]);
        match cli.command {
            Commands::Checkpoints { project } => assert_eq!(project, "p1"),
            _ => panic!("expected Checkpoints command"),
        }
    }
}
