# OpenCode + Tailscale Remote Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a private, repeatable iPhone-to-Mac OpenCode workflow for Conquestoria without public exposure or weakened repository protections.

**Architecture:** OpenCode Desktop's V2 background service remains password-protected and binds only to `127.0.0.1:49374`. A small repository script validates the environment, starts that service, and makes a persistent Tailscale Serve HTTPS proxy to that loopback address only after confirming no Funnel or unrelated Serve rule exists. A project-level OpenCode configuration and commands provide unattended routine development while global deny rules preserve protection of credentials and destructive operations.

**Tech Stack:** POSIX shell, mise tasks, OpenCode V2 CLI, Tailscale Serve, macOS `caffeinate`, OpenCode JSONC configuration.

---

### Task 1: Preserve the canonical instruction model

**Files:**
- Modify: `AGENTS.md:3-35`
- Create: `.opencode/opencode.jsonc`
- Create: `.opencode/commands/work-issue.md`
- Create: `.opencode/commands/ship.md`

- [x] **Step 1: Update the repository instruction identity.**

Replace Codex-specific wording with an instruction that `AGENTS.md` is mandatory for every coding agent and that agents must read `CLAUDE.md` plus the applicable `.claude/rules/*.md`. Add the canonical Node/Yarn command rule:

```text
All automated coding agents must use `./scripts/run-with-mise.sh <command>`
for normal project Node/Yarn commands. Do not invoke bare yarn, npm, npx, or
node when an equivalent wrapper command exists.
```

- [x] **Step 2: Add project-specific V2 permissions.**

Create `.opencode/opencode.jsonc` with the V2 schema, `share: "disabled"`, and `agents.build.permissions`. Put broad `shell: ask` before narrow allows for repository inspection, `./scripts/run-with-mise.sh *`, normal Git/GitHub operations, and `mise *`; append denials for `sudo *`, destructive removal/reset/clean/restore, force push, credential-path reads, and `tailscale *`. Keep the selected build agent responsible for never merging without an explicit user request.

- [x] **Step 3: Add direct mobile-friendly commands.**

Create `/work-issue` and `/ship` Markdown commands. Both must start by reading `AGENTS.md` and applicable policy, use the wrapper for project commands, inspect verification state before launching heavyweight work, and report the branch/PR result. `/work-issue` creates an isolated feature branch; neither command may merge without an explicit user instruction.

- [x] **Step 4: Verify configuration discovery without secrets.**

Run the bundled OpenCode V2 CLI from the worktree, inspect the effective diagnostics available in the installed version, and confirm `AGENTS.md` is the project instruction source. Do not print the OpenCode pairing password, provider credentials, or GitHub token.

### Task 2: Add safe, idempotent local and remote operations

**Files:**
- Create: `scripts/setup-opencode-local.sh`
- Create: `scripts/opencode-remote.sh`
- Modify: `mise.toml:1-8`

- [x] **Step 1: Create a failing shell contract test.**

Add `tests/hooks/opencode-remote.test.sh` that runs the remote script against stubbed `opencode`, `tailscale`, `curl`, `lsof`, and `caffeinate` executables in a temporary directory. It must prove:

```text
status performs no mutation;
start refuses a Funnel target;
start refuses non-empty unowned Serve configuration;
stop does not run `tailscale down`;
ready fails when the listener is not loopback-only.
```

Run `bash tests/hooks/opencode-remote.test.sh`; expected initial result is failure because `scripts/opencode-remote.sh` does not exist.

- [x] **Step 2: Implement the setup checker.**

`setup-opencode-local.sh` locates either PATH `opencode` or OpenCode Desktop's user-installed CLI, verifies the V2 command surface and project JSONC, checks `gh auth status`, checks the active worktree hooks, checks mise, and creates no secrets. It must not rewrite unrelated global configuration; project-level agent permissions override the existing global prompt policy only in this repository.

- [x] **Step 3: Implement the remote lifecycle script.**

`opencode-remote.sh` supports `start`, `ready`, `status`, `pair`, and `stop`:

```text
start: enforce service hostname=127.0.0.1, port=49374, mdns=false; start and
       prove the local listener/HTTP response; refuse any Funnel; refuse an
       unowned non-empty Serve configuration; create the HTTPS Serve proxy;
       record ownership in ~/Library/Application Support/Conquestoria/OpenCode Remote;
       start one owned `caffeinate -i`; print the MagicDNS URL.
ready: strict, read-only preflight; nonzero for any missing safety condition.
status: read-only diagnostics and exit zero even when unhealthy.
pair: call `opencode pair --url https://<MagicDNS-name>` without logging the
      generated password beyond OpenCode's normal protected pairing output.
