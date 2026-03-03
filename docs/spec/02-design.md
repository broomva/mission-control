# Phase 2: Design

> Mission Control — Technical Design Document

## 1. Overview

Mission Control is a Tauri 2.0 desktop application that provides a unified control surface for developers running AI coding agents across multiple projects. The frontend is a React/TypeScript SPA rendered in the OS WebView, communicating with a Rust backend via typed IPC commands. The Rust backend manages git operations, filesystem watching, PTY sessions, and agent processes.

The architecture follows a **boundary-first** pattern: all external data (git, filesystem, agent output, PTY streams) is parsed and validated at the Rust boundary layer, then emitted as typed events to the frontend via Tauri's event system.

## 2. Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React/TS)                   │
│                                                           │
│  ┌─ Layout Layer ──────────────────────────────────────┐  │
│  │  Dockview (panel management, serialization)          │  │
│  │  ├─ Terminal panels (xterm.js + WebGL)               │  │
│  │  ├─ File tree panel (react-arborist)                 │  │
│  │  ├─ Git graph panel (CommitGraph + git-diff-view)    │  │
│  │  ├─ Agent dashboard panel                            │  │
│  │  └─ Unified timeline panel                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ State Layer ───────────────────────────────────────┐  │
│  │  Zustand stores (per-project, per-agent, layout)     │  │
│  │  Event subscription via Tauri listen()               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ IPC Layer ─────────────────────────────────────────┐  │
│  │  @tauri-apps/api invoke() — typed via specta         │  │
│  └──────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────┤
│                 Tauri IPC Bridge (specta)                  │
├───────────────────────────────────────────────────────────┤
│                    Backend (Rust)                          │
│                                                           │
│  ┌─ Command Layer ─────────────────────────────────────┐  │
│  │  #[tauri::command] handlers — one per domain         │  │
│  │  ├─ project_commands                                 │  │
│  │  ├─ git_commands                                     │  │
│  │  ├─ terminal_commands                                │  │
│  │  ├─ agent_commands                                   │  │
│  │  └─ workspace_commands                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Service Layer ─────────────────────────────────────┐  │
│  │  Domain services with owned state                    │  │
│  │  ├─ ProjectService (registry, config)                │  │
│  │  ├─ GitService (git2-rs operations)                  │  │
│  │  ├─ FsWatcherService (notify-rs, debounce)           │  │
│  │  ├─ TerminalService (portable-pty, session map)      │  │
│  │  ├─ AgentService (spawn, parse, lifecycle)           │  │
│  │  └─ PersistenceService (serde JSON, local storage)   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─ Event Bus ─────────────────────────────────────────┐  │
│  │  tokio::broadcast — typed event variants              │  │
│  │  → Tauri AppHandle::emit() to frontend               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Architecture Decisions

#### Decision: Tauri 2.0 over Electron
**Context:** Need a desktop framework for terminal + git + file management.
**Options:**
1. Electron — Mature ecosystem, node-pty, higher memory (200-300MB idle)
2. Tauri 2.0 — Rust backend, native git2/notify/pty crates, lower memory (30-40MB idle)
**Decision:** Tauri 2.0
**Rationale:** Rust library ecosystem maps directly to core requirements. Memory advantage matters when coexisting with memory-hungry AI agents. SoloTerm validates this approach.

#### Decision: Zustand over Redux/Jotai
**Context:** Need frontend state management for multi-panel real-time data.
**Options:**
1. Redux Toolkit — Proven, verbose, middleware ecosystem
2. Zustand — Minimal boilerplate, supports slices, React-external access
3. Jotai — Atomic, good for derived state, less suited to event-driven updates
**Decision:** Zustand
**Rationale:** Slice pattern maps well to per-project/per-agent stores. React-external access needed for Tauri event listeners that update state outside React lifecycle.

#### Decision: Dockview over custom layout
**Context:** Need free-form panel arrangement with floating, tabbed, split panels.
**Options:**
1. Dockview — Zero deps, serialization, popout, actively maintained
2. FlexLayout — Mature, fewer features, less active
3. Custom — Full control, high implementation cost
**Decision:** Dockview
**Rationale:** Serialization enables workspace persistence (AC-27/28). Floating panels and popout windows match the "free window arrangement" requirement.

## 3. Components and Interfaces

### 3.1 Rust Backend Services

