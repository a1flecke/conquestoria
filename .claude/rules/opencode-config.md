---
paths:
  - ".opencode/**"
  - "AGENTS.md"
  - "CLAUDE.md"
  - "scripts/dev.sh"
  - "scripts/run-with-mise.sh"
---

# OpenCode approver plugin and local OpenCode config

Guardrails for any agent (Claude Code, Codex, OpenCode) that touches the user's **local OpenCode setup** or the
list of commands the approver plugin auto-approves. The plugin is `a1flecke/opencode-auto-approval`; it is a
security control, so a wrong "allow" is worse than a needless prompt. The same text, condensed, is in `AGENTS.md`
for Codex and OpenCode.

## 1. Who may change the user's OpenCode config

`~/.config/opencode/**` (config, plugins, `service.json` with a credential, backups) belongs to the human.
Change it **only when the user explicitly asks in the current conversation**, back the file up to
`~/.config/opencode/backups/` first, change only the lines that were asked for, and never copy anything from it
into a repository, issue, PR, log or prompt. Do not read `service.json` aloud or echo its contents.

## 2. Plugin releases live OUTSIDE `~/.config/opencode/plugins/`

OpenCode **auto-loads every folder under `~/.config/opencode/plugins/`**, with default (empty) options, *in
addition to* whatever the config's `plugins` array lists. A release unpacked there runs twice (once option-less),
every older version keeps running, and a broken old build fails on every start. So:

- Unpack releases to `~/.config/opencode/plugin-releases/opencode-auto-approval@<version>/` (not discovered) and
  point the `package` path of the single `plugins` entry in `opencode.jsonc` at it. Options (`trustedRoots`,
  `trustedScripts`, model, key variable) exist only on that explicit entry.
- Never put a plugin folder, old version, or dev checkout in `plugins/`. Never run a dev checkout as the approver.

## 3. Upgrade procedure (do all of it; stop at the first failure)

1. `gh release list --repo a1flecke/opencode-auto-approval`; read the release notes and the diff since the
   installed version (`git diff v<old> v<new>` in a fresh worktree of the plugin repo; run its tests with
   `mise run test`). Say what changed and what it newly auto-approves before installing.
2. Download the `.tgz` and `.sha256`; `shasum -a 256 -c <file>.sha256`; `gh attestation verify <tgz> --repo
   a1flecke/opencode-auto-approval` (must show a build from that repo's workflow on `main`). No `.sha256`, no
   attestation, or a mismatch means **stop and tell the user**.
3. Unpack with `tar -xzf … --strip-components=1` into a new `plugin-releases/opencode-auto-approval@<version>`
   directory, compare the `.ts` files with the tagged source, then `chmod -R a-w` it.
4. Back up `opencode.jsonc`, change **only** the `package` path, and `diff` the two files to prove nothing else
   moved. Keep the previous version directory for rollback (roll back by restoring the old path).
5. **Restart only when OpenCode is idle**: the `opencode-cli serve --service` process has no child processes
   (another agent may be mid-task, for example watching CI). Quit the app, stop the old server by its **exact
   pid** (never `pkill`/`killall`, which also hits other agents), relaunch the app.
6. Verify the configured approver identity and options at each active location in the new server run, no
   `failed to load plugin`, and recent permission-hook decisions. Multiple locations can initialize the plugin:
   a server-wide count of load messages does not prove readiness. Check diagnostics for preflight and reviewer
   routes, reason codes, malformed outputs and exceptions; aggregate allow/ask counts do not measure human clicks.
   Report the new server pid and the result.

## 4. What may be added to `trustedScripts`

The plugin runs a listed script without a prompt when the command is exactly `./<listed path>` plus plain
path/word arguments (no flags, no shell composition) and the script and everything in its directory are tracked
and unmodified from `HEAD`. It judges the **arguments' shape, not what the script does with them**. Therefore:

- List only narrow, purpose-built scripts whose behaviour is fixed in the script (today `scripts/dev.sh`,
  `sync-main.sh`, `push-branch.sh`, …). A new fixed task is added **to the dispatcher**, not by trusting a generic
  runner.
- **Never** list a script that executes its arguments: `scripts/run-with-mise.sh` (`mise exec -- "$@"`),
  `run-under-host-lease.sh`, `run-durable-test-suite.sh`, `host-verification-lease.sh` (sourced), anything that
  forwards `"$@"` into command position, signals processes (`stop-local-verification.sh`), or sets up remote access.
  Trusting `run-with-mise.sh` would auto-approve `./scripts/run-with-mise.sh gh pr merge 5` and
  `… git push origin main`.
- A script that an agent can edit and commit counts as `HEAD`, so changes under `scripts/` that touch a listed
  script need human review; do not add a script to the list in the same PR that creates or rewrites it without
  saying so in the PR body.
- The user edits `trustedScripts` in their own config (section 1); a repository PR can only *propose* a script.

## 5. Filing issues against the plugin

The plugin repo is **public**. Issues and PRs there must be generic: no private project names, real paths,
usernames or machine names, no secrets; use placeholders and aggregate numbers. Plugin changes are made in that
repo through a branch and PR, never by editing an installed copy under `plugin-releases/` (they are read-only on
purpose).

## 6. Diagnose routine prompts without widening permissions

Use direct canonical commands first. When a script directory has modified or untracked siblings, a `dev.sh`,
`sync-main.sh` or `push-branch.sh` prompt is intentional even if the invoked script itself is unchanged. Review
those changes rather than bypassing the directory-integrity check. Unsupported flags, refs and shell composition
also remain reviewable. Filter support in the parser alone does not prove the live adapter recognizes scanner-split
resources: it must bind them to the original source shell call and preserve destructive-command guards.

Treat project instructions as the authority for project-specific helpers. Global guidance should defer to the
project's `sync-main.sh` and `push-branch.sh` recipes, not require a hand-written force-with-lease push. Update a
user-owned global guardrail only under section 1; never copy the credential-bearing configuration into an MR.
Creating an MR does not authorize `gh pr review --approve`: explicit permission for that exact remote action is
required, and an agent must not approve its own MR.
