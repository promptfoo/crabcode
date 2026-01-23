.PHONY: test test-docker install lint help

help:
	@echo "Crabcode Makefile"
	@echo ""
	@echo "Commands:"
	@echo "  make test        Run unit tests"
	@echo "  make test-docker Run tests in Docker"
	@echo "  make install     Install crabcode to /usr/local/bin"
	@echo "  make lint        Run shellcheck"
	@echo ""

test:
	@chmod +x tests/run.sh
	@./tests/run.sh

test-docker:
	@chmod +x tests/run.sh
	@./tests/run.sh --docker

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
