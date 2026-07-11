# Era 13 Autonomous Systems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and execute inline. This repository forbids subagents and parallel agents. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Executor model:** Sonnet 4.5, medium effort. Keep the approved design and this plan open. Do not infer missing gameplay rules from taste. If current code disagrees with a stated seam, perform the required drift check, document the difference, and update the plan before editing production code.

**Goal:** Deliver the approved Era 13 Autonomous Systems expansion as six ordered, independently mergeable MRs that leave Conquestoria buildable, playable, deterministic, save-safe, AI-usable, and hot-seat private after every merge.

**Architecture:** Add a versioned save/pacing foundation first, then deliver late resources as a complete vertical economy. Introduce the network through a complete Cyber Unit intent loop before expanding it with capacity, postures, constructive plans, Surge, UI, and AI. Launch the full Era 13 catalog only after its underlying mechanics exist, then finish with wonders, authored strategic audio, simulations, accessibility, and balance gates.

**Tech Stack:** TypeScript strict mode, Vitest, Canvas 2D renderer, DOM/CSS panels, event bus, IndexedDB saves, catalog-driven AI, local OGG audio, Vite PWA and shared Tauri frontend.

**Authoritative design:** `docs/superpowers/specs/2026-07-10-era13-plus-design.md`

---

## 0. Mandatory drift-check protocol

Every implementation issue and every MR begins with this work before any source edit:

```bash
git fetch origin main
git log -1 --format=%H origin/main
git diff --name-status <previous-slice-merge-sha>..origin/main -- <paths named by this slice>
rg -n "<symbols named by this slice>" <paths named by this slice>
```

- Record the `origin/main` SHA and previous-slice merge SHA in the issue before implementation.
- Verify every named function, type, catalog, test, and UI caller in current code. A path in this plan is an assertion to check, not permission to invent an API if it moved.
- Review open PRs touching the same paths. Do not duplicate or overwrite concurrent work.
- Compare the approved design, this plan, the issue body, and current code. List drift as `none`, `compatible`, or `contract-changing`.
- For compatible drift, amend exact paths/signatures in the issue comment and continue.
- For contract-changing drift, stop before production edits; update the design/plan or obtain user approval.
- Run the slice's baseline targeted tests before writing the first failing regression. Unexpected baseline failures are blockers to diagnose, not failures to absorb.
- Create a fresh worktree from current `origin/main` after all prerequisite MRs merge. Run `mise trust <worktree>/mise.toml` before the first push.

Current planning snapshot: `origin/main` at `55026310`. Verified drift facts:

- `src/storage/save-manager.ts` has no root schema version or ordered migration registry; `normalizeLoadedState()` composes legacy normalizers, and missing `gameId` uses `Date.now()`.
- `src/systems/pacing-model.ts` clamps production and research profiles to Era 12.
- `src/systems/tech-definitions.ts` registers through `TECH_TREE_ERAS_12`; Era 12 currently owns `quantum-computing` and Data Center.
- `src/systems/resource-definitions.ts` has 16 resources, no `materialFamily`, no advantage metadata, and `ResourceEffect` excludes science.
- `src/systems/map-generator.ts` places all resources in the early terrain-probability pass.
- `src/systems/cyber-warfare-system.ts` resolves a seeded 65/75-percent block roll and flat two-gold drain from adjacency.
- `src/core/opponent-challenge.ts` already owns same-rules AI quality knobs, including `tacticalTopK`, `seededSuboptimalChance`, `recoveryRounds`, and `planReconsiderRounds`.
- `src/ui/selected-unit-info.ts`, `src/ui/primary-action-bar.ts`, `src/ui/turn-handoff.ts`, `src/ui/notification-log-panel.ts`, and `src/audio/sfx-director.ts` are the verified live presentation seams.

## 1. Merge order and deliverability

| Order | MR | Player-visible completion | Dependency | Safe merge boundary |
|---:|---|---|---|---|
| 1 | Era boundary, versioned saves, and no-era-cap pacing | Era 12 Cloud Computing correction, migrated research, Era 13 Quantum Computing, honest frontier UI | none | No partial migration; old and new saves load twice identically |
| 2 | Industrial-to-future resources | Six late resources are revealed, placed, improved, traded, priced, explained, valued by AI, and affect production | MR1 | No resource appears before all access/UI/AI/save paths work |
| 3 | Cyber intent vertical slice | At Autonomy activation, Cyber Units transition to Hold, Harden, or Exploit with deterministic warning/counter/resolution and viewer-safe UI | MR2 | Pre-activation Era 12 behavior remains intact; migration version 3 follows the merged resource migration version 2 |
| 4 | Full Autonomy Network | Capacity, postures, constructive plans, formations, Surge, strain, AI, advisors, and hot-seat flow | MR3 | Every visible action resolves and rerenders immediately |
| 5 | Complete Era 13 content launch | All 30 techs, 12 buildings, 3 projects, and 5 units are honest, trainable/buildable, rendered, and AI-usable | MR2 + MR4 | Catalog ships as one coherent roster; no dead unlocks |
| 6 | Wonders, authored audio, balance, and launch hardening | Two wonders, spectacle, four system motifs, simulations, accessibility and final balance gates | MR5 | Final launch remains playable if optional audio is muted/unavailable |

Do not split MR5 into a “definitions first” and “wiring later” MR. Tech unlock text, production rows, sprites, AI roles, and effects must enter together. If MR5 must be reduced, keep the entire Era 13 catalog hidden behind one data-derived authored-era availability gate until the remainder lands; do not expose inert nodes or actions.

Published issue registry:

