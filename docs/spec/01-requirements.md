# Phase 1: Requirements

> Mission Control — AI-native desktop application for multi-project agent orchestration

## 1. Problem Statement

Developers working with AI coding agents (Claude Code, Codex, Gemini CLI) across multiple projects currently lack a unified control surface. They juggle dozens of terminal tabs and windows, manually track what agents are doing, lose session context across restarts, and have no integrated view of git history as agents make changes. No existing tool combines terminal multiplexing, git visualization, file monitoring, and multi-agent orchestration in a single project-scoped desktop application.

## 2. User Stories

### US-01: Multi-Terminal Management
As a developer running multiple AI agents, I want to manage terminal sessions in a free-form dockable layout, so that I can arrange my workspace to match my workflow across projects.

### US-02: File Tree Monitoring
As a developer supervising AI agents, I want to see a live file tree with git status indicators, so that I can monitor which files agents are creating, modifying, or deleting in real time.

### US-03: Git Graph Visualization
As a developer reviewing agent work, I want to see an interactive git commit graph with inline diffs, so that I can understand what each agent changed relative to the project's history.

### US-04: Multi-Project Dashboard
As a developer working on several projects simultaneously, I want a dashboard that shows all active projects with their agent status, so that I can monitor everything from a single control surface.

### US-05: Agent Lifecycle Management
As a developer orchestrating AI agents, I want to spawn, monitor, pause, resume, and stop agents from the UI, so that I have direct control over agent execution without switching to separate terminals.

### US-06: Session Persistence
As a developer who restarts my computer or closes the app, I want my workspace layout, terminal sessions, and project state to persist, so that I can resume exactly where I left off.

### US-07: Agent Output Parsing
As a developer monitoring AI agents, I want structured parsing of agent output (tool calls, file writes, errors, token usage), so that I can see what agents are doing beyond raw terminal scrollback.

### US-08: Cross-Agent Unified Timeline
As a developer running multiple agents on the same project, I want a unified event timeline showing actions from all agents in chronological order, so that I can understand the combined effect of concurrent agent work.

### US-09: Cost Tracking
As a developer managing AI agent usage, I want per-agent and per-project token usage and cost tracking, so that I can budget and optimize my AI spending.

### US-10: Git Worktree Isolation
As a developer running parallel agents on one project, I want automatic git worktree creation per agent, so that agents don't conflict with each other's file changes.

## 3. Acceptance Criteria (EARS Format)

### Terminal Management

- **AC-01**: WHEN user creates a new terminal panel THEN system SHALL spawn a PTY process with the user's default shell in the selected project's working directory.
- **AC-02**: WHEN user drags a terminal panel THEN system SHALL allow free-form repositioning within the dockable layout including floating, tabbed, and split configurations.
- **AC-03**: WHEN user closes and reopens the application THEN system SHALL restore the previous terminal layout and reconnect to persisted PTY sessions.
- **AC-04**: IF terminal output exceeds 10,000 lines THEN system SHALL virtualize scrollback rendering to maintain <60ms frame times.
- **AC-05**: WHEN user resizes a terminal panel THEN system SHALL notify the PTY of the new dimensions within 16ms.

### File Tree

- **AC-06**: WHEN a file is created, modified, or deleted in a watched project directory THEN system SHALL update the file tree within 500ms.
- **AC-07**: WHEN displaying a file entry THEN system SHALL show git status (untracked, modified, staged, conflicted) via color coding consistent with standard git conventions (green=staged, yellow=modified, red=conflicted, gray=untracked).
- **AC-08**: WHEN user clicks a file in the tree THEN system SHALL open a read-only preview of the file content with syntax highlighting.
- **AC-09**: IF a directory contains more than 10,000 entries THEN system SHALL use virtualized rendering and lazy-load subdirectories on expand.
- **AC-10**: WHEN the file tree is first loaded THEN system SHALL respect `.gitignore` rules to exclude ignored files by default, with a toggle to show all files.

### Git Graph

- **AC-11**: WHEN displaying the git graph THEN system SHALL render branch topology, merge points, and commit messages in an interactive scrollable graph.
- **AC-12**: WHEN user clicks a commit THEN system SHALL display the full diff for that commit in a split-pane diff viewer (unified or side-by-side).
- **AC-13**: WHEN an agent creates a new commit THEN system SHALL update the git graph within 2 seconds without full re-render.
- **AC-14**: WHEN displaying a diff THEN system SHALL use syntax-aware highlighting matching the file's language.
- **AC-15**: IF repository has more than 10,000 commits THEN system SHALL paginate the graph and load older commits on scroll.

### Multi-Project Dashboard

- **AC-16**: WHEN user adds a project THEN system SHALL register the directory path and begin file watching, git monitoring, and agent tracking.
- **AC-17**: WHEN displaying the dashboard THEN system SHALL show per-project cards with: project name, active agent count, last activity timestamp, git branch, and overall status indicator.
- **AC-18**: WHEN user clicks a project card THEN system SHALL navigate to that project's full workspace view (terminals, file tree, git graph).
- **AC-19**: WHEN no projects are configured THEN system SHALL display an onboarding flow to add the first project.

