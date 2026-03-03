# Observability

## Goal

Make agent workflows, harness runs, and application behavior diagnosable without reproducing locally.

## Required Event Fields

| Field | Type | Description |
|---|---|---|
| `timestamp` | ISO 8601 | When the event occurred |
| `level` | `trace\|debug\|info\|warn\|error` | Severity level |
| `event_name` | string | Structured event identifier |
| `project_id` | string | Project context (if applicable) |
| `agent_id` | string | Agent context (if applicable) |
| `terminal_id` | string | Terminal context (if applicable) |
| `component` | string | Service or module name |
| `status` | string | Outcome (success, failure, skipped) |
| `duration_ms` | u64 | Operation duration (if timed) |

## Event Taxonomy

### Application Events
- `app.start` — Application launched
- `app.state.loaded` — Workspace state restored
- `app.state.saved` — Workspace state persisted
- `app.state.corrupt` — Corrupt state detected, fallback applied

### Project Events
- `project.added` — New project registered
- `project.removed` — Project unregistered
- `project.error` — Project-level error (invalid path, git issues)

### Git Events
- `git.ref_changed` — Branch, tag, or HEAD changed
- `git.commit_detected` — New commit appeared on watched branch
- `git.worktree.created` — Worktree created for agent
- `git.worktree.removed` — Worktree cleaned up
- `git.conflict.detected` — Worktree merge conflict found

### Filesystem Events
- `fs.created` — File or directory created
- `fs.modified` — File modified
- `fs.deleted` — File or directory deleted
- `fs.watcher.started` — Watcher registered for project
- `fs.watcher.error` — Watcher error (permissions, too many files)

### Terminal Events
- `terminal.created` — PTY session spawned
- `terminal.closed` — PTY session ended
- `terminal.resize` — Terminal dimensions changed
- `terminal.error` — PTY error

### Agent Events
- `agent.spawned` — Agent process started
- `agent.status_change` — Status transition (running → waiting → idle → error → complete)
- `agent.tool_use` — Agent invoked a tool (file write, command exec)
- `agent.file_write` — Agent wrote a file
- `agent.command_exec` — Agent executed a command
- `agent.token_usage` — Token usage update
- `agent.error` — Agent error
- `agent.stopped` — Agent process stopped (user-initiated)
- `agent.completed` — Agent finished naturally
- `agent.resumed` — Agent session resumed

### Harness Events
- `harness.start` — Harness command started
- `harness.step.start` — Harness step began
- `harness.step.finish` — Harness step completed
- `harness.step.fail` — Harness step failed
- `harness.check.pass` — Check passed
- `harness.check.fail` — Check failed

## Logging Rules

- Use `tracing` crate with `tracing-subscriber` for structured JSON logging.
- Use spans for request-scoped context (project_id, agent_id).
- Keep field names stable over time — changing them breaks queries.
- Include enough context to replay failures.
- Redact secrets and personally identifiable values.
- Log to `~/.mission-control/logs/<date>.jsonl`.

## Metrics (Future)

- Application memory usage (idle, per-project)
- Terminal rendering FPS
- Git graph render time
- Agent event parsing latency
- File tree update latency
- Smoke check duration
- Cost per agent session

## Alerting (Future)

- Agent crash without user-initiated stop
- Filesystem watcher failure
- Memory exceeding 500MB threshold
- Git repository becoming inaccessible