- Index: [#517](https://github.com/a1flecke/conquestoria/issues/517)
- MR1: [#511](https://github.com/a1flecke/conquestoria/issues/511)
- MR2: [#512](https://github.com/a1flecke/conquestoria/issues/512)
- MR3: [#513](https://github.com/a1flecke/conquestoria/issues/513)
- MR4: [#514](https://github.com/a1flecke/conquestoria/issues/514)
- MR5: [#515](https://github.com/a1flecke/conquestoria/issues/515)
- MR6: [#516](https://github.com/a1flecke/conquestoria/issues/516)

## 2. Global implementation contracts

### Gameplay and balance

- Use the exact values and caps in the approved design. Same-type plans do not stack; strongest coordination applies; city disruption never exceeds 15 percent of base yield.
- Base movement, strength, city yields, and production never disappear from Stable/Strained state.
- Resource advantages are soft discounts except the five explicitly hard-gated Oil/Uranium items. Combined soft discount caps at 25 percent.
- Equal-production simulations must reject drone-only dominance. Tall and wide fixtures must show sublinear Capacity growth.
- Same rules, prices, placement, Load, Capacity, and effect magnitudes apply on Explorer, Standard, and Veteran.

### Ages, play styles, and fun

- Default copy is outcome-first and readable without formula vocabulary. Exact formulas stay in expandable details.
- Teach in order: recommended constructive plan, posture after first successful resolution, Surge after one Stable resolution.
- Every style has a useful route: Build, Research, Trade, Defend, Influence, Explore, and Conquer.
- Ignoring the network remains viable; no “assign all idle specialists” end-turn blocker.
- Every persistent plan produces visible payoff, feedback, or counterplay. Avoid per-turn re-confirmation and per-unit sound spam.

### AI and difficulty

- AI uses the same public evaluators and earned intel as humans. Never read hidden viewer records or target through fog.
- Reuse `OpponentChallengeProfile` for top-K breadth, mistake injection, recovery, and reconsideration. Add network-specific fields there only when an existing field cannot express the behavior.
- Explorer must still demonstrate one constructive plan and react to one observed hostile effect. Veteran improves choice and timing, not numbers or information.
- Candidate generation is bounded and deterministic; cache unchanged resource/Capacity forecasts per round.

### UI, UX, solo, and hot seat

- Use `state.currentPlayer`, `textContent`/`createTextNode()`, `createGameButton()`, touch-sized controls, keyboard access, reduced motion, and no color-only meaning.
- Recommendations reorder but never hide the full action catalog. Provide `Show all` whenever a focused view omits actions.
- Any action that changes state rendered by its open panel rerenders that panel before returning control.
- Hot-seat order is invariant: end turn → autosave/opaque veil → identity confirmation → viewer reset → viewer warnings → input → hostile resolution at target turn end.
- No map line, focus target, notification, material suggestion, or SFX is derived before identity confirmation.

### Architecture, data, extensibility, and saves

- State is serializable plain data. Plan definitions contain a closed effect union, never callbacks.
- Mutation lives in canonical systems; UI and AI call the same preview/validation/resolution helpers.
- Event payloads come from mutation results or explicit before/after diffs.
- Stable IDs are never repurposed. Resource families use metadata, not string matching. Every authored era has an explicit pacing profile.
- Migrations are ordered, deterministic, idempotent, and owned by `save-manager`; `main.ts` may call normalization but may not mutate schema fields independently.
- Grandfather completed/queued legacy content exactly as specified. Loading and saving twice must serialize identically.

### SFX and assets

- All sounds are local, licensed, credited, preloaded, muted by existing settings, and paired with visible feedback.
- Formation events play once per formation. Hidden preparation/source audio never plays for an unauthorized viewer.
- New units enter `UNIT_SPRITE_CATALOG`, `UNIT_MOTION_STYLES`, `LOCOMOTION_CLASS`, `UNIT_SFX`, and coverage tests in the same MR.

### Required checks before every push

```bash
scripts/check-src-rule-violations.sh <all changed src files>
bash scripts/run-with-mise.sh yarn test --run <all mirrored/relevant targeted tests>
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- <all changed files>
git diff -- <all changed files>
```

---

## MR1 — Era boundary, versioned saves, and no-era-cap pacing

### Drift check

Use the mandatory protocol with: `src/storage/save-manager.ts`, `src/core/types.ts`, `src/core/id-counters.ts`, `src/systems/pacing-model.ts`, `src/systems/tech-definitions.ts`, `src/systems/tech-definitions-eras12.ts`, `src/systems/tech-system.ts`, `src/systems/tech-progression.ts`, `src/ui/tech-panel.ts`, `src/systems/city-system.ts`, and their mirrored tests. Confirm whether another MR has introduced a schema version, changed Data Center, or added Era 13.

### File map

- Create `src/storage/save-migrations.ts`: ordered pure migration registry and schema constants.
- Create `src/systems/era-pacing-profiles.ts`: explicit authored-era profiles and validation.
- Create `src/systems/tech-definitions-eras13.ts`: only Era 13 Quantum Computing in this slice; MR5 replaces the one-entry export with the complete roster.
- Modify `src/core/types.ts`: `saveSchemaVersion`, historical-status metadata, and forward-compatible era fields.
- Modify `src/storage/save-manager.ts`: call the migration registry once before normalization; remove technology/schema mutations from later normalizers.
- Modify `src/systems/tech-definitions-eras12.ts`: rename/redefine Era 12 `quantum-computing` to `cloud-computing`.
- Modify `src/systems/tech-definitions.ts`: register Era 13.
- Modify `src/systems/pacing-model.ts`: consume explicit profiles without a clamp.
- Modify `src/systems/city-system.ts`: Data Center requires Cloud Computing.
- Modify `src/ui/tech-panel.ts`: honest authored-frontier presentation.
- Test `tests/storage/save-manager.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/systems/pacing-model.test.ts`, `tests/systems/pacing-reference-economy.test.ts`, `tests/systems/tech-definitions.test.ts`, `tests/systems/tech-progression.test.ts`, `tests/ui/tech-panel.test.ts`.

### Task 1: Establish the ordered migration pipeline

- [ ] Write failing tests proving schema `0` migrates to current, migrations run in numeric order, a second migration is byte-equivalent, malformed future versions are rejected without mutation, and no migration reads wall-clock time.
- [ ] Add the following complete contract to `save-migrations.ts`:

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 1;
export type SaveMigration = (state: GameState) => GameState;
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
};
export function migrateSaveToCurrent(raw: unknown): GameState;
```

- [ ] `migrateSaveToCurrent()` clones once, treats missing version as `0`, applies every integer step exactly once, stamps the resulting version, and throws a typed unsupported-version error when the save is newer than the runtime.
- [ ] Replace `ensureGameIdentity()` wall-clock recovery with a stable hash of ordered tile IDs, coordinates, terrain, and existing resources when `gameId` is absent. New-game creation may still use its existing creation-time identity; migration may not.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts`; expected PASS. Commit `feat(era13-mr1): add ordered save schema migrations`.

### Task 2: Migrate Quantum Computing to Cloud Computing

- [ ] Write RED tests for completed/current/queued research, `researchProgress`, `opponentAI` research targets, typed quest/history tech references, deduplication, prose non-replacement, and second-load idempotence.
- [ ] Implement a schema-aware `remapPersistedTechId(id)` used only by declared typed-ID fields. In pre-Era13 saves, map `quantum-computing` to `cloud-computing`; never search arbitrary strings.
- [ ] Change Era 12 to `cloud-computing` with prerequisites `integrated-circuits` and `arpanet`, Data Center unlock, and 15-percent science-track efficiency. Change Data Center `techRequired` and descriptions in the same commit.
- [ ] Add Era 13 `quantum-computing` with prerequisites `cloud-computing` and `nanomaterials`, Data Center +2 science payoff, and emerging metadata. Migration must leave this new ID unresearched.
- [ ] Run the storage, era-12, tech-yield, tech-unlock, city-system, AI-research, and tech-panel tests. Commit `feat(era13-mr1): correct cloud and quantum era boundary`.

### Task 3: Remove the era cap through explicit pacing profiles

- [ ] Write RED tests for Era 13, synthetic Era 16/25 definitions, missing-profile validation, positive `homeEra`, and no clamp in production/research lookups.
- [ ] Define:

```ts
export interface EraPacingProfile {
  era: number;
  productionPerTurn: number;
  boundedSciencePerTurn: number;
  completionistSciencePerTurn: number;
}
export const ERA_PACING_PROFILES: ReadonlyMap<number, EraPacingProfile>;
export function requireEraPacingProfile(era: number): EraPacingProfile;
export function getFrontierPacingProfile(era: number): EraPacingProfile;
```

- [ ] Copy measured Era 1–12 values into the registry and add a measured Era 13 fixture before setting literal Era 13 tech cost. `requireEraPacingProfile()` throws for authored missing eras; frontier-only ETA uses the last profile without fabricating content/cost.
- [ ] Replace `Math.min(12, ...)` and Era-12 project validation with registry/data-derived logic. Add catalog validation that every authored tech/building/project era has a profile.
- [ ] Render “Research frontier reached — your campaign continues” when no authored research remains; do not show an end-game action or filler node.
- [ ] Run pacing, national-project, era-advancement, tech progression, and panel tests. Commit `feat(era13-mr1): make authored era pacing open ended`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Legacy save shows Era 12 Quantum Computing progress | Load save | Same progress appears on Cloud Computing; Era 13 Quantum remains unresearched |
| Current research and queue both contain legacy ID | Load save | One deduplicated Cloud entry; queue order and progress remain valid |
| Player completes the only authored Era 13 node in MR1 | Open tech panel | Frontier message appears; campaign controls remain available |

### Misleading UI risks and replay checklist

- `frontier reached` means no authored queueable/researchable tech, not merely no currently available prerequisite path. Negative-test a locked authored child.
- Replay add research, add queued research, reorder, remove, repeat-click, reopen, save/load, and hot-seat viewer switch. Assert current item, queue order, and ETA text after each mutation.

### MR1 acceptance

- Old saves retain research meaning; no save gains Era 13 Quantum accidentally.
- Era 13/16/25 fixtures do not clamp. Missing authored profiles fail development validation.
- Web and Tauri-compatible save serialization remains distribution-neutral.
- Build and full test suite pass.

---

## MR2 — Industrial-to-future resources vertical slice

### Drift check

Run the protocol after MR1 merges over resource definitions, all map generators, worker improvements, resource access, marketplace, production cost/eligibility, upgrades, planning/AI production, city/marketplace panels, renderer improvement markers, save migrations, and relevant tests. Confirm current hard-resource callers and production-drop reasons before changing shared signatures.

### File map

- Create `src/systems/late-resource-placement.ts`: deterministic non-destructive late pass and normalization.
- Create `src/systems/resource-advantages.ts`: generic hard/soft use definitions and cost forecast.
- Create `src/renderer/improvements/oil-well-marker.ts`: Oil Well marker.
- Modify `src/core/types.ts`, `src/systems/resource-definitions.ts`, `src/systems/map-generator.ts`, `src/systems/balanced-map-generator.ts`, `src/systems/continent-map-generator.ts`, `src/systems/improvement-system.ts`, `src/systems/improvement-turn-system.ts`, `src/systems/resource-acquisition-system.ts`, `src/systems/city-system.ts`, `src/systems/unit-upgrade-system.ts`, `src/systems/planning-system.ts`, `src/systems/quest-objective-system.ts`, `src/systems/trade-system.ts`, `src/ui/city-panel.ts`, `src/ui/marketplace-panel.ts`, `src/ai/ai-production.ts`, `src/ai/ai-tech-evaluation.ts`, `src/storage/save-migrations.ts`, `src/audio/sfx-catalog.ts`, and catalogs/loaders.
- Test mirrored files plus `tests/core/game-state-resource-guarantee.test.ts`, `tests/systems/production-costs.test.ts`, `tests/ui/city-panel-resources.test.ts`, `tests/ui/marketplace-panel-effects.test.ts`, and a new `tests/simulation/late-resource-distribution.test.ts`.

### Task 1: Expand the catalog and access model

- [ ] Write RED catalog coverage for stable IDs, `materialFamily`, reveal tech, terrain, improvement, base price, icon, science effect, Codex metadata, hard uses, soft uses, and distinct Rare Earth/Battery identity.
- [ ] Add `coal`, `oil`, `aluminum`, `uranium`, `rare-earth-elements`, and `battery-minerals` to `StrategicResource`. Extend `ResourceEffect.type` with `science` and add `materialFamily`/Codex fields to definitions.
- [ ] Populate the exact table from the approved design: prices 7/12/10/16/14/13; Coal and Aluminum/Oil/Uranium reveal at existing `steam-power`, `petroleum-industry`, `aluminium-smelting`, `nuclear-physics`; Rare Earth and Battery reveal at `nanomaterials` and `smart-cities`.
- [ ] Derive icons, reveal maps, market price initialization, and Codex rows from `RESOURCE_DEFINITIONS`. Do not add switch statements by resource ID.
- [ ] Run resource/trade/tech definition tests. Commit `feat(era13-mr2): add late strategic resource catalog`.

### Task 2: Place and migrate late resources without clutter

- [ ] Write RED many-seed tests for deterministic/non-destructive placement, reveal isolation, geographic-map normalization, total density, and no overwrite of resource/wonder/city/improvement/start.
- [ ] Keep early `placeResources()` unchanged. Run `placeLateResources()` afterward over eligible empty tiles: Coal/Oil/Aluminum/Uranium target 4 percent each; Rare Earth/Battery 2 percent each; stable sorting before seeded selection.
- [ ] Guarantee at least one global Uranium deposit per major civilization count, distributed across landmasses where terrain permits. Do not guarantee ownership or starting proximity.
- [ ] Increment `CURRENT_SAVE_SCHEMA_VERSION` to 2 and add migration step 2 using the save's stable game/map hash. Initialize missing prices/history and preserve hidden discovery.
- [ ] Run all procedural/balanced/continent/geographic map and migration tests. Commit `feat(era13-mr2): place and migrate late resources deterministically`.

### Task 3: Add Oil Well end to end

- [ ] Write RED improvement legality, worker task, completion, cancellation, marker, save, advisor, and audio-catalog tests.
- [ ] Add `oil-well` as a worker-buildable improvement only on revealed Oil plains/desert tiles; use existing multi-turn task lifecycle and no offshore behavior.
- [ ] Add renderer marker/loader and one completion cue. Missing/revealed/occupied blocker copy must be explicit.
- [ ] Run improvement, renderer, input, audio, and save round-trip tests. Commit `feat(era13-mr2): add playable oil wells`.

### Task 4: Wire hard requirements and generic soft advantages

- [ ] Write RED tests through production cost, availability, rush buy, upgrade, AI candidates, quest ETA, and queue revalidation.
- [ ] Define catalog data for the exact discounts and five hard requirements in the design. Compute discounts multiplicatively and cap the combined reduction at 25 percent.
- [ ] Recalibrate no-access base costs so existing listed costs are the with-access target. Record the literal before/after ledger in the test fixture.
- [ ] Preserve existing completed items and migrated queues with a one-time `legacyResourceGrace` record; new copies require resources. Dropped queues use the existing player-visible feedback event.
- [ ] Keep resource advantage inputs generic enough for MR5 substitution sources, but do not add inactive Circular content in this MR. MR5 supplies the building/project definitions and their typed access providers.
- [ ] Run city, costs, upgrades, planning, quest, AI production, and migration-twice tests. Commit `feat(era13-mr2): apply hard inputs and soft resource advantages`.

### Task 5: Complete UI, AI, solo, and hot-seat behavior

- [ ] City rows show `Required` separately from `Faster with`, explain combined discount, display recalculated cost/ETA, and show marketplace expiry beside completion ETA.
- [ ] Marketplace rows distinguish both material families, access source, expiry, and actual dynamic price. Unknown resources remain hidden until reveal tech.
- [ ] AI values resources from current/forecast production, never sells the last hard input for queued/forecast content, and does not begin a hard-gated item whose temporary access expires before ETA without affordable deterministic renewal.
- [ ] Hot-seat tests prove discovery, recommendations, resource ownership, and expiry warnings use `currentPlayer` and do not survive handoff.
- [ ] Run panel and AI tests. Commit `feat(era13-mr2): explain and plan late resource access`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Item lacks optional Rare Earth access | Buy temporary access | Cost and ETA decrease in the still-open city panel; expiry is shown |
| Hard-gated queue loses Uranium | Advance turn | Item drops with named reason; remaining queue/order/ETAs rerender |
| Worker stands on revealed Oil | Tap Oil Well | Task, remaining turns, cancellation action, and map treatment appear |
| Hot-seat handoff begins | End turn | Prior player's resources, prices, warnings, and recommendations disappear behind veil |

### Misleading UI risks and replay checklist

- `Faster with` must never read as required. `Available` must include valid outpost/trade/market access and exclude expired access.
- Replay first/second queue add, reorder, remove, loss of access, regain access, repeat-click, reopen, save/load, and handoff. Assert visible order, ETA, price, discount, and reason text.

### MR2 acceptance

- Access to neither material family remains viable at slower production.
- Rare Earth and Battery never alias and together preserve the prior aggregate placement density.
- AI/human/upgrade/quest/rush callers share one cost forecast.
- No resource stockpile or fuel-per-turn mechanic appears.

---

## MR3 — Cyber intent vertical slice

### Drift check

Run after MR2. Inspect `cyber-warfare-system`, turn income ordering, city capture/elimination/diplomacy cleanup, selected-unit live caller, notifications, viewer visibility, AI scheduler, save migration, and SFX routing. Confirm the resource migration is version 2 and append version 3 rather than branching the migration registry.

### File map

- Create `src/core/autonomy-state.ts`: serializable plan, target, status, detection, and civic pressure types.
- Create `src/systems/network-plan-definitions.ts`: closed effect union and Harden/Exploit definitions.
- Create `src/systems/network-plan-system.ts`: validation, assignment, Hold, retarget, cancellation, cleanup, timing.
- Create `src/systems/network-effect-resolver.ts`: actor-agnostic deterministic mutation/events.
- Create `src/systems/network-viewer-intel.ts`: viewer-safe warnings and source disclosure.
- Create `src/ui/network-intent-panel.ts`: Cyber assignment/preview surface.
- Modify `src/core/types.ts`, `src/core/id-counters.ts`, `src/core/turn-manager.ts`, `src/systems/cyber-warfare-system.ts`, `src/ui/selected-unit-info.ts`, `src/main.ts`, `src/ai/ai-round-scheduler.ts`, `src/ai/ai-plan-portfolio.ts`, `src/storage/save-migrations.ts`, notifications/audio.
- Add mirrored tests and `tests/integration/network-plan-turn-flow.test.ts`.

### Task 1: Define minimal persistent plan state

- [ ] RED tests prove plain serialization, stable IDs, definition validation, derived Load, one plan/source, same-type nonstacking, invalid-reference rejection, and counter scanning.
- [ ] Define `NetworkPlanTarget` as a closed union for city/unit/formation/route/zone and `NetworkPlanEffect` as closed data variants. No callbacks or live object references.
- [ ] Add `autonomyByCiv`, `networkCivicPressureByCity`, viewer detections, and `nextNetworkPlanId`; update `emptyIdCounters()` and `scanIdCounters()`.
- [ ] Implement Hold/assign/retarget/cancel using immutable outer state replacement and one validation result type consumed by UI and AI.
- [ ] Run core plan/id tests. Commit `feat(era13-mr3): add persistent network plan state`.

### Task 2: Replace passive drain with Harden and Exploit at Autonomy activation

- [ ] RED tests cover 10-percent normal/15-percent Surge-ready magnitude, base-city-gold floor, minimum positive transfer, CDC delay+halve, Harden charge+cap, AI Safety refresh hook, multiple attackers nonstacking, war/range, and zero-gold city.
- [ ] Implement definitions exactly: Harden Load 1/range 1; Exploit Load 2/range 1; deterministic mitigation replaces all block rolls.
- [ ] Add one `isAutonomyActivated(state, civId)` helper. Before a civilization completes its first Era 13 technology, retain the existing Era 12 passive resolver. At and after activation, skip passive adjacency drain and use only the canonical intent resolver. Add a negative test proving both paths can never apply in one round.
- [ ] Add human path plus AI/turn-manager parity tests. Commit `feat(era13-mr3): convert cyber drain to deterministic intents`.

### Task 3: Implement warning, response, resolution, and cleanup timing

- [ ] RED tests prove prepare at attacker action, warning at target turn start, resolution only at target turn end, and one full response turn.
- [ ] Cleanup covers source destruction/capture, city capture, target destruction, peace, conquest, elimination, malformed load, and diplomacy changes. No invalid plan consumes Load.
- [ ] Source identity/coordinates are absent unless viewer detection authorizes them. Victim always receives effect and counter category.
- [ ] Run turn/diplomacy/capture/viewer tests. Commit `feat(era13-mr3): resolve network plans on viewer-safe timing`.

### Task 4: Migrate Cyber Units and saves

- [ ] RED tests sort units/cities by stable ID, create at most one Exploit per city, put duplicates on Hold, increment counter, reject orphan references, preserve detections, and load twice identically.
- [ ] Increment `CURRENT_SAVE_SCHEMA_VERSION` to 3 and add migration step 3. Below Autonomy activation, initialize empty network state and retain Era 12 passive behavior. At activation, sort existing Cyber Units/cities and migrate them into explicit Hold/Exploit exactly once.
- [ ] Preserve plan state through autosave/manual/export/import/handoff.
- [ ] Run save and transfer tests. Commit `feat(era13-mr3): migrate cyber units into explicit plans`.

### Task 5: Deliver the complete player and AI loop

- [ ] Selected Cyber Unit shows `Assign Intent`; panel lists Hold/Harden/Exploit, valid targets, outcome, Load, first timing, counter, and detection disclosure.
- [ ] Confirmation rerenders selected-unit info and the intent panel immediately. Retarget/cancel/reopen/repeat-click use current IDs, not stale DOM closures.
- [ ] AI creates only valid plans from earned intel, chooses Hold when no positive candidate exists, protects its Cyber Unit, cancels obsolete plans, and respects `tacticalTopK`/mistake profile.
- [ ] Notifications aggregate recurring resolution but keep first warning/capture/cancel immediate. Audio plays only for authorized visible events.
- [ ] Run UI, AI, audio, solo, and hot-seat tests. Commit `feat(era13-mr3): ship cyber intent UI and AI loop`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Cyber Unit is on Hold | Choose Harden and city | Unit shows Harden target; city shows mitigation; cancel/retarget available |
| Enemy Exploit is preparing | Begin victim turn | Warning names effect/counter, not hidden source; target city focus action works |
| Victim builds/has counter | End victim turn | Mitigated transfer appears in city/treasury/log; plan remains or completes per definition |
| Source is captured | Capture unit | Old plan disappears immediately; captured specialist shows recovery/Hold |

### Misleading UI risks and replay checklist

- `Protected` is forbidden when only mitigation exists; use “reduces hostile network effects.” `Detected` never implies source known.
- Replay assign, retarget, cancel, repeat-click, reopen, source move out/in range, peace, capture, save/load, AI turn, and hot-seat handoff.

### MR3 acceptance

- Pre-activation Era 12 campaigns retain their current Cyber behavior. At/after activation, no passive or probabilistic drain path remains, and tests prove passive plus intent effects cannot double-apply.
- Every victim receives a response turn; no viewer learns hidden source information.
- Cyber Units are useful constructively and offensively but may remain on Hold without blocking end turn.

---

## MR4 — Full Autonomy Network

### Drift check

Run after MR3 over all new network modules plus city yields, route income, combat modifiers, vision, HUD/shell, advisor, handoff, AI portfolio, difficulty profiles, and panel tests. Verify Cyber contracts have not drifted and that no new UI bypasses the canonical evaluator.

### File map

- Create `src/systems/autonomy-capacity.ts`, `src/systems/autonomy-postures.ts`, `src/systems/network-infrastructure-plans.ts`, `src/systems/network-combat-coordination.ts`, `src/ai/ai-network-planning.ts`, `src/ui/network-panel.ts`, `src/ui/network-tutorial.ts`, `src/renderer/network-overlay.ts`, and mirrored tests.
- Modify network core/resolver, `src/systems/resource-system.ts`, route income, combat, visibility, city capture, `src/core/turn-manager.ts`, `src/core/opponent-challenge.ts`, `src/ui/game-shell.ts`, `src/ui/advisor-system.ts`, `src/ui/city-panel.ts`, `src/ui/selected-unit-info.ts`, `src/ui/turn-handoff.ts`, `src/main.ts`, notification/audio routing.

### Task 1: Capacity, Load, postures, Surge, and strain

- [ ] RED tests pin base Capacity 2, precursor empire cap 4, diminishing Network Operations Centers, restricted category Capacity caps, posture cooldown, normal assignment rejection, Surge allowances 1/1/3, recovery/cooldown, nonstacking recovery reduction, and no ordinary plan pause.
- [ ] Capacity/Load are pure derived selectors. Store only posture choice/pending boundary, Surge/recovery timestamps, and plan state.
- [ ] Implement Safeguarded incoming preparation delay/own hostile Load, Integrated default, and Accelerated allowance/recovery exactly. No posture changes base stats/yields.
- [ ] Commit `feat(era13-mr4): add bounded capacity posture and surge rules` after core tests pass.

### Task 2: Constructive infrastructure plans

- [ ] RED tests cover Fabrication Sprint, Research Mesh, Logistics Routing, Survey Grid, every cap, same-plan nonstacking, no recursive yield base, no movement, immediate visible yield recalculation, invalid links, and Surge preview equality.
- [ ] Add the four data definitions with exact anchors, links, Load, Stable, and Surged values from the design.
- [ ] Resolve city-percent yields in projected/canonical yield helpers, route-flat yield in canonical route income, and vision in shared visibility—not UI-only overlays.
- [ ] Commit `feat(era13-mr4): add constructive network plans` after system/UI-yield tests pass.

### Task 3: Formation plans and combat counterplay

- [ ] RED tests cover Guardian Screen/Swarm Strike link range, 1–3 drones, attack/defense exclusivity, declared target/zone, strongest coordination only, EWA suppression, link break/restore, no base-stat loss, and viewer-safe overlay.
- [ ] Add Drone Controller definitions now even though the unit is not trainable until MR5; test with fixture units. This is dormant catalog behavior, not a visible dead action.
- [ ] Integrate combat modifier through canonical combat preview/resolution and emit the applied modifier in visible combat presentation.
- [ ] Commit `feat(era13-mr4): add formation coordination contracts`.

### Task 4: Full Network panel, HUD, and staged teaching

- [ ] HUD shows `Network: Stable · 8/12`, posture icon, and remaining-plan hint only after activation.
- [ ] Network panel has Plans, Capacity, Security; every action remains reachable; details show exact formulas; city/unit panels deep-link to relevant plan/counter.
- [ ] Tutorial defaults Integrated, guides one recommended constructive plan, introduces posture after first success, and Surge after one Stable resolution; skip/replay never locks the panel.
- [ ] Use the truth table/replay requirements below and assert visible DOM after every mutation.
- [ ] Commit `feat(era13-mr4): deliver accessible network control surfaces`.

### Task 5: AI, difficulty, solo, and hot seat

- [ ] Add deterministic bounded candidates and per-round caches. Explorer/Standard/Veteran use existing profile quality knobs; add only `maxConcurrentNetworkPlans` if tests prove top-K alone cannot express the design.
- [ ] AI portfolios include build/research/trade/explore/defend/influence/conquer routes. Explorer must demonstrate one constructive plan and pursue an observed counter inside `planReconsiderRounds`.
- [ ] Solo advisor emits at most one network recommendation/round and never auto-assigns, retargets, Surges, or selects material substitution.
- [ ] Enforce the exact veil/identity/reset/warning/input/resolution order. Dispose overlays/audio/panels at handoff.
- [ ] Commit `feat(era13-mr4): teach and operate autonomy for AI solo and hot seat`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Stable with room for two plans | Assign Fabrication Sprint | HUD Load increases; plan row and city yield breakdown update |
| Plan would exceed Capacity | Try ordinary confirm | Confirm disabled with exact deficit and capacity-building guidance |
| Eligible plan can Surge | Confirm Surge preview | Enhanced result/recovery shown before commit; state becomes Strained after resolution |
| Strained | Open plan catalog | Existing plans still operate; expansion disabled; cancel/shrink/repair remain available |
| Formation link breaks | Move drone out of range | Bonus and link visibly pause; base strength/movement remain |

### Misleading UI risks and replay checklist

- `Room for N plans` is derived from candidate Load, not simple plan count. `Protected` and `Source known` obey exact semantic boundaries. `Recommended` never hides `Show all`.
- Replay assign two plans, retarget, cancel, repeat-click, reopen, Surge, recovery, posture boundary, link break/repair, city capture, peace, elimination, save/load, and handoff.

### MR4 acceptance

- Three-city/eight-city fixtures prove sublinear Capacity. All play-style filters have a competitive plan.
- Same rules across difficulty; Veteran has no hidden info/numeric bonus.
- A seven-year-old playtest script can create one useful plan and explain one counter without formula details.

---

## MR5 — Complete Era 13 content launch

### Drift check

Run after MR2 and MR4. Verify current tech count/track counts, all prerequisite IDs, unit/building catalogs, obsolete/upgrade chains, AI generic coverage, sprite/audio full-record mappings, national-project lifecycle, and the effects already implemented by network/resource systems. Recalculate all literal costs from current measured Era 13 pacing; do not copy stale guessed costs.

### File map

- Expand `src/systems/tech-definitions-eras13.ts` to all 30 definitions.
- Create focused effect modules: `src/systems/era13-tech-effects.ts`, `src/systems/era13-project-effects.ts`, and their tests.
- Modify `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/tech-yield-definitions.ts`, `src/systems/tech-yield-system.ts`, `src/systems/national-project-system.ts`, network/resource modules, AI roles/production/research/upgrades, sprite catalogs/components, selected unit/city panels, and SFX mappings.

### Task 1: Register the complete technology graph

- [ ] RED tests require exactly 30 Era 13 technologies, two per 15 tracks, unique IDs, real prerequisites, honest unlock references, metadata, no cycles, and complete pacing profiles.
- [ ] Transcribe the approved technology table exactly. Preserve `internet` as the existing ID for player-facing Internet Protocols. Do not rename established prerequisite IDs.
- [ ] Add `historicalStatus`, `approximateTimeframe`, real-basis, and abstraction metadata. Speculative list is exactly: General-Purpose AI, Mars Mission Architecture, Molecular Fabrication, Modular Arcologies, Quantum Networking, Digital Personhood.
- [ ] Set literal research costs only from bounded/completionist Era 13 fixtures and target windows; commit the cost ledger in `tests/systems/era-13-pacing.test.ts`.
- [ ] Commit `feat(era13-mr5): register complete era 13 research graph`.

### Task 2: Add all buildings and national projects with complete effects

- [ ] RED generic tests require all 12 buildings in human/AI candidates, prerequisite/building/coastal rules, yields, pacing bands, scope labels, and sprites.
- [ ] Add the exact 12-building table and measured costs. Implement capacity/counter/yield hooks through typed metadata, not building-ID checks in resolver code.
- [ ] Add three projects with +6 single/combined empire yields, home Era 13, fade Era 15, expire Era 16, reservation across built+queued cities, and no duplicate host yield.
- [ ] Circular Manufacturing completion prompts once for Rare Earth or Battery, previews affected production, stores immutable `substitutionResource`, and gives AI the same forecast. Canceling the prompt cannot silently choose.
- [ ] Commit `feat(era13-mr5): add era 13 buildings and national projects`.

### Task 3: Add all five units end to end

- [ ] RED tests require every `UnitType` definition, trainable entry, tech unlock, role tags, upgrade metadata, production candidate, research planning, sprite, motion, SFX, description, and generic coverage.
- [ ] Add Combat Drone 42/6/range2 support cost band, Autonomous Frigate 60/5/range3 marquee/coastal, Exosuit Infantry 58/3/range1 core, Propagandist 0/3, Drone Controller 0/3. Select literal costs from the reference economy.
- [ ] Add explicit upgrade chains: Attack Helicopter → Combat Drone, Destroyer → Autonomous Frigate, Infantry → Exosuit Infantry. Do not infer by shared tech.
- [ ] Add sprites to `UNIT_SPRITE_CATALOG` in the same commit. Add fallback visuals only as resilient loading behavior, not the primary art path.
- [ ] Add unit actions: Propagandist Rally/Undermine and Drone Controller formation assignment through the MR4 plan system. Both are capturable civilians and may Hold.
- [ ] Commit `feat(era13-mr5): add autonomous units and specialists`.

### Task 4: Wire every technology payoff and counter

- [ ] Build a test ledger with one positive and one boundary/negative assertion per technology effect; conjunctive prerequisites and host/scope rules get both half-negative cases.
- [ ] Implement effects through existing typed tech-yield, production, combat, healing, happiness, route, visibility, network, and project helpers. No effect may exist only in description or `main.ts`.
- [ ] Ensure Hypersonic Coordination +3 never stacks with Swarm Strike; strongest applies. Movement bonuses cap Drone at 7 and Frigate at 7 through existing bonuses.
- [ ] Universal Basic Services, Closed-Loop Food, and all constructive-plan conditions use active valid plans, not seeded placeholder records.
- [ ] Commit `feat(era13-mr5): wire all era 13 technology effects`.

### Task 5: Complete AI, UI, data, and SFX integration

- [ ] Generic AI catalogs prove all trainable units/buildings/projects enter candidates, roles, upgrades, and research planning. Add tactical tests for controllers, specialists, counter coverage, mixed forces, and material substitution.
- [ ] Tech/city/unit/Codex panels show honest payoffs, historical status, requirements, resource advantages, capacity restrictions, controller links, and project scope.
- [ ] New unit movement/attack/impact/damage/destruction mappings are complete; specialists use intent/capture/destruction sounds without fake weapons. Formation cues remain batched.
- [ ] Run `scripts/check-src-rule-violations.sh`, all mirrored tests, build, full suite. Commit `feat(era13-mr5): launch complete era 13 roster`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Tech prerequisites satisfied | Select Era 13 node | Exact payoff, status, cost, ETA, prerequisite path, queue controls appear |
| Circular project completes | Choose Rare Earth | Choice persists; affected costs/ETAs update; Battery-only items do not receive it |
| Drone Controller links drones | Confirm formation | Unit panels and map show controller/intent; combat preview includes strongest valid bonus |
| Specialist captured | Enter its hex | Old plan cancels; new owner sees recovery then Hold/intent choices |

### Misleading UI risks and replay checklist

- `Emerging`/`Speculative` are informational, never power tiers. `Empire-wide` project yield must not appear as duplicate host yield. `Can build` must include building/coastal/resource rules.
- Replay tech queue add/reorder/remove/reopen, city production add/reorder/drop/reopen, project choice cancel/confirm/save/load, unit train/upgrade/capture, formation retarget/cancel, AI turn, and hot-seat handoff.

### MR5 acceptance

- Exactly 30 technologies, 12 buildings, 3 projects, 5 units; every player-visible claim has a live mechanic and test.
- Equal-production drone-only composition loses the dominance check; mixed and non-network counter forces remain viable.
- All content is reachable for humans and AI; no ID-specific AI branch without typed semantics.

---

## MR6 — Wonders, strategic audio, balance, and launch hardening

### Drift check

Run after MR5. Verify legendary wonder definition/quest/history/intel/presentation/spectacle seams, audio catalogs/directors/credits, simulation fixtures, tutorial UI, hot-seat handoff, and all balance values actually merged. Run the full suite as baseline before RED tests.

### File map

- Modify legendary wonder definitions/system/history/intel/presentation/Codex/spectacle and panel files.
- Create `src/audio/network-audio-catalog.ts`, `src/audio/network-audio-director.ts`, `tests/audio/network-audio-*.test.ts`.
- Create `tests/simulation/era13-balance.test.ts`, `tests/simulation/era13-ai-playability.test.ts`, `tests/simulation/era13-hotseat-replay.test.ts`, and deterministic fixtures.
- Modify `public/audio/AUDIO-CREDITS.md`, preload/service-worker asset coverage as required, network tutorial/panel copy, reduced-motion styling, notification aggregation.

### Task 1: Add Open Intelligence Commons and Lunar Gateway

- [ ] RED tests cover definition metadata, eligibility, both halves of every conjunctive step, typed event-source history, simultaneous investment, global uniqueness, no same-civ competition, AI selection, rival intel, host-city scope, and completion truth normalization.
- [ ] Add both exact wonder contracts from the design. Open Intelligence Commons makes the first constructive specialist intent zero Load; Lunar Gateway grants autonomous air +1 vision only.
- [ ] Add Codex/historical presentation and existing-style completion ceremony without implying a lunar map layer.
- [ ] Run `./scripts/run-wonder-regressions.sh`. Commit `feat(era13-mr6): add era 13 legendary wonders`.

### Task 2: Add the bounded strategic audio layer

- [ ] RED catalog/director tests cover four motifs: constructive resolution, hostile interference, Surge, strain/recovery; viewer authorization, mute/volume, cooldown/dedup, disposal, formation batching, hot-seat reset, and missing-asset fallback.
- [ ] Source/generate local OGGs, record reproducible source/license metadata and actual durations. Reuse existing assignment/mitigation/capture/discovery families.
- [ ] Never play hostile preparation, hidden movement, or source-localized sound without viewer authorization. Avoid sustained high-frequency interference and continuous alarms.
- [ ] Commit `feat(era13-mr6): add viewer-safe autonomy audio`.

### Task 3: Lock balance with deterministic simulations

- [ ] Pin bounded and completionist research/production windows; many-seed resource distribution; Rare Earth/Battery scarcity/trade values; three-city/eight-city Capacity; all seven play-style portfolios; pressure convergence; mixed-force vs drone-only; non-nuclear path competitiveness.
- [ ] Run AI-v-AI for Explorer/Standard/Veteran and assert same numeric rules plus increasing decision quality. Explorer must demonstrate, Standard combine at least two plan types, Veteran improve timing without hidden intel.
- [ ] Add solo/hot-seat deterministic replay and save-twice equality at Era 13.
- [ ] Tune only through definition/profile data. Any rule change requires design/plan update and targeted negative test.
- [ ] Commit `test(era13-mr6): lock autonomous systems balance`.

### Task 4: Final accessibility, UX, and release verification

- [ ] Script first-time younger, peaceful builder, aggressive tactician, covert/diplomatic, expert optimizer, solo, and 2–4-player hot-seat lenses. Each can create one useful plan, enjoy payoff, and explain one counter.
- [ ] Verify touch, keyboard, labels, focus, reduced motion, mute, no hover-only content, `Show all`, detail formulas, notification aggregation, skip/replay tutorial, and immediate rerenders.
- [ ] Run full web build/test, Tauri frontend build if save import/export or platform paths changed, wonder regressions, XML/asset/license checks, source-rule checker, and both committed/uncommitted diff reviews.
- [ ] Commit `chore(era13-mr6): harden autonomous systems launch`.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Wonder quest condition A but not B | Inspect project | Step remains incomplete and explains missing B |
| Wonder completes | Resolve completion | Reward, ceremony, Codex, host/empire scope, and global uniqueness update once |
| Reduced motion + muted audio | Surge | Static visible emphasis and timing text replace animation/sound |
| Hot-seat hidden hostile plan exists | Confirm next identity | Only that viewer's authorized warning/visual/audio appears after confirmation |

### MR6 acceptance

- All requested review dimensions have automated or scripted acceptance evidence.
- No unresolved high-severity balance, privacy, save, accessibility, or dead-end UX issue remains.
- The game builds and plays normally with audio muted, old saves, solo, hot seat, and all three difficulty modes.

---

## 3. Inline implementation-plan review

The plan was reviewed against the approved design and current code. Issues found and fixed in the plan:

| Dimension | Plan risk found | Inline correction |
|---|---|---|
| Balance | Data-first resources could clutter maps before uses existed | MR2 is one vertical resource delivery; density and production uses land together |
| Balance | Drone content could ship before composition tests | Drone-only equal-production gate is required in MR5 and launch simulation in MR6 |
| Fun | Network foundation could be invisible infrastructure | MR3 ships a complete Harden/Exploit loop; MR4 ships constructive visible payoffs |
| New mechanics | Full system could arrive all at once | Cyber intent teaches persistence first; capacity/posture/Surge arrives next with staged tutorial |
| Ages 7–43 | Formula-first panel would overwhelm younger players | Outcome-first copy plus expandable exact details and guided order are mandatory |
| Play styles | Military/science dependencies could dominate | Four infrastructure plans and seven portfolio filters are acceptance-gated before content launch |
| Difficulty | Explorer might never demonstrate the feature | Explicit demonstration/counter window; same rules and numbers remain |
| Computer players | Unbounded combinations could stall turns | Top-K candidates, deterministic caching, and existing challenge knobs are required |
| UI | State could mutate without live panel refresh | Player truth tables and rendered-DOM tests exist in every interactive MR |
| UX | Filtered recommendations could hide actions | Recommendations only reorder; `Show all` and negative semantic tests required |
| Architecture | Adding tech content before mechanics would create ID branches | Mechanics precede roster; effects use typed metadata/closed union |
| Extensibility | Save and pacing assumptions could fossilize at Era 12 | MR1 creates ordered schema and explicit authored-era profile registry |
| Data | Splitting minerals could create overlapping string categories | Stable sibling `materialFamily` metadata and distinct IDs/use lists are required |
| SFX | Audio-first polish could leak hidden plans | Audio lands last against viewer-authorized events, with batching/disposal tests |
| Saved games | Quantum rename and resource migrations could race | Ordered schema steps: boundary first, resources second, autonomy third; twice-load equality per step |
| Solo | Advisors could become compulsory automation | One recommendation/round; no automatic intent/Surge/material choice; Hold is valid |
| Hot seat | Resolution or warning could fire during handoff | Exact veil/identity/reset/warning/input/end-turn invariant is tested in MR3, MR4, and MR6 |
| Implementation | Splitting Era 13 definitions from wiring would expose dead unlocks | Entire roster remains one MR5 merge boundary |
| Delivery | Later MRs could assume stale paths | Every issue opens with the same drift-check protocol and prerequisite SHA audit |

### Spec coverage audit

- Resource modernization, Cloud/Quantum correction, no cap, saves: MR1–MR2.
- Persistent intents, Cyber conversion, viewer-safe timing: MR3.
- Capacity, postures, strain, Surge, constructive/formation plans, UI/AI/tutorial: MR4.
- Full technology/building/project/unit catalog, effects, sprites, AI, unit SFX: MR5.
- Wonders, spectacle, strategic audio, simulation, final human lenses: MR6.
- Future Era 14+ and World Evolution remain design hooks, intentionally outside implementation scope.

### Placeholder and type audit

- Placeholder markers, vague catch-all implementation steps, and unspecified error handling are forbidden.
- Canonical names are fixed: `saveSchemaVersion`, `EraPacingProfile`, `NetworkPlanTarget`, `NetworkPlanEffect`, `autonomyByCiv`, `networkCivicPressureByCity`, `nextNetworkPlanId`, `substitutionResource`.
- If current code already owns an equivalent concept under a different verified name, update this plan and issue before implementation; do not create a duplicate type.

## 4. Issue and MR operating contract

Each slice gets one GitHub issue. The index issue lists exact order and blocks later issues on earlier merge, not merely PR open. Each issue body must begin with its drift check, then link this plan section, name dependencies, define in/out of scope, list player-visible completion, tests, and safe-merge proof.

MR title format: `feat(era13-mrN): <player-visible slice>`.

MR body must include:

- `Drift check` with SHAs and deviations;
- `Gameplay impact`;
- `Player-visible surfaces`;
- `AI and difficulty`;
- `Solo and hot seat`;
- `Save/migration impact`;
- `Out of scope`;
- `Why this is safe to merge independently`;
- exact targeted/full verification output;
- screenshots for visible DOM/Canvas changes and audio/source credits where applicable.

If only part of an issue is implemented, retitle the PR to the exact subset and either complete all visible follow-through or keep it data-derived hidden. Never merge a button, queue row, tech unlock, recommendation, or plan that leads to an unfinished action.
