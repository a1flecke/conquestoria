#!/bin/sh

set -eu

echo "Running pre-commit checks: tests"
./scripts/run-with-mise.sh yarn test

echo "Running pre-commit checks: build"
./scripts/run-with-mise.sh yarn build
