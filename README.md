# Mission Control

A Tauri 2.0 desktop app for unified terminal management and AI agent orchestration across multiple projects.

## Features

- **Liquid Glass UI** — Apple-style translucent surfaces with backdrop-filter blur and CSS design tokens
- **Terminal Multiplexing** — Spawn and manage multiple PTY sessions per project in dockable panels
- **Project Workspace** — Sidebar navigation, file browser, and multi-terminal workspace per project
- **Git Integration** — Status-colored file tree, commit log with branch refs, diff viewer with hunk-level rendering
- **Live File Watching** — Filesystem watcher per project with debounced git status and ref change events
- **Dockable Layout** — Flexible panel arrangement with dockview-react, layout persistence
- **Typed IPC** — Auto-generated TypeScript bindings from Rust types via specta

## Prerequisites

- **Rust** (stable, >= 1.77) — install via [rustup](https://rustup.rs)
- **Bun** (>= 1.0) — install via [bun.sh](https://bun.sh)
- **macOS** — Xcode Command Line Tools (`xcode-select --install`)

## Quick Start

```bash
git clone https://github.com/broomva/mission-control
cd mission-control
bun install
cargo tauri dev
```

## Harness Commands

| Command | Purpose |
|---------|---------|
| `make smoke` | Fast sanity check (cargo check + bun build) |
| `make check` | Static analysis (clippy + biome + tsc) |
| `make test` | Run all tests (cargo test + vitest) |
| `make ci` | Full CI pipeline (smoke + check + test) |
| `make dev` | Launch dev server with HMR |
| `make build` | Build production binary |

## Architecture

```
Frontend (React 19 / TypeScript)  →  Tauri IPC (typed via specta)  →  Backend (Rust)
     ↑                                                                      │
     └────────── Tauri events (typed, broadcast) ───────────────────────────┘
```

### Backend (Rust)

- `src-tauri/src/services/` — Core business logic
  - `project.rs` — Project registry CRUD
  - `terminal.rs` — PTY lifecycle via portable-pty
  - `persistence.rs` — JSON file persistence to `~/.mission-control/`
  - `git.rs` — Git operations via libgit2 (status, log, diff, branches)
  - `fs_watcher.rs` — Filesystem watching with notify + debounce
- `src-tauri/src/commands/` — Tauri IPC command handlers
- `src-tauri/src/models/` — Typed data models (serde + specta)

### Frontend (React + TypeScript)

- `src/stores/` — Zustand state slices (project, terminal, layout, git)
- `src/panels/` — Dockview panel components (dashboard, terminal, diff viewer)
- `src/layout/` — App shell, sidebar, context panel, dock wrapper
- `src/components/` — Reusable UI (project card, file tree, git log, dialogs)
- `src/styles/` — Liquid Glass design system (tokens, base, glass, components, layout)
- `src/bindings.ts` — Auto-generated typed bindings (do not edit)

### Key Design Decisions

- All Rust types derive `specta::Type` for automatic TypeScript generation
- All IPC commands return `Result<T, AppError>` with typed errors
- Frontend receives events via `Tauri.event.listen()` — never polls
- State persisted to `~/.mission-control/` as JSON

See `docs/ARCHITECTURE.md` for the full boundary map.

## Testing

### Rust (29 tests)

```bash
cd src-tauri && cargo test
```

Tests cover persistence (save/load, corruption recovery), project CRUD, terminal service edge cases, git operations (status, log, diff, branches), and filesystem watcher lifecycle.

### Frontend (38 tests)

```bash
bun run test
```

Tests cover Zustand store logic with mocked Tauri IPC bindings for project, terminal, layout, and git stores.

## License

[MIT](LICENSE)