#### ProjectService
```rust
struct ProjectService {
    projects: HashMap<ProjectId, ProjectConfig>,
    config_path: PathBuf,  // ~/.mission-control/projects.json
}

struct ProjectConfig {
    id: ProjectId,
    name: String,
    path: PathBuf,
    git_worktree_isolation: bool,
    added_at: DateTime<Utc>,
}

// Commands
fn add_project(path: PathBuf) -> Result<ProjectConfig, ProjectError>;
fn remove_project(id: ProjectId) -> Result<(), ProjectError>;
fn list_projects() -> Vec<ProjectConfig>;
fn get_project(id: ProjectId) -> Result<ProjectConfig, ProjectError>;
```

#### GitService
```rust
struct GitService {
    repos: HashMap<ProjectId, Repository>,  // git2::Repository
}

struct CommitInfo {
    oid: String,
    message: String,
    author: String,
    timestamp: i64,
    parents: Vec<String>,
    branch_refs: Vec<String>,
}

struct DiffInfo {
    files: Vec<FileDiff>,
    stats: DiffStats,
}

struct FileDiff {
    path: String,
    status: FileStatus,  // Added | Modified | Deleted | Renamed
    hunks: Vec<DiffHunk>,
}

// Commands
fn get_log(project_id: ProjectId, offset: u32, limit: u32) -> Result<Vec<CommitInfo>, GitError>;
fn get_diff(project_id: ProjectId, commit_oid: String) -> Result<DiffInfo, GitError>;
fn get_status(project_id: ProjectId) -> Result<Vec<FileStatusEntry>, GitError>;
fn get_branches(project_id: ProjectId) -> Result<Vec<BranchInfo>, GitError>;
fn create_worktree(project_id: ProjectId, name: String) -> Result<PathBuf, GitError>;
fn remove_worktree(project_id: ProjectId, name: String) -> Result<(), GitError>;
```

#### FsWatcherService
```rust
struct FsWatcherService {
    watchers: HashMap<ProjectId, RecommendedWatcher>,  // notify::RecommendedWatcher
    debounce_tx: HashMap<ProjectId, Sender<DebouncedEvent>>,
}

enum FsEvent {
    Created { path: PathBuf, is_dir: bool },
    Modified { path: PathBuf },
    Deleted { path: PathBuf },
    Renamed { from: PathBuf, to: PathBuf },
}

// Commands
fn watch_project(project_id: ProjectId, path: PathBuf) -> Result<(), FsError>;
fn unwatch_project(project_id: ProjectId) -> Result<(), FsError>;
fn list_directory(path: PathBuf, respect_gitignore: bool) -> Result<Vec<DirEntry>, FsError>;
fn read_file_preview(path: PathBuf, max_lines: u32) -> Result<String, FsError>;
```

#### TerminalService
```rust
struct TerminalService {
    sessions: HashMap<TerminalId, PtySession>,
}

struct PtySession {
    id: TerminalId,
    project_id: ProjectId,
    master: Box<dyn MasterPty>,
    child: Box<dyn Child>,
    reader_handle: JoinHandle<()>,
    cwd: PathBuf,
    created_at: DateTime<Utc>,
}

// Commands
fn create_terminal(project_id: ProjectId, cwd: Option<PathBuf>) -> Result<TerminalId, PtyError>;
fn write_terminal(id: TerminalId, data: Vec<u8>) -> Result<(), PtyError>;
fn resize_terminal(id: TerminalId, cols: u16, rows: u16) -> Result<(), PtyError>;
fn close_terminal(id: TerminalId) -> Result<(), PtyError>;
fn list_terminals(project_id: ProjectId) -> Vec<TerminalInfo>;
```

