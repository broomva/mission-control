.PHONY: smoke test lint typecheck check ci dev build clean

# Harness commands — keep names stable
smoke:
	@./scripts/harness/smoke.sh

lint:
	@./scripts/harness/lint.sh

typecheck:
	@./scripts/harness/typecheck.sh

check: lint typecheck

test:
	@./scripts/harness/test.sh

ci: smoke check test

# Development
dev:
	cargo tauri dev

build:
	cargo tauri build

clean:
	cargo clean
	rm -rf node_modules dist
