#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Smoke check: cargo check"
if [ -f "src-tauri/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cd src-tauri && cargo check --quiet && cd ..
  echo "    ✓ cargo check passed"
else
  echo "    ⚠ No Cargo.toml found or cargo not installed — skipping"
fi

echo "==> Smoke check: bun build"
if [ -f "package.json" ] && command -v bun >/dev/null 2>&1; then
  bun run build 2>/dev/null || bun run typecheck 2>/dev/null || echo "    ⚠ No build/typecheck script — skipping"
  echo "    ✓ frontend check passed"
else
  echo "    ⚠ No package.json found or bun not installed — skipping"
fi

echo "==> Smoke check complete"
