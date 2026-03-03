# PLANS.md

## Objective

- Outcome: Ship Mission Control v1 — a Tauri 2.0 desktop app that unifies terminal management, file visualization, git diff graphs, and AI agent orchestration across multiple projects.
- Why it matters: No existing tool combines terminal multiplexing + git visualization + agent orchestration. Developers running AI agents across projects lack a unified control surface.
- Non-goals (v1): Windows support, built-in editor, agent-to-agent communication, cloud sync, plugin system, automated conflict resolution, cost-aware model routing.

## Constraints

- Runtime/tooling: Tauri 2.0 (Rust 2021 edition), React 19, TypeScript 5, Bun, Biome.
- Security: Tauri capability-based permissions. PTY sandboxed per project. No agent credential storage.
- Performance: <100MB idle memory, <1s startup, 60 FPS terminal rendering, <500ms file tree updates, <2s git graph render for 10k commits.
- Platform: macOS primary (Apple Silicon + Intel), Linux secondary, Windows deferred.

## Context Snapshot

- Relevant files/modules: `docs/spec/01-requirements.md`, `docs/spec/02-design.md`, `docs/spec/03-tasks.md`
- Research: `/Users/broomva/mission-control-research.md`
- Known risks:
  - `portable-pty` + `tauri-plugin-pty` less mature than Electron's `node-pty`
  - WebView inconsistencies across macOS/Linux (Safari WebKit vs WebKitGTK)
  - Rust recompilation slower than Node.js hot reload during development
  - Agent output format stability — CLIs may change NDJSON schemas

## Execution Plan

1. **M1: Walking Skeleton** (Epics 1-4)
   - Expected output: Tauri app with dockable panels, terminal emulation, project management, persistence
   - Verification: `make smoke` passes, can create project, spawn terminal, type commands, close/reopen with state preserved

2. **M2: Git-Aware** (Epics 5-6)
   - Expected output: Live file tree with git status, commit graph with click-to-diff, branch switching
   - Verification: Add project with git history, see colored file tree, click commit to view diff, see graph update on new commit

3. **M3: Agent-Native** (Epics 7-8)
   - Expected output: Spawn Claude Code/Codex/Gemini agents, parse structured output, unified timeline, cost tracking
   - Verification: Spawn Claude Code with `stream-json`, see parsed events in timeline, see cost accumulate on agent card

4. **M4: Production-Ready** (Epic 9)
   - Expected output: Performance-optimized, error-resilient, Linux-tested release build
   - Verification: `make ci` passes, <100MB idle, 60 FPS terminal, error boundary catches panel crashes, works on Ubuntu 22.04

## Checkpoints

- [ ] M1: Walking skeleton complete
- [ ] M2: Git integration complete
- [ ] M3: Agent management complete
- [ ] M4: Production-ready

## Decision Log

- 2026-03-03
  - Decision: Use Tauri 2.0 over Electron
  - Reason: Rust library ecosystem (git2, notify, portable-pty) maps directly to core requirements. 5-10x memory advantage. SoloTerm validates approach.
  - Alternatives: Electron (mature PTY, higher memory), pure CLI/TUI (lower scope)

- 2026-03-03
  - Decision: Use Dockview for panel layout
  - Reason: Zero deps, serialization for persistence, floating panels, popout windows, actively maintained.
  - Alternatives: FlexLayout (fewer features), custom (high cost)

- 2026-03-03
  - Decision: Use Zustand for frontend state
  - Reason: Slice pattern fits per-project/per-agent stores. React-external access needed for Tauri event listeners.
  - Alternatives: Redux Toolkit (verbose), Jotai (less suited to event-driven updates)

## Final Verification

- Commands run: _pending_
- Key outputs: _pending_
- Follow-up tasks: _pending_
