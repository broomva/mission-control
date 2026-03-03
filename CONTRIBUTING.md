# Contributing to Mission Control

## Development Setup

1. Install prerequisites (see [README.md](README.md#prerequisites))
2. Clone and install:
   ```bash
   git clone https://github.com/broomva/mission-control
   cd mission-control
   bun install
   ```
3. Start dev server:
   ```bash
   cargo tauri dev
   ```

## Development Workflow

### Before Pushing

Run the full CI pipeline locally:

```bash
make ci
```

This runs:
- `make smoke` — Fast build check (cargo check + bun build)
- `make check` — Linting (clippy + biome) and type checking (cargo check + tsc)
- `make test` — All tests (cargo test + vitest)

### Harness Scripts

Quality gate scripts live in `scripts/harness/`:

| Script | Purpose |
|--------|---------|
| `smoke.sh` | Fast compilation check |
| `lint.sh` | Clippy (Rust) + Biome (TypeScript) |
| `typecheck.sh` | cargo check + tsc --noEmit |
| `test.sh` | cargo test + vitest run |
| `audit.sh` | Harness completeness check |

### Code Style

- **Rust**: Follow clippy recommendations. All warnings are treated as errors.
- **TypeScript**: Biome handles formatting and linting. Run `bunx biome check --write .` to auto-fix.
- **Package manager**: Bun only. Never use npm, yarn, or pnpm.
- **Linter**: Biome only. Never use ESLint or Prettier.

### Type Safety

- All Rust types exposed to the frontend must derive `specta::Type`
- All Tauri commands must return `Result<T, E>` where E is serializable
- TypeScript bindings are auto-generated — never edit `src/bindings.ts`

## Pull Request Guidelines

1. Run `make ci` before submitting
2. Keep changes focused — one feature or fix per PR
3. Update documentation if the change affects developer workflow
4. Add tests for new functionality

## Project Structure

See [README.md](README.md#architecture) for the architecture overview and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full boundary map.
