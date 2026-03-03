#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root_dir"

echo "==> Test: Rust"
if [ -f "src-tauri/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cd src-tauri && cargo test --quiet && cd ..
  echo "    ✓ cargo test passed"
else
  echo "    ⚠ Skipping cargo test"
fi

echo "==> Test: TypeScript"
if [ -f "package.json" ] && command -v bun >/dev/null 2>&1; then
  if bun run test --help >/dev/null 2>&1; then
    bun run test
    echo "    ✓ frontend tests passed"
  else
    echo "    ⚠ No test script — skipping"
  fi
else
  echo "    ⚠ Skipping frontend tests"
fi

echo "==> Tests complete"
