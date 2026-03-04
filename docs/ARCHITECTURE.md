# Architecture

## Purpose

Mission Control is a Tauri 2.0 desktop application that provides a unified control surface for developers running AI coding agents across multiple projects. It combines terminal multiplexing, filesystem monitoring, git visualization, and agent orchestration.

## System Layers

```
Frontend (React/TypeScript)  →  Tauri IPC (typed via specta)  →  Backend (Rust)
     ↑                                                              │
     └────────── Tauri events (typed, broadcast) ───────────────────┘
```

## Boundaries

| Boundary | Input | Output | Owner |
|---|---|---|---|
| Tauri IPC (commands) | Frontend invoke() | Typed Result<T, E> | `src-tauri/src/commands/` |
| Tauri IPC (events) | Backend AppHandle::emit() | Typed event payload | `src-tauri/src/services/` |
| Git boundary | libgit2 raw objects | `CommitInfo`, `DiffInfo`, `FileStatusEntry` | `GitService` |
| Filesystem boundary | OS filesystem events (notify) | `FsEvent` enum | `FsWatcherService` |
| PTY boundary | Raw byte stream | Terminal data events | `TerminalService` |
| Agent output boundary | NDJSON text lines | `AgentEvent` enum | `AgentService` + parsers |
| Persistence boundary | JSON files on disk | Typed `WorkspaceState` | `PersistenceService` |

## Data Shape Contracts

- Parse and validate external data at boundaries (Rust service layer).
- Convert to internal typed models (serde structs with `specta::Type`) before crossing module boundaries.
- Frontend receives only typed data — no raw strings or unstructured JSON from IPC.
- Agent output parsers implement `AgentOutputParser` trait and normalize diverse formats into `AgentEvent`.

## Module Ownership Rules

| Module | Responsibility | Owner |
|---|---|---|
| `src-tauri/src/services/project.rs` | Project registry CRUD | ProjectService |
| `src-tauri/src/services/git.rs` | Git operations (log, diff, status, worktrees) | GitService |
| `src-tauri/src/services/fs_watcher.rs` | Filesystem watching with debounce | FsWatcherService |
| `src-tauri/src/services/terminal.rs` | PTY lifecycle and session management | TerminalService |
| `src-tauri/src/services/agent.rs` | Agent spawning, lifecycle, output parsing | AgentService |
| `src-tauri/src/services/persistence.rs` | Workspace state save/load | PersistenceService |
| `src-tauri/src/parsers/` | Agent output parsers (Claude, Codex, Gemini) | AgentService |
| `src/panels/` | Dockview panel components | Frontend |
| `src/stores/` | Zustand state slices | Frontend |

## Execution Flow

### Adding a project
1. Entry: User selects directory via `AddProjectDialog`
2. Boundary: `ProjectService.add_project()` validates path exists and is a git repo
3. Core: Register project in memory map, persist to `projects.json`
4. Side effects: Start `FsWatcherService` watcher, open `git2::Repository`
5. Event: Emit `project:added` event to frontend

### Spawning an agent
1. Entry: User fills `SpawnAgentDialog` with agent type and prompt
2. Boundary: `AgentService.spawn_agent()` validates agent CLI exists on PATH
3. Core: Create PTY session, spawn agent process with structured output flags, start output parser task
4. Side effects: Optional worktree creation via `GitService`
5. Events: Emit `agent:spawned`, then continuous `agent:event` stream as parser produces `AgentEvent`s

### Terminal data flow
1. Entry: User types in `TerminalPanel`
2. Frontend → IPC: `write_terminal(id, data)` sends keystrokes to Rust
3. Rust: Writes bytes to PTY master fd
4. PTY → Shell: Shell processes input, produces output
5. Rust reader task: Reads PTY output bytes, emits `terminal:data` event
6. Event → Frontend: xterm.js writes received data to terminal canvas

## Frontend Styling Architecture

The UI uses a **Liquid Glass** design system — translucent surfaces with `backdrop-filter` blur.

```
src/styles/
  tokens.css      — CSS custom properties (colors, spacing, typography, glass, shadows)
  base.css        — Reset, root defaults, scrollbar, focus rings
  glass.css       — Reusable glass-morphism utilities (.glass, .glass-interactive, etc.)
  components.css  — Buttons, cards, dialogs, inputs, empty state
  layout.css      — App shell, sidebar, toolbar, dockview overrides, dashboard grid
src/index.css     — Barrel import of all style files
```

- All colors, spacing, and effects are CSS custom properties in `tokens.css`.
- Glass utilities provide consistent translucent surfaces across all components.
- Dockview's `abyss` theme is overridden via `--dv-*` custom properties — no theme class changes.
- Component styles target existing class names — no JSX changes required for restyling.

## Frontend Layout Architecture

```
AppShell
├── Sidebar (project list, navigation, add project)
├── Toolbar (title, context actions)
└── DockviewWrapper (panel container)
    ├── ProjectDashboard (project grid when no project active)
    ├── FileTreePanel (directory browser per project)
    └── TerminalPanel (xterm.js, multiple per project)
```

## Refactor Checklist

- [ ] Boundary contracts unchanged or versioned.
- [ ] Ownership map still accurate.
- [ ] Integration tests cover boundary paths.
- [ ] specta types regenerated after Rust type changes.
- [ ] Documentation updated in same change.
