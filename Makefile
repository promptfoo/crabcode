.PHONY: test test-docker test-e2e install lint help

help:
	@echo "Crabcode Makefile"
	@echo ""
	@echo "Commands:"
	@echo "  make test        Run unit tests"
	@echo "  make test-docker Run tests in Docker"
	@echo "  make test-e2e    Run end-to-end tests in Docker (full promptfoo-cloud simulation)"
	@echo "  make install     Install crabcode to /usr/local/bin"
	@echo "  make lint        Run shellcheck"
	@echo ""

test:
	@chmod +x tests/run.sh
	@./tests/run.sh

test-docker:
	@chmod +x tests/run.sh
	@./tests/run.sh --docker

test-e2e:
	@echo "Building e2e test container..."
	@chmod +x tests/e2e/run_e2e.sh
	@docker build -t crabcode-e2e -f tests/e2e/Dockerfile.e2e .
	@echo ""
	@echo "Running end-to-end tests..."
	@docker run --rm crabcode-e2e

install:
	@chmod +x src/crabcode
	@cp src/crabcode /usr/local/bin/crabcode
	@echo "Installed to /usr/local/bin/crabcode"

lint:
	@if command -v shellcheck &>/dev/null; then \
		shellcheck src/crabcode; \
		echo "Lint passed"; \
	else \
		echo "shellcheck not installed, skipping lint"; \
	fi
