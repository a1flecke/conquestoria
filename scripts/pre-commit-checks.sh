#!/bin/sh

set -eu

./scripts/pre-commit-guardrails.sh

echo "Running pre-commit checks: tests"
./scripts/run-with-mise.sh yarn test

echo "Running pre-commit checks: build"
./scripts/run-with-mise.sh yarn build
