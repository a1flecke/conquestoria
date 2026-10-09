# Worker Development Implementation Plan

> Execute inline. User and repository policy prohibit subagents.

**Goal:** Complete useful owned-land development through actual AI turns (#1427).

**Architecture:** A per-civilization inventory evaluates legal actions using known resources and marginal worked-tile yields. Deterministic greedy matching reserves one site per worker, shortlists before exact pathfinding, and executes through canonical movement and worker commands. Existing construction tasks remain authoritative; no new save fields.

**Tech Stack:** TypeScript, Vitest, existing AI scheduler and movement systems.

## Reproduction and lifecycle

- [x] Refresh main and inspect open issues/PRs and local worktrees.
- [x] Bootstrap isolated worktree and install unchanged lockfile.
- [x] Add actual-turn regressions to `tests/ai/basic-ai-worker-roads.test.ts` for cattle, horses, oil, wine, unsuitable starts, busy roads, and separated workers.
- [x] Run `./scripts/dev.sh test tests/ai/basic-ai-worker-roads.test.ts`; observe catalog-order farms, stationary workers, and road restart spending the final charge.
- [ ] Extend completion observations to pin events, charges, resource availability and input immutability.

## Bounded planner

- [ ] Create `src/ai/ai-worker-development.ts` with candidate collection, explicit value categories, assignment, and execution.
- [ ] Enumerate canonical workable city tiles once; reject unavailable claims, unseen sites, ongoing construction and known threats. Preserve reveal-tech gating.
- [ ] Evaluate projected completed tile yields with `getTileYield`; value a currently worked tile's increase or an unworked tile's improvement over the marginal worked tile. Avoid forts and destructive swamp draining in ordinary economic planning.
- [ ] Restrict known-resource actions to their required improvement; a missing first source has acquisition value, already-available resources have no repeated empire bonus.
- [ ] Include the canonical city-connection road target. Existing crisis dispatch retains first access to eligible workers.
- [ ] Sort worker/site pairs by value amortized over cheap travel estimate and build duration, then stable coordinates and worker IDs. Limit precise path trials per worker and reserve sites only after reachability succeeds.
- [ ] Use canonical path map, blocker and denied-owner queries; validate each movement step through `executeUnitMove`.
- [ ] Replace ordinary worker loop in `src/ai/basic-ai.ts`; emit returned worker-action events through the existing bus.
- [ ] Fix `chooseRoadBuilderUnit` in `src/systems/road-network.ts` to exclude busy/cargo workers and calculate each route once, with worker context.
- [ ] Run focused regressions; inspect failures before adjusting implementation.

## Hardening and evidence

- [ ] Add actual-turn controls for hidden resources, revelation, expansion/loss, death, another worker completing the site, cityless/resettled civilizations, occupied/blocked routes, urgent restoration, no jobs, and save/reload.
- [ ] Add competing-worker tests for one valuable resource and separate sites; record productive travel, completions, charges and construction events.
- [ ] Compare deterministic baseline and new outcomes using canonical city yields; report food/production/gold/science separately.
- [ ] Spy on canonical pathfinding for bounded per-worker effort on medium/large fixtures; do not assert machine-dependent runtime.
- [ ] Run `./scripts/dev.sh verify-impact`, source guards, all mirrored tests, build, durable suite/status, AI playability/status and required performance evidence. No long-horizon matrix.
- [ ] Inspect branch and working diffs; commit coherent changes and run exact-HEAD verification.
- [ ] Sync with main, publish with `./scripts/push-branch.sh`, create PR through `/tmp/pr-bodies`, attach it to this task, inspect CI.
- [ ] Delete this delivered plan and record its historical classification in the lifecycle manifest.

## Delivery decision

Resource choice and task continuity are prerequisites of useful multi-turn assignments. Keep a single coherent worker-development PR if the implementation remains a small focused module; split independent hardening only if evidence warrants it. Do not create an otherwise redundant PR solely to reach three PRs.

## Replanning contract

No cross-turn reservations: death, ownership loss, completion elsewhere and legality changes are reflected in the next inventory. Stable deterministic ordering and decreasing remaining travel cost retain intentions in static scenarios. Active `workerTask` construction is never reassigned, including emergencies. Any observed oscillation requires an executable regression before introducing persisted intent.
