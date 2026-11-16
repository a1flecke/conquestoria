---
name: pstack
description: Apply Conquestoria's evidence-first workflow when asked to use pstack, trace an existing code path, fix a reproducible bug, implement a feature, or refactor while preserving behavior.
---

# pstack for Conquestoria

Read the repository root's `AGENTS.md`, `CLAUDE.md`, and the relevant `.claude/rules/` files. They govern the work. Use this workflow for the current task, work inline, and keep the selected model and speed. Treat investigation, implementation, and delivery as separate requests unless the user asks for them together.

Start at the entry point that matters to the task. Follow the relevant callers, state mutations, events, and consumers as far as needed to establish what happens. Start with the named paths and expand the search only where the trace requires it.

## Investigation

Keep questions about existing behavior read-only. Explain how the live path works and cite the definitions and callers that establish the answer. For questions about why a decision was made, look for its rationale in scoped history or project documentation. Identify inferences and gaps in the evidence.

## Implementation

Apply the worktree and bootstrap steps in `AGENTS.md` before editing. Present a plan and pause before expanding beyond a small bounded change.

- **Bug fix.** Reproduce the reported symptom through the same entry point, or identify where reproduction is blocked. Trace the first divergence from expected behavior. Assert the fixture's prerequisites and watch the smallest relevant regression fail for the expected reason before changing production code. Fix the shared cause, inspect other affected callers, and rerun the same regression.
- **Feature.** Identify who initiates the action, what state or contract changes, and where the user can observe the outcome. Reuse the canonical system or helper for shared gameplay consequences. Trace the new behavior through to its live player-facing consumer and cover the affected interaction as required by the repo rules.
- **Refactor.** Identify the existing contract and establish a passing characterization or equivalence check before moving code. Reuse existing coverage when it proves the contract. Keep the check green through the change and inspect every affected caller, including older data and callers of shared helpers where applicable.

## Verification and delivery

Use `./scripts/dev.sh verify-impact` to identify the required evidence. Follow the repository's source-rule and mirrored-test selection guidance and run the narrowest relevant validation first. For player-visible work, check the outcome at the surface used by the player, such as a DOM interaction or the rendered canvas. After two materially similar failures, stop and report the evidence.

Review the committed branch delta and the uncommitted diff. Report the result, the commands and outcomes that establish it, and any remaining gaps. Delivery follows repository policy when requested. In OpenCode, `/work-issue` and `/ship` remain the entry points for their existing delivery workflows. Invoking pstack by itself authorizes no remote actions.

Adapted from [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack). See [LICENSE](LICENSE).
