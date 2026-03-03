#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Typecheck: Rust"
if [ -f "src-tauri/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cd src-tauri && cargo check --quiet && cd ..
  echo "    ✓ cargo check passed"
else
  echo "    ⚠ Skipping cargo check"
fi

echo "==> Typecheck: TypeScript"
if [ -f "tsconfig.json" ] && command -v bunx >/dev/null 2>&1; then
  bunx tsc --noEmit
  echo "    ✓ tsc passed"
else
  echo "    ⚠ Skipping tsc"
fi

echo "==> Typecheck complete"