### Agent Management

- **AC-20**: WHEN user spawns a Claude Code agent THEN system SHALL execute `claude --output-format stream-json` and parse the NDJSON event stream into structured events on the unified timeline.
- **AC-21**: WHEN user spawns a Codex agent THEN system SHALL execute `codex --json` and parse NDJSON events into the unified event format.
- **AC-22**: WHEN user spawns a Gemini CLI agent THEN system SHALL execute `gemini --output-format json` and parse output into the unified event format.
- **AC-23**: WHEN an agent's status changes (running → waiting → idle → error → complete) THEN system SHALL update the agent status indicator within 1 second.
- **AC-24**: WHEN user requests agent stop THEN system SHALL send SIGTERM, wait 5 seconds, then SIGKILL if the process hasn't exited.
- **AC-25**: IF agent supports session resume (Claude Code `-c`, Codex `--resume`, Gemini `/chat resume`) THEN system SHALL offer a "Resume" action on completed/stopped agents.
- **AC-26**: WHEN agent emits a tool_use event (file write, command execution) THEN system SHALL log it to the unified timeline with timestamp, agent ID, tool name, and parameters.

### Session Persistence

- **AC-27**: WHEN application exits normally THEN system SHALL serialize workspace state (layout, project list, agent sessions, terminal scrollback) to local storage.
- **AC-28**: WHEN application starts THEN system SHALL deserialize and restore the previous workspace state.
- **AC-29**: IF persisted state is corrupt or incompatible THEN system SHALL fall back to default layout and notify the user.

### Cost Tracking

- **AC-30**: WHEN an agent emits token usage data THEN system SHALL record input tokens, output tokens, and compute estimated cost based on configurable per-model pricing.
- **AC-31**: WHEN displaying an agent's status card THEN system SHALL show cumulative token usage and estimated cost for the current session.
- **AC-32**: WHEN displaying a project card THEN system SHALL show aggregate cost across all agents for that project.

### Git Worktree Isolation

- **AC-33**: WHEN user enables worktree isolation for a project THEN system SHALL create a git worktree per spawned agent in a `.mission-control/worktrees/` subdirectory.
- **AC-34**: WHEN an agent in a worktree completes THEN system SHALL offer merge, diff review, or discard options for the worktree branch.
- **AC-35**: IF two worktrees have conflicting changes THEN system SHALL surface the conflict in the unified timeline with affected file paths.

## 4. Non-Functional Requirements

### Performance

- **NFR-01**: Application idle memory SHALL be under 100 MB with no projects loaded.
- **NFR-02**: Application startup time SHALL be under 1 second on Apple Silicon.
- **NFR-03**: Terminal rendering SHALL maintain 60 FPS with WebGL acceleration.
- **NFR-04**: File tree updates SHALL process within 500ms of filesystem events.
- **NFR-05**: Git graph initial render SHALL complete within 2 seconds for repositories with up to 10,000 commits.

### Security

- **NFR-06**: Terminal PTY sessions SHALL be sandboxed per-project using Tauri's capability system.
- **NFR-07**: Agent credentials (API keys) SHALL NOT be stored by the application; agents use their own environment configuration.
- **NFR-08**: IPC between frontend and Rust backend SHALL use typed commands with no arbitrary code execution.

### Platform Support

- **NFR-09**: Primary target: macOS (Apple Silicon and Intel).
- **NFR-10**: Secondary target: Linux (Ubuntu 22.04+, Fedora 38+).
- **NFR-11**: Tertiary target: Windows 10+ (deferred to v2).

### Reliability

- **NFR-12**: Application crash SHALL NOT terminate running agent processes; agents run as independent child processes.
- **NFR-13**: Corrupt project configuration SHALL be isolated; other projects SHALL continue functioning.

## 5. Constraints

- **C-01**: Framework: Tauri 2.0 with Rust backend and React TypeScript frontend.
- **C-02**: Package manager: Bun (never npm/yarn/pnpm).
- **C-03**: Linter: Biome (never ESLint/Prettier).
- **C-04**: No bundled Chromium — uses OS-provided WebView (Safari WebKit on macOS).
- **C-05**: Agent CLIs (claude, codex, gemini) are external dependencies installed by the user; the app does not manage their installation.
- **C-06**: Minimum Rust edition: 2021.
- **C-07**: Minimum Node target: ES2022.

## 6. Out of Scope (v1)

- Windows support (deferred to v2)
- Built-in code editor (use external editors)
- Agent-to-agent communication protocol
- Cloud sync of workspace state
- Plugin/extension system
- Automated conflict resolution (show conflicts, don't auto-resolve)
- Task dependency graphs between agents
- Cost-aware model routing