#### AgentService
```rust
struct AgentService {
    agents: HashMap<AgentId, AgentProcess>,
    event_tx: broadcast::Sender<AgentEvent>,
}

enum AgentType {
    ClaudeCode,
    Codex,
    GeminiCli,
    Custom { command: String },
}

enum AgentStatus {
    Starting,
    Running,
    Waiting,   // Agent waiting for user input
    Idle,      // Agent finished current task
    Error,
    Completed,
    Stopped,
}

struct AgentProcess {
    id: AgentId,
    project_id: ProjectId,
    agent_type: AgentType,
    status: AgentStatus,
    pid: u32,
    pty_session: TerminalId,
    worktree_path: Option<PathBuf>,
    token_usage: TokenUsage,
    started_at: DateTime<Utc>,
    session_id: Option<String>,  // For resume capability
}

struct TokenUsage {
    input_tokens: u64,
    output_tokens: u64,
    estimated_cost_usd: f64,
}

struct AgentEvent {
    agent_id: AgentId,
    project_id: ProjectId,
    timestamp: DateTime<Utc>,
    event_type: AgentEventType,
}

enum AgentEventType {
    StatusChange(AgentStatus),
    ToolUse { tool: String, params: serde_json::Value },
    FileWrite { path: PathBuf },
    CommandExec { command: String },
    TokenUsage(TokenUsage),
    Error { message: String },
    Message { role: String, content: String },
}

// Commands
fn spawn_agent(project_id: ProjectId, agent_type: AgentType, prompt: Option<String>) -> Result<AgentId, AgentError>;
fn stop_agent(id: AgentId) -> Result<(), AgentError>;
fn resume_agent(id: AgentId) -> Result<(), AgentError>;
fn get_agent_status(id: AgentId) -> Result<AgentProcess, AgentError>;
fn list_agents(project_id: Option<ProjectId>) -> Vec<AgentProcess>;
fn get_timeline(project_id: ProjectId, offset: u32, limit: u32) -> Vec<AgentEvent>;
```

#### PersistenceService
```rust
struct PersistenceService {
    state_path: PathBuf,  // ~/.mission-control/state.json
}

struct WorkspaceState {
    version: u32,
    layout: serde_json::Value,  // Dockview serialized layout
    projects: Vec<ProjectConfig>,
    terminal_sessions: Vec<TerminalSessionState>,
    window_position: WindowPosition,
}

// Commands
fn save_state(state: WorkspaceState) -> Result<(), PersistenceError>;
fn load_state() -> Result<Option<WorkspaceState>, PersistenceError>;
fn export_state(path: PathBuf) -> Result<(), PersistenceError>;
```

### 3.2 Frontend Components

#### Layout Components
- `AppShell` — Top-level container with project selector and global toolbar
- `DockviewWrapper` — Dockview instance with serialization hooks
- `PanelFactory` — Creates panel components by type string

#### Terminal Components
- `TerminalPanel` — xterm.js instance with WebGL addon, connected to Rust PTY
- `TerminalToolbar` — Panel-level controls (split, close, project indicator)

#### File Tree Components
- `FileTreePanel` — react-arborist tree with git status decorations
- `FilePreview` — Read-only syntax-highlighted file viewer
- `GitStatusBadge` — Color-coded status indicator per file

#### Git Components
- `GitGraphPanel` — CommitGraph with click-to-diff
- `DiffViewerPanel` — git-diff-view with unified/split toggle
- `BranchSelector` — Dropdown for branch filtering

#### Agent Components
- `AgentDashboard` — Grid of agent status cards per project
- `AgentCard` — Status, token usage, last action, controls (stop/resume)
- `SpawnAgentDialog` — Agent type selector, prompt input, worktree toggle
- `UnifiedTimeline` — Chronological event list across all agents

#### Dashboard Components
- `ProjectDashboard` — Grid of project cards
- `ProjectCard` — Name, branch, agent count, last activity, status
- `AddProjectDialog` — Directory picker with validation

### 3.3 IPC Type Safety

Using `specta` + `tauri-specta` to auto-generate TypeScript types from Rust:

```rust
// Rust side — types decorated with specta::Type
#[derive(Serialize, specta::Type)]
struct CommitInfo { /* ... */ }

// Generated TypeScript (auto)
interface CommitInfo {
    oid: string;
    message: string;
    author: string;
    timestamp: number;
    parents: string[];
    branch_refs: string[];
}
```

Frontend invokes commands via typed wrappers:
```typescript
// Auto-generated from Rust commands
export const commands = {
    getLog: (projectId: string, offset: number, limit: number) =>
        invoke<CommitInfo[]>("get_log", { projectId, offset, limit }),
    // ...
};
```

## 4. Data Models

### 4.1 Persisted State (`~/.mission-control/`)

```
~/.mission-control/
├── config.json          # Global settings (pricing, keybindings)
├── projects.json        # Project registry
├── state.json           # Last workspace state (layout, windows)
└── logs/
    └── <date>.jsonl     # Structured event logs
```

### 4.2 Per-Project Data (`.mission-control/` in project root)

```
<project-root>/.mission-control/
├── project.json         # Project-specific overrides
├── worktrees/           # Agent worktree directories
│   ├── agent-<id>/
│   └── ...
└── scrollback/          # Terminal scrollback persistence
    ├── <terminal-id>.raw
    └── ...
```

