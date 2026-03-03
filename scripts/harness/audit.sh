#!/usr/bin/env bash
set -euo pipefail

root_dir="${1:-.}"
root_dir=$(cd "$root_dir" && pwd)

echo "==> Harness Audit: $root_dir"
echo ""

status=0

check_file() {
  local file="$1"
  local label="$2"
  if [ -f "$root_dir/$file" ]; then
    echo "  ✓ $label ($file)"
  else
    echo "  ✗ MISSING: $label ($file)"
    status=1
  fi
}

check_executable() {
  local file="$1"
  local label="$2"
  if [ -x "$root_dir/$file" ]; then
    echo "  ✓ $label ($file)"
  elif [ -f "$root_dir/$file" ]; then
    echo "  ⚠ EXISTS but not executable: $label ($file)"
    status=1
  else
    echo "  ✗ MISSING: $label ($file)"
    status=1
  fi
}

echo "--- Harness Files ---"
check_file "AGENTS.md" "Agent instructions"
check_file "PLANS.md" "Execution plans"
check_file "Makefile" "Makefile with harness targets"
check_file "docs/ARCHITECTURE.md" "Architecture doc"
check_file "docs/OBSERVABILITY.md" "Observability doc"

echo ""
echo "--- Harness Scripts ---"
check_executable "scripts/harness/smoke.sh" "Smoke check"
check_executable "scripts/harness/lint.sh" "Lint check"
check_executable "scripts/harness/typecheck.sh" "Type check"
check_executable "scripts/harness/test.sh" "Test runner"

echo ""
echo "--- Spec Documents ---"
check_file "docs/spec/01-requirements.md" "Requirements spec"
check_file "docs/spec/02-design.md" "Design spec"
check_file "docs/spec/03-tasks.md" "Task plan"

echo ""
echo "--- Makefile Targets ---"
for target in smoke check test ci lint typecheck; do
  if grep -q "^${target}:" "$root_dir/Makefile" 2>/dev/null; then
    echo "  ✓ make $target"
  else
    echo "  ✗ MISSING: make $target"
    status=1
  fi
done

echo ""
if [ $status -eq 0 ]; then
  echo "==> Audit PASSED"
else
  echo "==> Audit FAILED — fix items marked with ✗"
fi

exit $status
