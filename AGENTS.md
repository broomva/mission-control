# AGENTS.md

## Project Overview

- Project: `mission-control`
- Primary runtime(s): Rust (backend), TypeScript/React (frontend)
- Main entrypoint(s): `src-tauri/src/main.rs` (Rust), `src/main.tsx` (React)
- Framework: Tauri 2.0
- Package manager: Bun (frontend), Cargo (backend)
- Linter: Biome (frontend), Clippy (backend)

## Harness Commands

Run from repository root:

| Goal | Command |
|---|---|
| Fast sanity check | `make smoke` |
| Static checks (lint + typecheck) | `make check` |
| Full test suite | `make test` |
| CI-equivalent local run | `make ci` |
| Frontend dev server | `make dev` |
| Build release binary | `make build` |

## Constraints And Guardrails

- Use Bun for all frontend package operations. Never use npm, yarn, or pnpm.
- Use Biome for all frontend linting/formatting. Never use ESLint or Prettier.
- All Rust types exposed to frontend MUST derive `specta::Type` for auto TypeScript generation.
- All Tauri commands MUST return `Result<T, E>` where E implements `Serialize + specta::Type`.
- All IPC between frontend and Rust backend uses typed commands — no arbitrary code execution.
- Agent CLIs (claude, codex, gemini) are external dependencies; the app does not manage their installation.
- Keep command names stable (`smoke`, `check`, `test`, `ci`, `dev`, `build`).
- Update docs and scripts in the same change when workflow behavior changes.

## Frontend Styling

- Design system uses **Liquid Glass** — translucent surfaces with `backdrop-filter` blur, CSS custom properties, and reusable utility classes.
- All design tokens live in `src/styles/tokens.css` as CSS custom properties.
- Style files: `tokens.css` → `base.css` → `glass.css` → `components.css` → `layout.css`, barrel-imported by `src/index.css`.
- Never hard-code hex colors — use `var(--token-name)`.
- Glass utilities (`.glass`, `.glass-interactive`, etc.) are in `glass.css`.
- Existing component class names are preserved — restyle via CSS, not JSX changes.
- Dockview theme stays `abyss` — overridden via `--dv-*` CSS custom properties.
- Dark theme only for now.

## Architecture Boundaries

- Parse and validate all external data (git, filesystem, agent output, PTY) at the Rust boundary layer.
- Keep internal data models typed with serde + specta.
- Each Rust service owns its state and exposes operations via Tauri commands.
- Frontend receives typed events via `Tauri.event.listen()` — never polls.
- See `docs/ARCHITECTURE.md` for full boundary map.

## Observability Expectations

- Use `tracing` crate for all Rust structured logging.
- Include `project_id` and `agent_id` in agent-related log spans.
- Emit structured event names for major transitions (agent.start, agent.stop, git.ref_changed, fs.event).
- Keep event fields stable for querying.
- See `docs/OBSERVABILITY.md` for field definitions.

## Execution Plans

- For tasks expected to exceed ~30 minutes, create/update `PLANS.md` before coding.
- Track scope, constraints, milestones, and verification steps.
- Task plan lives in `docs/spec/03-tasks.md`.

## Static Analysis And Quality Gates

- Run `make check` before `make test`.
- Run `make ci` before pushing large refactors.
- Treat lint/type failures as blocking.
- Biome uses `--diagnostic-level=error` to only fail on errors.

## Entropy Management

- Remove stale scripts/docs quickly.
- Keep templates and real workflows in sync.
- Run periodic harness audits: `scripts/harness/audit.sh .`
