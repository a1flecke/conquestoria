---
paths:
  - "src/ai/**"
  - "src/core/**"
  - "tests/simulation/**"
---

# AI Simulation Rules

## The long-horizon campaign suite (`yarn test:ai-long`, #1005)

`tests/simulation/ai-playability.test.ts` verifies the AI over 30 turns by
default (60 with `AI_SIM_EXTENDED=1`). Whole classes of failure — expansion
stalls, economic death spirals, unwinnable stalemates, a plan that wedges for
100 turns — only appear well past turn 60. `yarn test:ai-long` runs 250–500 turn
deterministic campaigns across every challenge tier, every AI personality,
small/medium/large maps, solo and hot seat, and an early- and a late-era start,
with the full per-round invariant battery on.

It is **explicit-run only**. `tests/simulation/long-horizon/**` is excluded from
`vite.config.ts` unconditionally; only `vitest.long-horizon.config.ts` (driven by
`scripts/run-ai-long-horizon.sh`) re-includes it. It is **not** in `yarn test`,
`test:regular`, `test:intensive-simulations`, `verify:push`, the pre-push hooks, the production
build, or CI, and must never be — `tests/scripts/ai-long-horizon-isolation.test.ts`
fails in the ordinary suite if that ever changes. Do not "fix" that guard by
loosening it.

### When to run it

**Run `yarn test:ai-long` before declaring complete** a change that materially
affects:

- AI strategic planning, production, diplomacy, or movement
- pathfinding or the movement-cost model
- combat decision-making
- the economy (yields, maintenance, unrest, growth)
- victory pursuit / turn orchestration
- any large simulation system whose behaviour compounds over a campaign

**Do not run it** for docs-only changes, asset-only changes, isolated CSS,
trivial copy, or test-only refactors unrelated to the simulation. It costs
~20 minutes; it is a deliberate pre-merge check for substantial AI/gameplay
work, not a universal gate.

### Reading the output

Each scenario writes two files under the gitignored `.verification/` tree:

- `.verification/ai-long-horizon/<seed>.json` — **deterministic**: scenario
  config, the analysis report (`summary`, `perCiv`, `findings`, `observations`),
  and a decimated sample series. Sorted keys, no wall-clock value, no date, no
  path. Same seed ⇒ byte-identical file, so a real behaviour change shows up as a
  diff. Commit-to-commit comparison of this file is the point.
- `.verification/ai-long-horizon/<seed>.timings.json` — machine-specific
  (`roundDurationsMs`, `elapsedMs`, node version, cpu count). **Never asserted
  on.** For local human investigation only; #1007 owns real performance budgets.

`findings` are liveness / progress / envelope violations from
`campaign-analysis.ts` — a living AI that never expands, a city idle 12+ rounds,
gold hoarded without spend, a unit count running away while the empire never
grows, a wedged plan, a stagnant war, an eliminated civ regaining entities.
Thresholds are in `DEFAULT_CAMPAIGN_ANALYSIS_CONFIG`, each measured against
`main` and given headroom; a detector that would need a different threshold per
challenge tier is a wrong detector — fix the detector.

### The known-gap ratchet

`tests/simulation/long-horizon/known-campaign-gaps.ts` is a **two-way ratchet**,
enforced by `campaign-matrix.test.ts`:

1. A finding with **no** `KNOWN_CAMPAIGN_GAPS` entry fails the run. A new stall
   can never land silently — either fix it, or add an entry citing a focused
   follow-up issue.
2. A declared gap that **no longer reproduces** in any of its scenarios also
   fails the run, telling you to delete the entry. The register can never go
   stale.

When you fix an AI bug the suite was tracking, delete its register entry in the
same change. When the suite finds something new, do **not** loosen a detector or
widen a threshold to hide it — add a register entry and file the follow-up.

### Adding a scenario

Append a row to `LONG_HORIZON_SCENARIOS` in `campaign-scenarios.ts` (fixed seed,
challenge, map size, human/AI counts, turn cap, personality set). Keep the whole
matrix under ~25 minutes; put the measured wall-clock in the row comment and
size `SCENARIO_TIMEOUT_MS` off the slowest row × 3, per
`.claude/rules/hooks-and-tooling.md`.

### Determinism

Every scenario must be reproducible from its seed and its deterministic artifact
byte-identical across two runs on the same commit — `campaign-continuity.test.ts`
asserts exactly that, plus save/reload continuity. The observer callback receives
**plain data only, never `GameState`**, so the analysis layer is structurally
unable to perturb the simulation and the artifact cannot pick up a live object
reference. Keep it that way: never pass `state` into `observe`.
