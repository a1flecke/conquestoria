---
trigger: glob
globs: "**/.claude/**, **/.agents/**, **/.opencode/**, **/tests/hooks/**, **/AGENTS.md, **/CLAUDE.md, **/GEMINI.md, **/scripts/dev.sh, **/scripts/run-with-mise.sh"
description: "Canonical Conquestoria rules for agent hooks, tooling, policy parity, and OpenCode config."
---

Before editing agent instructions, hooks, tooling scripts, or hook tests, read:
- `.claude/rules/hooks-and-tooling.md` — hook contracts, smoke-test checklist, agent policy parity (`scripts/check-agent-policy-parity.mjs`), shared-host verification lanes, dev servers, and PR bodies.
- `.claude/rules/opencode-config.md` — guardrails for `~/.config/opencode/**` and `trustedScripts`.

Run `./scripts/dev.sh verify-impact` to check required hook verification before finishing.
