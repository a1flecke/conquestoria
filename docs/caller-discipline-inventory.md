# Caller-Discipline Inventory (#1014)

Audited at `1ec22a17` (post-#1010/#1015). Every place the repo asks a caller to *remember* something,
categorised by how it is — or should be — enforced. The working policy and decision procedure are
in [`.claude/rules/caller-discipline.md`](../.claude/rules/caller-discipline.md).

## How this was produced (re-runnable)

```bash
git grep -nEi "caller must|callers must|must be called|remember to|must also|both sides|from every path|must call|never call|is responsible for|do not forget" -- src .claude/rules CLAUDE.md docs/*.md
```

That returns ~37 hits in `src/` and ~45 in the rules files at this commit. `.claude/rules/invariants.md`
already catalogues *relational state* invariants (a different axis, ~300 "must/never" sentences, mostly
balance prose that has its own tests); this inventory is the complementary list of **API/sequence**
contracts. Yield ceilings, movement-bonus stacking and content tables are out of scope here for the
same reason `invariants.md` excludes them: they are enforced by their own generic tests.

## Categories

| Code | Meaning |
|---|---|
| **S** | Structurally solved before this audit — the wrong thing is unreachable or fails a test |
| **C** | Converted by #1014 (this PR) |
| **D** | Documentation only — a note about a fact or a single-caller detail; leave it (reason given) |
| **F** | Real risk, too large to convert here — follow-up issue filed |

## Inventory

### Diplomacy and war

| Location | Contract | Cat. | Enforcement / issue |
|---|---|---|---|
| `CLAUDE.md`, `game-systems.md` | `declareWar`/`makePeace` for BOTH parties; `atWarWith` deduplicated | **S** | `declareMajorWar`/`makeMajorPeace` are bilateral by construction; single-side writers unreachable from the 9-export `diplomacy-system` barrel, importers pinned (#1011); source rule (#995); `bilateral-war` invariant. Prose rewritten in this PR. |
| `diplomacy-treaties.ts:18` | Both sides must be signed for a complete treaty | **S** | `signTreaty` source rule + `treaty-reciprocity` invariant |
| `diplomacy-vassal-rules.ts:86` | Caller must apply `leagueUpdates` to `defensiveLeagues` | **C** | Only `diplomacy-vassalage.ts` may import `acceptVassalage`/`endVassalage`/`endVassalageUnilateral` (architecture pin) |
| `war-history-system.ts:281` | `recordSettlementSigned` MUST run BEFORE the peace transition | **C** | Now `withSettlementSigned(…, peaceTransition)`: it logs, then runs the transition; the wrong-order primitive is not exported (it failed *silently* when called late: war mislabelled `white-peace`) |
| `notification-routing.ts:970` | "Both sides must be told" (espionage consequences applied by the caller after `processEspionageTurn`) | **F** | #1201 |
| `airborne-system.ts:251`, `map-interaction-controller.ts:192,234` | "records/logged both sides' notifications" | **D** | Comments describing what a single function already does |
| `loyalty-pressure-presentation.ts:15` | "both sides see a map badge" | **D** | Description of a presentation rule inside one function |
| Movement/supply "ask the treaty yourself" | Every consumer must consult the treaty | **S** | `territorial-access.ts` (#871), `TerritorialRelation` vocabulary (#870), architecture pins |

### Units, movement and combat

| Location | Contract | Cat. | Enforcement / issue |
|---|---|---|---|
| `movement-actions.md` | Every mover goes through the resolver/executor | **S** | `resolveUnitMoveIntent` → `executeValidatedUnitMove`; low-level movers unreachable by import (#1010/#1025); source rule |
| `unit-movement-system.ts:161` | A moving Supercarrier must carry its based aircraft | **S** | Inside the one executor (`syncCarrierBasedAircraft`); `air-base-integrity` invariant |
| `combat-reward-system.ts:866` | A destroyed Supercarrier must lose its based aircraft | **S** | `destroyCarrierBasedAircraft` inside `applyCombatOutcomeToState`; `air-base-integrity` invariant. **Other removal paths: see next two rows.** |
| Player disband (`removePlayerUnitFromState`) | Removal must cascade to cargo manifest and air wing | **C** | Two reproduced defects fixed (embarked unit left the transport naming it; disbanded carrier left aircraft on a dead base). The confirmation now names the extra units. |
| ~23 hand-rolled unit-removal sites (`delete`, rest-destructure, filter-rebuild) | Each must remember the cascade | **C** | #1198: `removeUnits` (`unit-removal-system.ts`) is the only transition; the source rule + hook mirror + architecture pin make a raw delete fail. Reproduced defects fixed: a carrier killed by city counter-fire (Coastal Battery, bombardment) or by splash left its aircraft alive; disbanding a caravan outside the UI left its route running. |
| `beast-system.ts:268` | `recordBeastSlain` MUST be called from every path that kills a beast | **C** | Only 2 of ~12 combat executors called it; the AI (and air/airborne/splash) kills left the lair `awake` and unpaid. Now applied by `applyCombatOutcomeToState` (`beastsSlain`, event owned there), function importable only by `combat-reward-system.ts`, source rule, `beast-lair-integrity` invariant |
| Player/AI/beast executors | Camp destruction, route cleanup, combat record per fight | **C** | #1200: folded into `applyCombatOutcomeToState`. The stale table was wrong in places (pirates and minor civs did call `removeRouteForUnit`); the real gaps were a *captured* caravan keeping its route for every executor that forgot, the camp only being destroyed by the player and AI turn, and the combat record covering only the executor's actor (never an AI defender hit by a barbarian). Presentation stays per executor. |
| `unit-upgrade-system.ts:217` | Caller deducts `civ.gold` | **C** | `applyUpgrade` is private; `applyUnitUpgradeToState` validates, pays and upgrades |
| `strategic-launch-execution-system.ts:51` | UI must never call `resolveStrategicStrike` | **C** | Only that module calls it (architecture pin) + new source rule with script and hook tests |
| `types.ts:659` | Air-assault range and `operationalRange` must not drift | **D** | Single-source: range is *read from* `airOperation.operationalRange`, not duplicated; nothing to call |
| `barbarian-pressure.ts` | Never pass a global unit scan as `sensedUnits` | **C** | `SensedUnits` brand + `campSensedUnits(...)` constructor (#1022) — see [`type-safety-inventory.md`](./type-safety-inventory.md) |
| `gene-therapy-system.ts:27` | Callers must pass a pre-production snapshot | **D** | One caller (`round-phases/per-civ/unit-recovery.ts`); the `unitIds` override is the whole mechanism |
| `concealment.ts:105`, `great-general-definitions.ts:105` | Every consumer must call the canonical predicate/resolver | **S** | No raw bypass remains (`GENERAL_DEFINITIONS.find` has no src caller; concealment is pinned by the viewer-safety boundary rule) |
| `legendary-wonder-history.ts:66`, `network-plan-system.ts:406`, `stampede-system.ts:46` | "Callers must not reconstruct transition facts / must retain the pre-mutation record" | **D** | Transition-owned payload convention (`end-to-end-wiring.md`), covered by per-feature once-only regressions |
| `landmass-tagger.ts:11`, `great-general-profiles.ts:655` | "Callers must handle `undefined`/use the fallback" | **S** | The return type is `T \| undefined`; the compiler enforces it |
| `city-capture-system.ts:228` | Reward already awarded by the kill hook; do not award again | **D** | Comment explaining why a call is *absent* |

### Economy, production, content

| Location | Contract | Cat. | Enforcement / issue |
|---|---|---|---|
| `game-systems.md` (was) | `applyProductionBonus()` must be called when processing production | **S** | Called inside `getProductionCostForItem` via the canonical `ProductionCostContext` (#984). The stale sentence is rewritten. |
| `game-balance.md` | New city action / bombardment caller adds a row and routes through `resolveCityInteraction` | **S** | Single source of truth consumed by highlights, preview, executor and AI (#974) |
| `game-balance.md` | New unrest source / governance policy / minor-civ knob adds a table row | **S** | Data tables read generically (`UNREST_RELIEF_SOURCES`, `GOVERNANCE_POLICY_DEFINITIONS`); AI valuation keys off them |
| `end-to-end-wiring.md:39` items 1,2,5,6 | A new `UnitType` must be wired in N places | **S** | Generic catalog-wiring / candidate-comparison / dequeue tests |
| `end-to-end-wiring.md:39` items 3,4 | Production-completion side effects; death cleanup | **F** | #1202 (item 4's text was also stale: it named `main.ts` death branches) |
| `end-to-end-wiring.md:64`, `wonder-content.md`, `content-description-honesty.md` | Icon/ledger/description sync | **S/D** | Generic loop tests per registry; description honesty is a documented tripwire, not a checker (see its own file) |

### App, UI and tooling

| Location | Contract | Cat. | Enforcement / issue |
|---|---|---|---|
| Was: write state, then refresh renderer + HUD by hand | Publish after every write | **S** | #1015: `commit`/`batch`, no silent write, closed set of four named exceptions, architecture test + source rule |
| Hand-written `renderLoop.setGameState(` pushes; in-place `GameState` mutation | Do not mutate in place | **F** | #1199 |
| `ui-panels.md` (hot-seat, `cities[0]`, viewer safety, no bare buttons) | UI conventions | **S/D** | `cities[0]` source rule, viewer-safety differential harness + boundary rule (#1002), `createGameButton`; the rest are review conventions |
| `sprites.md:34,111` | `preloadTerrainTiles()`/`initSprites()` once at init | **D** | Single call site in `startGame`; a second call is idempotent, not corrupting |
| `spec-fidelity.md` | Delivered plans/specs leave the active tree; every remaining one is classified | **S** | `scripts/docs-lifecycle.mjs check` + `docs/docs-lifecycle-manifest.json` (#1024), run by `tests/hooks/docs-lifecycle.test.sh` |
| `hooks-and-tooling.md` | Hook stdin/jq contract; `mise trust` before push | **S** | Hook smoke tests (`tests/hooks/`), `run-with-mise-worktree.test.sh` blocks the push |

## Contracts deliberately not converted

- **`barbarian-pressure.ts` `sensedUnits`**: adopted by #1022 as the `SensedUnits` brand (`campSensedUnits(...)`), so a global unit scan is a compile error; see [`type-safety-inventory.md`](./type-safety-inventory.md).
- **Documentation-only rows above** are notes about facts, not instructions to a future caller. Deleting them would lose context for no safety gain.

## Result

Five contracts converted (war-history order, beast slay, upgrade payment, strategic strike entry point,
single-side vassalage mutators), plus two disband-cascade defects fixed and one new invariant
(`beast-lair-integrity`). Five follow-ups filed with evidence: #1198–#1202.
