# Phase 3: Task Plan

> Mission Control — Implementation Tasks (sequenced, foundation-first)

## Epic 1: Project Scaffolding

- [ ] **1.1** Initialize Tauri 2.0 project with React + TypeScript template
  - Run `bun create tauri-app` with React/TS template
  - Configure `tauri.conf.json` with app metadata, window defaults, and security capabilities
  - Verify `cargo tauri dev` launches empty window
  - _Requirements: C-01, C-02, C-04_

- [ ] **1.2** Configure frontend tooling
  - Install Biome, configure `biome.json` with project rules
  - Add Zustand, Dockview, xterm.js, react-arborist core dependencies via Bun
  - Configure TypeScript `tsconfig.json` with strict mode
  - _Requirements: C-02, C-03, C-07_

- [ ] **1.3** Configure Rust backend tooling
  - Add `git2`, `notify`, `portable-pty`, `tokio`, `serde`, `specta`, `tauri-specta`, `thiserror`, `tracing` to `Cargo.toml`
  - Configure `clippy.toml` with project lint rules
  - Set up `tracing-subscriber` for structured logging
  - _Requirements: C-06_

- [ ] **1.4** Set up specta type bridge
  - Configure `tauri-specta` to auto-generate TypeScript bindings from Rust command types
  - Create initial command stubs with `#[specta::specta]` decorators
  - Verify TypeScript types are generated on `cargo build`
  - _Requirements: Design §3.3_

- [ ] **1.5** Bootstrap harness engineering artifacts
  - Create `AGENTS.md`, `Makefile` with harness targets, `scripts/harness/*.sh`
  - Verify `make smoke`, `make check`, `make test` work
  - _Requirements: Harness practices 1, 2, 6_

## Epic 2: Persistence & Project Management

- [ ] **2.1** Implement PersistenceService
  - Create `~/.mission-control/` directory structure on first launch
  - Implement `save_state()` / `load_state()` with serde JSON
  - Handle corrupt state with fallback (AC-29)
  - Add version field for future migration
  - _Requirements: AC-27, AC-28, AC-29_

- [ ] **2.2** Implement ProjectService
  - Project registry in `~/.mission-control/projects.json`
  - CRUD operations: `add_project`, `remove_project`, `list_projects`, `get_project`
  - Validate project path exists and is a git repository
  - Emit `project:added` / `project:removed` events
  - _Requirements: AC-16, AC-19_

- [ ] **2.3** Build project dashboard frontend
  - `ProjectDashboard` component with grid of `ProjectCard` components
  - `AddProjectDialog` with native directory picker via Tauri dialog API
  - Empty state / onboarding flow when no projects configured
  - Connect to Zustand `projectStore`
  - _Requirements: AC-16, AC-17, AC-18, AC-19_

## Epic 3: Layout System

- [ ] **3.1** Integrate Dockview layout manager
  - Wrap Dockview in `DockviewWrapper` component
  - Register panel types: terminal, file-tree, git-graph, diff-viewer, agent-dashboard, timeline
  - Implement `PanelFactory` for panel creation by type string
  - _Requirements: AC-02, US-01_

- [ ] **3.2** Implement layout persistence
  - Serialize Dockview layout to JSON on layout change (debounced 1s)
  - Restore layout from `WorkspaceState` on app start
  - Default layout: file tree left, terminal center, git graph right
  - _Requirements: AC-03, AC-27, AC-28_

- [ ] **3.3** Build app shell and navigation
  - `AppShell` with project selector dropdown and global toolbar
  - Project switching updates all panels to selected project context
  - Window title shows current project name
  - _Requirements: AC-18, US-04_

## Epic 4: Terminal System

- [ ] **4.1** Implement TerminalService (Rust)
  - PTY spawning via `portable-pty` with user's default shell
  - Session map keyed by `TerminalId`
  - Async reader task that emits `terminal:data` events to frontend
  - Write handler for frontend → PTY data flow
  - Resize handler (AC-05)
  - _Requirements: AC-01, AC-05_

- [ ] **4.2** Build TerminalPanel component
  - xterm.js instance with WebGL addon for GPU rendering
  - Fit addon for auto-resize on container change
  - Connect to Rust PTY via Tauri IPC (write) and events (read)
  - Scrollback virtualization (AC-04)
  - _Requirements: AC-01, AC-02, AC-04, AC-05, NFR-03_

