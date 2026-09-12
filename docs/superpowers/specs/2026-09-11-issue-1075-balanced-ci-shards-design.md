# Issue #1075 balanced CI shard design

## Goal

Replace the misleading `test-fast` / `test-slow` CI jobs with two
duration-balanced full-suite shards, while preserving a separately named,
developer-oriented local test split. Make the routing rule for future tests
explicit and enforce it for both humans and agents.

## Verified evidence

- The 2026-09-11 benchmark commit had `test-fast` execute 622 of 638
  default-discovered Vitest files and `test-slow` execute the remaining 16
  intensive simulation files. Current `origin/main` discovery has since
  advanced to 641 files (624 regular, 17 intensive), confirming that a
  hand-maintained CI partition needs an exhaustive real-discovery guard. The
  current names describe the local-push policy, not CI duration.
- In the first two new fixed-reference runs at
  `4de90e4652b8529e78d5c95ac72e455e003fbc42`, the directly recorded test
  phases were 359.5 seconds for `test-fast` and 194.4 seconds for
  `test-slow`; their GitHub job durations were 387/216 seconds and 370/220
  seconds. The imbalance is real work, not runner queueing.
- The third fixed-reference run had the same test-shard shape (394/224
  seconds), but failed only in the unrelated
  `issue-365-map-presentation` browser test while its full-page screenshot
  exhausted Playwright's 30-second test budget. This change must not hide or
  weaken that E2E failure.
- `scripts/run-tests-by-tier.sh` deliberately keeps a small intensive
  simulation list out of the local push gate. Its existing real-discovery
  regression proves the two local tiers are disjoint and exhaustive.

## Decision

### Local developer tiers

Rename the existing local commands and terminology to describe their purpose:

- `test:regular`: all default-discovered Vitest files except the declared
  intensive simulation list. This remains the local pre-push tier.
- `test:intensive-simulations`: only the declared multi-city, multi-era,
  multi-seed, or similar CPU-intensive simulation tests.

The old `fast` and `slow` terms must disappear from user-facing commands,
workflow job names, documentation, and guardrail text. The local split stays
focused on developer ergonomics; it is not used to balance CI.

### CI full-suite shards

CI runs every default-discovered Vitest file exactly once through two explicit
partitions:

- `test-suite-shard-a`
- `test-suite-shard-b`

Those names state only that each job is one half of the required complete
suite; they make no untrue speed claim. A small shard runner owns selecting
one named partition, while a checked-in manifest owns the file-to-shard
mapping. The workflow invokes the runner directly, records each shard's real
manifest and phase timing, and merge-gate requires both jobs.

Initial membership is chosen from measured per-file runtime, not by file count
or source directory. A dedicated profiling command runs Vitest with both its
ordinary terminal reporter and the official JSON reporter written to a file.
The owned parser consumes each file result's `name`, `startTime`, and `endTime`
from that JSON artifact, validates the schema with fixtures, and records the
file weight used for the initial partition. A deterministic greedy allocator
then writes the checked-in shard manifest, making the input data and the
allocation reproducible.

A follow-up three-run experiment measures the actual CI result; the target is
that neither shard is more than 15% longer than the other across the sample
median, excluding setup time shared by both jobs. File durations are only the
initial allocation signal because Vite transforms, worker scheduling, and
per-process startup also affect wall time. The three-run result, not a
file-count estimate, decides whether the partition is acceptable.

The regular/intensive classification does not determine a CI shard. Intensive
tests are deliberately distributed across the two CI shards alongside regular
tests so neither job becomes a critical-path sink.

### Future-test routing and agent guardrails

| Test kind | Required location | Local tier | CI action |
| --- | --- | --- | --- |
| Production unit, system, UI, renderer, storage, platform, or integration behavior | Mirror the production domain under `tests/` | Regular unless it meets the intensive-simulation rule | Assign exactly one CI shard |
| Multi-city, multi-era, multi-seed, or long-running simulation | The mirrored domain test path; use `tests/simulation/long-horizon/` only when intentionally excluded from the default suite | Intensive simulations, with an explicit headroom-sized timeout | Assign exactly one shard if default-discovered; excluded long-horizon suites retain their own explicit command |
| Live browser behavior | `tests/e2e/` | Not a Vitest local tier | `test:web-smoke`; do not add it to either Vitest shard |
| Tooling or CI script behavior | `tests/scripts/` | Regular unless genuinely intensive | Assign exactly one CI shard |
| Git hooks or hook configuration | `tests/hooks/` | Regular | Assign exactly one CI shard and keep `test:hooks` coverage where required |

`AGENTS.md` supplies the concise agent-facing obligation: determine the test's
kind before creating it, use the table's location, and update the CI-shard
manifest plus its coverage regression whenever a default-discovered file is
added. `.claude/rules/hooks-and-tooling.md` is the canonical detailed policy:
it explains why local tier membership and CI shard membership are independent,
forbids assigning a browser or intentionally excluded long-horizon test to a
Vitest shard, and requires the narrowest mirrored validation before a change.

### Enforced contract

A regression test must discover the real default Vitest manifest and prove
that the two CI manifests are disjoint, have no duplicate entries, and union
to that manifest exactly. It must fail for both an unassigned new default test
and a stale/non-default manifest entry. The existing local-tier regression
must make the equivalent guarantees under the renamed terminology.

Workflow-configuration and merge-gate tests must assert the two named shard
jobs, their direct shard-runner invocations, their timing/manifests/JSON-report
artifacts, equal 15-minute safety ceilings, and their fail-closed required
results. No workflow condition may treat a missing shard as success.

The two jobs remain explicit rather than a GitHub Actions matrix. There are
only two fixed, separately required partitions; explicit job IDs make their
status, artifacts, and merge-gate failures legible, and avoid matrix
`fail-fast` canceling the peer before it publishes useful diagnostic evidence.

Vitest's native `--shard` is intentionally not used because it partitions test
files equally, not measured duration. Vitest blob reports and a merge-reports
job are likewise deferred: the repository has no coverage or consolidated test
report consumer today, while GitHub's native job results and this workflow's
fail-closed merge-gate already provide the required pass/fail record. If a
future workflow needs consolidated cross-machine test or coverage reporting,
adopt the official blob-artifact and merge-reports flow at that time; do not
add its runner, dependency install, and artifact transfer merely for sharding.

## Non-goals

- Do not change which tests are covered by the required full CI suite.
- Do not weaken timeouts, retries, worker counts, browser-smoke behavior, or
  branch-protection semantics to improve timing.
- Do not use a hash-only or equal-file-count split: neither demonstrates
  duration balance for this suite.
- Do not reduce worker counts or timeouts as part of the split. Vitest keeps
  its existing CI worker policy, and both shards retain the current 15-minute
  safety ceiling until real measurements support a separate timeout decision.
- Do not alter the existing issue-365 browser-test failure as part of this
  sharding change. Its root-cause repair is a separate test-stability task.

## Verification and acceptance

- Focused regression coverage proves local tiers and CI shards each select
  exactly their intended real files.
- Hook/workflow tests prove both named shards and the fail-closed merge gate
  are wired correctly.
- A build and durable full-suite run pass from the sharding branch.
- One green PR run confirms both new shards and merge-gate execute at the
  intended commit.
- After the independent issue-365 browser flake is resolved, three sequential
  fixed-reference workflow dispatches collect each shard's phase timing,
  queue delay, aggregate wall time, runner minutes, and artifacts. The result
  is compared with the current 359.5s/194.4s phase baseline without counting
  skipped jobs as negative-duration work.
