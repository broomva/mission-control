#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Lint: Rust (clippy)"
if [ -f "src-tauri/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cd src-tauri && cargo clippy --quiet -- -D warnings && cd ..
  echo "    ✓ clippy passed"
else
  echo "    ⚠ Skipping clippy"
fi

echo "==> Lint: TypeScript (biome)"
if [ -f "biome.json" ] && command -v bunx >/dev/null 2>&1; then
  bunx biome check --diagnostic-level=error .
  echo "    ✓ biome passed"
else
  echo "    ⚠ Skipping biome"
fi

echo "==> Lint complete"