- [ ] **4.3** Implement terminal session persistence
  - Save scrollback buffer to `.mission-control/scrollback/<id>.raw` on close
  - Restore scrollback on reconnect
  - Track CWD per terminal for session resume
  - _Requirements: AC-03, AC-27_

- [ ] **4.4** Terminal panel UX polish
  - `TerminalToolbar` with split vertical/horizontal, close, project badge
  - Keyboard shortcuts for new terminal, next/prev terminal
  - Copy/paste handling for macOS
  - _Requirements: AC-02, US-01_

## Epic 5: File System Watching & Tree

- [ ] **5.1** Implement FsWatcherService (Rust)
  - `notify::RecommendedWatcher` per project directory
  - Debounce events (100ms window) to prevent flooding
  - Emit typed `fs:event` to frontend
  - Respect `.gitignore` via `git2::Repository::is_path_ignored()`
  - _Requirements: AC-06, AC-10_

- [ ] **5.2** Implement directory listing command
  - `list_directory` with gitignore filtering
  - Return `DirEntry` with name, path, is_dir, git_status
  - Lazy loading: only return direct children, expand on request
  - _Requirements: AC-09, AC-10_

- [ ] **5.3** Build FileTreePanel component
  - react-arborist tree connected to `list_directory` IPC
  - Git status color coding (AC-07)
  - Click handler to open `FilePreview` panel
  - Virtualized rendering for large directories (AC-09)
  - Auto-update on `fs:event` from backend
  - _Requirements: AC-06, AC-07, AC-08, AC-09, AC-10, US-02_

- [ ] **5.4** Build FilePreview component
  - Read-only file viewer with syntax highlighting (syntect via Rust or client-side)
  - Line numbers, word wrap toggle
  - Open in external editor button
  - _Requirements: AC-08_

## Epic 6: Git Integration

- [ ] **6.1** Implement GitService (Rust)
  - Open `git2::Repository` per project, cache handles
  - `get_log`: walk commit history with parent topology for graph rendering
  - `get_status`: working directory status with file paths and status codes
  - `get_diff`: commit diff with hunks and line-level changes
  - `get_branches`: list local and remote branches
  - _Requirements: AC-11, AC-12, AC-14, AC-15_

- [ ] **6.2** Implement git ref watching
  - Watch `.git/refs/` and `.git/HEAD` via FsWatcherService
  - Emit `git:ref-changed` event on new commits, branch switches
  - Trigger incremental graph update (AC-13)
  - _Requirements: AC-13_

- [ ] **6.3** Build GitGraphPanel component
  - CommitGraph (or custom SVG) rendering branch topology
  - Commit list with message, author, timestamp, branch labels
  - Click-to-diff: selecting a commit opens DiffViewerPanel
  - Pagination for large repos (AC-15)
  - _Requirements: AC-11, AC-12, AC-15, US-03_

- [ ] **6.4** Build DiffViewerPanel component
  - git-diff-view integration for unified/side-by-side diff
  - Syntax-aware highlighting per file type (AC-14)
  - File-level navigation for multi-file commits
  - _Requirements: AC-12, AC-14_

- [ ] **6.5** Implement git worktree management
  - `create_worktree`: create worktree in `.mission-control/worktrees/agent-<id>/`
  - `remove_worktree`: cleanup after agent completion
  - Merge/diff/discard options surfaced in UI (AC-34)
  - Conflict detection across worktrees (AC-35)
  - _Requirements: AC-33, AC-34, AC-35, US-10_

## Epic 7: Agent Management

- [ ] **7.1** Implement AgentService core (Rust)
  - Agent process spawning via PTY with structured output flags
  - Process lifecycle management (start, monitor, stop with SIGTERM→SIGKILL)
  - Agent status detection from output parsing
  - Agent registry with per-agent state
  - _Requirements: AC-20, AC-21, AC-22, AC-23, AC-24_