### 4.3 Agent Output Parsing

Each agent type has a dedicated parser that normalizes output into `AgentEvent`:

```
Claude Code stream-json → ClaudeCodeParser → AgentEvent
Codex --json NDJSON     → CodexParser      → AgentEvent
Gemini --output-format  → GeminiParser     → AgentEvent
```

Parser trait:
```rust
trait AgentOutputParser: Send + Sync {
    fn parse_line(&mut self, line: &str) -> Option<AgentEvent>;
    fn detect_status(&self, line: &str) -> Option<AgentStatus>;
}
```

## 5. Error Handling

### Backend Error Strategy

Each service has a typed error enum:
```rust
#[derive(thiserror::Error, Debug, Serialize, specta::Type)]
enum GitError {
    #[error("Repository not found at {path}")]
    RepoNotFound { path: String },
    #[error("Failed to read commit: {message}")]
    CommitReadFailed { message: String },
    #[error("Worktree already exists: {name}")]
    WorktreeExists { name: String },
}
```

### Frontend Error Strategy

- IPC errors surfaced via typed `Result` returns — no silent failures
- Toast notifications for recoverable errors (git fetch failed, agent crash)
- Error boundary per panel — one panel crash doesn't take down the app
- Agent errors surfaced on both the agent card and the unified timeline

### Recovery Patterns

| Scenario | Recovery |
|----------|----------|
| Agent process crash | Detect exit code, update status to Error, preserve scrollback, offer Resume |
| Git repo becomes invalid | Show error badge on project card, disable git panels, allow re-validation |
| File watcher drops events | Periodic full-tree reconciliation every 30s as fallback |
| PTY session dies | Show disconnected state in terminal, offer reconnect/new session |
| Corrupt workspace state | Fall back to default layout, notify user, preserve project list separately |

## 6. Testing Strategy

### Backend (Rust)

| Layer | Tool | Scope |
|-------|------|-------|
| Unit tests | `cargo test` | Service logic, parsers, data transforms |
| Integration tests | `cargo test --features integration` | Git operations on temp repos, PTY spawn/write/read |
| Property tests | `proptest` | Parser robustness with arbitrary input |

Key test fixtures:
- Temp git repos with known commit history for GitService tests
- Mock agent NDJSON output for parser tests
- PTY echo server for TerminalService tests

### Frontend (TypeScript)

| Layer | Tool | Scope |
|-------|------|-------|
| Unit tests | Vitest | Store logic, event handlers, formatters |
| Component tests | Vitest + Testing Library | Panel rendering, user interactions |
| E2E tests | Playwright + Tauri driver | Full app flows (add project → spawn agent → view diff) |

### Harness Commands

```
make smoke    → cargo check + bun run build (< 30s)
make check    → cargo clippy + biome lint + biome check + cargo test (unit only)
make test     → cargo test (all) + bun run test
make ci       → smoke + check + test
```

## 7. Technology Stack Summary

### Frontend
| Dependency | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 5.x | Type safety |
| @xterm/xterm | 6.x | Terminal emulation |
| @xterm/addon-webgl | latest | GPU-accelerated rendering |
| @xterm/addon-fit | latest | Auto-resize terminal to container |
| dockview | 5.x | Panel/docking layout manager |
| react-arborist | latest | Virtualized file tree |
| @mrdrogdrog/commit-graph | latest | Git commit graph visualization |
| @git-diff-view/react | latest | Diff viewer |
| zustand | 5.x | State management |
| Biome | 2.x | Lint + format |

### Backend
| Dependency | Version | Purpose |
|------------|---------|---------|
| tauri | 2.x | Desktop framework |
| git2 | 0.20.x | Git operations |
| notify | 7.x | Filesystem watching |
| portable-pty | latest | PTY management |
| tokio | 1.x | Async runtime |
| serde / serde_json | 1.x | Serialization |
| specta | latest | TypeScript type generation |
| tauri-specta | latest | Tauri + specta integration |
| thiserror | latest | Error types |
| tracing | latest | Structured logging |
| syntect | latest | Syntax highlighting |

### Build Tools
| Tool | Purpose |
|------|---------|
| Bun | Frontend package manager + bundler |
| Cargo | Rust package manager + build |
| Biome | Lint + format (frontend) |
| Clippy | Lint (backend) |