stop: stop only the OpenCode service, this setup's matching HTTPS Serve rule,
      and this setup's recorded caffeinate PID; leave Tailscale connected.
```

The script must preserve unrelated Serve state by refusing to configure a non-empty unowned configuration rather than using `tailscale serve reset`. It must never call Funnel, `tailscale down`, or change router/firewall settings.

- [x] **Step 4: Wire the daily mise commands.**

Add exactly these tasks to `mise.toml`:

```toml
[tasks."opencode:remote"]
description = "Securely start OpenCode remote access over Tailscale"
run = "scripts/opencode-remote.sh start"

[tasks."opencode:remote:ready"]
description = "Strict leave-home preflight for remote OpenCode"
run = "scripts/opencode-remote.sh ready"

[tasks."opencode:remote:status"]
description = "Show OpenCode/Tailscale remote-access status"
run = "scripts/opencode-remote.sh status"

[tasks."opencode:remote:pair"]
description = "Show OpenCode pairing information for private remote access"
run = "scripts/opencode-remote.sh pair"

[tasks."opencode:remote:stop"]
description = "Stop OpenCode remote access and owned sleep prevention"
run = "scripts/opencode-remote.sh stop"
```

- [x] **Step 5: Verify the shell contract turns green.**

Run `bash tests/hooks/opencode-remote.test.sh`, then `./scripts/run-with-mise.sh yarn test:hooks`. Expected result: both commands exit zero.

### Task 3: Configure and verify the local machine

**Files:**
- User-local state only: `~/Library/Application Support/Conquestoria/OpenCode Remote/`

- [x] **Step 1: Run the non-mutating local setup audit.**

Run `mise run opencode:remote:status` and `scripts/setup-opencode-local.sh`. Confirm OpenCode V2, Tailscale connectivity, MagicDNS, GitHub CLI authentication, and worktree hook state; do not print secrets.

- [x] **Step 2: Start private Serve and handle its authorization boundary.**

Run `mise run opencode:remote`. If Tailscale requests first-time HTTPS/Serve approval, stop and ask the user to approve tailnet-only HTTPS while explicitly declining Funnel. Re-run exactly the failed command after approval.

- [x] **Step 3: Verify end-to-end private exposure and idempotency.**

Run start twice, ready, status twice, pair, stop twice, and ready once after stop. Prove the OpenCode socket is loopback-only, local HTTP responds, the Tailscale HTTPS mapping targets `127.0.0.1:49374`, no Funnel configuration targets it, and exactly one owned caffeinate process exists while started.

- [x] **Step 4: Apply the separate macOS firewall decision.**

The audit found the macOS application firewall disabled. Before changing it, obtain explicit user approval because enabling it can affect unrelated incoming services. If approved, enable it through System Settings, then re-check the state; otherwise document the remaining host-hardening gap while preserving the localhost-plus-Tailnet design.

### Task 4: Review and deliver

**Files:**
- Review: every changed repository file plus user-local state metadata

- [ ] **Step 1: Run source-appropriate verification.**

Run `./scripts/run-with-mise.sh yarn test:hooks` and the focused remote-script test. Run `./scripts/run-with-mise.sh yarn build` before any commit/push because the repository requires it for delivery; use durable suite verification only if this work is going to be committed/pushed.

- [ ] **Step 2: Inspect all deltas.**

Run `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`, and review the security-sensitive script/config sections in full. Confirm `.opencode` is tracked, while the user-local state directory is outside the repository and contains no credentials.

- [ ] **Step 3: Report exact operating instructions and rollback.**

Give the user the five `mise run opencode:remote...` commands, the private Safari URL, iPhone pairing steps, the firewall status, and rollback commands that stop only the owned Serve/caffeinate state. Do not create a PR or merge unless separately requested.

## Security and scope checklist

- OpenCode V2 service: `127.0.0.1:49374`, mDNS disabled, password remains managed by OpenCode.
- Transport: Tailscale Serve HTTPS only; no router forwarding, LAN listener, or Funnel.
- Tailnet: MagicDNS must be active; first HTTPS authorization is an explicit user boundary.
- Credentials: no auth key, provider API key, GitHub token, pairing password, or state metadata enters Git.
- Agent authority: normal scoped development is unattended; destructive shell commands and network/tailnet administration remain blocked or require explicit user direction.
- macOS firewall: currently disabled and intentionally left unchanged pending an explicit user decision.