- [ ] **7.2** Implement agent output parsers
  - `ClaudeCodeParser`: parse `stream-json` NDJSON events → `AgentEvent`
  - `CodexParser`: parse `--json` NDJSON events → `AgentEvent`
  - `GeminiParser`: parse `--output-format json` → `AgentEvent`
  - Token usage extraction per parser
  - Implement `AgentOutputParser` trait for each
  - _Requirements: AC-20, AC-21, AC-22, AC-26, US-07_

- [ ] **7.3** Implement agent session resume
  - Track `session_id` per agent from parser output
  - Claude Code: `claude -c` or `--session-id <id>`
  - Codex: `codex exec --resume <id>`
  - Gemini: `/chat resume`
  - UI "Resume" action on completed/stopped agents
  - _Requirements: AC-25_

- [ ] **7.4** Build SpawnAgentDialog component
  - Agent type selector (Claude Code, Codex, Gemini CLI, Custom)
  - Optional prompt text input
  - Worktree isolation toggle (creates worktree on spawn)
  - Project context auto-filled from current project
  - _Requirements: AC-20, AC-21, AC-22, AC-33, US-05_

- [ ] **7.5** Build AgentDashboard and AgentCard components
  - `AgentDashboard`: grid of cards filtered by current project
  - `AgentCard`: status indicator, agent type icon, last action, token usage, cost
  - Controls: Stop, Resume, View Terminal, View Timeline
  - _Requirements: AC-23, AC-31, US-05_

- [ ] **7.6** Build UnifiedTimeline component
  - Chronological event list from all agents on current project
  - Event types rendered with icons: file_write, command_exec, tool_use, error, status_change
  - Filtering by agent, event type, time range
  - Auto-scroll with pause-on-hover
  - _Requirements: AC-26, AC-30, US-08_

## Epic 8: Cost Tracking

- [ ] **8.1** Implement cost tracking in AgentService
  - Per-model pricing configuration in `~/.mission-control/config.json`
  - Token usage accumulation per agent session
  - Cost calculation: `(input_tokens * input_price + output_tokens * output_price)`
  - Emit `agent:token-usage` events
  - _Requirements: AC-30, AC-31, AC-32, US-09_

- [ ] **8.2** Build cost display components
  - Token/cost display on `AgentCard`
  - Aggregate cost display on `ProjectCard`
  - Cost settings panel for model pricing configuration
  - _Requirements: AC-31, AC-32_

## Epic 9: Polish & Platform

- [ ] **9.1** Window management
  - Remember window position and size across restarts
  - macOS native title bar integration
  - Menu bar with keyboard shortcuts
  - _Requirements: NFR-09_

- [ ] **9.2** Performance optimization
  - Profile and optimize terminal rendering (target 60 FPS)
  - Profile git graph rendering (target <2s for 10k commits)
  - Memory profiling (target <100MB idle)
  - _Requirements: NFR-01, NFR-02, NFR-03, NFR-04, NFR-05_

- [ ] **9.3** Error boundaries and resilience
  - React error boundary per Dockview panel
  - Agent process independence from app lifecycle (NFR-12)
  - Graceful degradation on git/fs/pty failures
  - _Requirements: NFR-12, NFR-13_

- [ ] **9.4** Linux support
  - Test on Ubuntu 22.04+ and Fedora 38+
  - WebKitGTK compatibility fixes
  - Platform-specific shell detection
  - _Requirements: NFR-10_

## Milestone Summary

| Milestone | Epics | Target |
|-----------|-------|--------|
| **M1: Walking skeleton** | 1, 2, 3, 4 | Project scaffolding + terminal + layout + persistence |
| **M2: Git-aware** | 5, 6 | File tree + git graph + diff viewer |
| **M3: Agent-native** | 7, 8 | Agent spawning + parsing + timeline + cost |
| **M4: Production-ready** | 9 | Polish, performance, resilience, Linux |

## Task Dependencies

```
Epic 1 (scaffolding) ──→ all other epics
Epic 2 (persistence) ──→ Epic 3 (layout persistence)
Epic 3 (layout)      ──→ Epic 4 (terminal panels in dockview)
Epic 4 (terminal)    ──→ Epic 7 (agents use PTY)
Epic 5 (fs watcher)  ──→ Epic 6 (git ref watching uses fs watcher)
Epic 6 (git)         ──→ Epic 7.5 (worktree management)
```
