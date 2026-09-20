# #1080 — National-project empire-uniqueness live-state invariant: design

## Status

Design + implementation complete in one pass (single continuous session; see the arc-adaptation
note in `docs/superpowers/specs/2026-09-20-issue-1126-remeasure-design.md` — no separate
Astra/Terra/Sol models exist to hand off between here). This investigation found and fixed a real,
reachable production defect, not just a defense-in-depth gap — see §3.

## 0. Repository state

- Base SHA: `6f1166d5` (`origin/main`, the merged #1126 reconciliation — confirmed via
  `git fetch origin main && git log -1`).
- Fresh worktree `.claude/worktrees/stability-arc-1080-1081`, hooks configured, mise trusted,
  dependencies installed.
- Issue #1080: OPEN, no overlapping open PRs (`gh pr list --state open` → `[]`).
- Read: `.claude/rules/invariants.md` (#1003 catalog), `tests/helpers/save-state-invariants.ts` (+
  its test file), `src/systems/national-project-system.ts`, `src/systems/city-system.ts`
  (`getAvailableBuildings`, `processCity`), `src/systems/city-capture-system.ts`
  (`removeNationalProjectsForCity`, the owner-transfer spread), `src/core/turn-manager.ts` (the
  `builtNationalProjects` write on production completion), `src/storage/migrations/**` (no
  national-project-specific migration/repair exists yet — confirmed by grep, nothing to
  reconcile against a historical fixture).

## 1. The canonical lifecycle (derived from current code, not assumed)

- `getReservedNationalProjectKeys(state, civId)` (`national-project-system.ts`) is the **only**
  gate on queueing a NEW `uniquePerEmpire` item: it unions `builtNationalProjects` keys for this
  civ with every `uniquePerEmpire` item currently anywhere in any of this civ's cities'
  `productionQueue` (not just the active head — any position). `getAvailableBuildings`
  (`city-system.ts:2100`) excludes a reserved key from the candidate list a human or the AI can
  choose from.
- `builtNationalProjects` is keyed `${civId}:${buildingId}` — **one slot per civ per project**, so
  a second completion silently **overwrites** the first record (`turn-manager.ts`'s
  `city:building-complete` handler writes unconditionally). This means the ledger itself
  structurally cannot reveal a "built in two cities" duplicate — the duplicate can only be
  observed by scanning each city's own `.buildings` array directly, exactly as #1080's issue body
  says.
- On city capture (`city-capture-system.ts`), the owner-transfer spread (`{...city, owner:
  newOwnerId, ...}`) leaves `productionQueue` **untouched** — a queued item survives capture
  unchanged. `removeNationalProjectsForCity` strips the **former** owner's *completed* project
  from the captured city (`builtNationalProjects` record + `.buildings` entry) so the new owner
  never inherits a finished building, but it does **not** touch `productionQueue`.
- Expiry (`expireNationalProjects`, era delta ≥ 3) deletes both the `builtNationalProjects` record
  and the `.buildings` entry — after expiry the civ can legitimately re-queue and rebuild the same
  project. Not a duplicate concern: the invariant is a point-in-time check, and expiry always
  clears the "built" side before a fresh queue action could recreate it.

## 2. Legal vs. illegal states, decided from the lifecycle above

| Representation pair | Legal? | Why |
|---|---|---|
| Built in exactly one city | ✅ | normal completion |
| Queued in exactly one city (any queue position) | ✅ | normal, matches `getReservedNationalProjectKeys`'s own scope |
| Built in one city, queued in a **different** city | ❌ | §3 — reachable via capture; `getReservedNationalProjectKeys` would have blocked a *fresh* queue action, but does not retroactively clean up a queue entry that predates the build (or, per §3, was inherited from another civ's city at capture time) |
| Queued in two different cities | ❌ | `getReservedNationalProjectKeys` is the only gate preventing this at queue time; if it were ever bypassed (a bug, a scenario builder, a future migration), nothing else catches it |
| Built in two different cities | ❌ | the exact "silent overwrite hides it" gap #1080's issue body describes |
| Two **different** `uniquePerEmpire` projects, each in its own city | ✅ | uniqueness is per-project, not "one national project total" |
| A **non-unique** building present in multiple cities | ✅ | uniqueness only applies when `building.uniquePerEmpire` |
| Two **different civs** each holding the same project id | ✅ | `uniquePerEmpire` means unique within an empire, not globally — confirmed by the `${civId}:...}` key shape and every helper being civ-scoped |
| Built + queued **in the same city** (a completed item still sitting in its own queue) | out of scope | structurally shouldn't happen in live play (a completion should already have removed the item from its own queue) and is a same-city queue/building consistency question, not a cross-city empire-uniqueness one — deliberately not asserted here (see the invariant's own doc comment) |
| A city whose `.owner` disagrees with its civ's roster | ignored | that drift is #997's invariant (`assertCityRosters`); this invariant must not mis-attribute a building to the wrong civ by trusting the roster over the city's own `.owner` |

## 3. A real, reachable defect found and fixed (not just a defense-in-depth gap)

Tracing "built in city A, queued in city B" for reachability turned up an actual bug:
`processCity` (`city-system.ts`) **accepts** a `builtNationalProjectKeys` parameter — the exact
same reserved-keys set `turn-manager.ts` already computes correctly for `getAvailableBuildings`'
candidate-exclusion check — but **never reads it** inside `processCity`'s own body (confirmed:
the only occurrence of the identifier inside that function is its own parameter declaration).

Concretely reachable: civ X captures a city from civ Y (or from a breakaway) whose
`productionQueue` still names a `uniquePerEmpire` project civ X **already completed** in one of
its own, pre-existing cities. `removeNationalProjectsForCity` only strips the *former* owner's
completed record from the captured city — the captured city's `productionQueue` transfers to the
new owner unmodified. Every subsequent turn, `processCity` would have kept accumulating
production toward that already-built project and eventually completed it a second time,
producing exactly the "built in two cities" duplicate this invariant exists to catch — with the
ledger overwrite hiding it from `builtNationalProjects` and only the two cities'
`.buildings` arrays showing the true duplicate.

**Fix** (the earliest causal writer, per this issue's own instruction not to merely whitelist
corrupted state): `processCity` now has a belt-and-suspenders filter — sibling to the existing
"dequeue NPs outside their build window" filter immediately above it — that drops any queued item
which is a `uniquePerEmpire` national project already present in `builtNationalProjectKeys` for
`city.owner`. New `ProductionDropReason: 'already-built-elsewhere'`, wired end-to-end: the type
union, `describeDroppedProductionItem`'s switch (still exhaustive, no `default`), and the existing
`city:production-item-dropped` → `notification-routing.ts` → player-facing toast path — no new
wiring needed there since it's generic over `ProductionDropReason`.

This is a **behavior change**, not a pure performance/doc change: a save that happened to be
carrying this exact stale-queue shape will now see that queue entry silently drop (with a
notification) instead of eventually double-completing the project. No save migration is needed —
this is normal turn-processing behavior converging on the invariant, not a persisted-shape change
(see `.claude/rules/game-systems.md`'s "A persistent `GameState` shape change needs a migration or
a proof it does not" — nothing about `ProductionDropReason`'s value set or `productionQueue`'s
type changed; only *when* an existing legal queue entry gets dropped changed, which is exactly the
category of behavior migrations don't gate).

## 4. The invariant itself

`assertNationalProjectUniqueness(state)` (`tests/helpers/save-state-invariants.ts`), added to
`SAVE_STATE_INVARIANTS`, following this file's exact established pattern (`InvariantError`, a
`problems: string[]` accumulator, one throw naming every violation). Scoped to
`state.civilizations` only (major civs) — national projects are architecturally civId-keyed
throughout (`getReservedNationalProjectKeys`, `getActiveNationalProjectsForCiv`,
`getNationalProjectCivYieldBonus` all take a `civId`), and minor civs have no national-project
production path (confirmed against `.claude/rules/game-balance.md`'s Minor-Civ Economy section:
`getMinorCivBuildCandidates` is restricted to a small safe unit/building catalog that does not
include any `nationalProject` entry).

For each civ, scans every **owned** city (`city.owner === civId`, not merely "named in the civ's
roster" — see the roster-drift exclusion in §2) for `uniquePerEmpire` national-project ids in
`.buildings` and in `.productionQueue` (any position), and flags: built in >1 city; queued in >1
city; built in one city while also queued in a *different* city. Error messages name the civ, the
project id, and every conflicting city id, per this issue's own requirement.

## 5. Integration

Because the check is registered in `SAVE_STATE_INVARIANTS`, it is automatically exercised
everywhere that array already runs — no new wiring needed:

- `tests/storage/save-compat-matrix.test.ts` (every representable schema version, migrate → turn →
  save → reload) — **run, 47/47 passed**, no historical fixture trips the new check.
- `tests/simulation/ai-playability.test.ts` (per-round invariant battery) — **run, passed**
  alongside the matrix in the same invocation.
- Long-horizon matrix: not run for this change (docs/scope note in
  `.claude/rules/ai-simulation.md` — that suite is explicit-run-only and reserved for changes that
  materially affect AI/gameplay-scale behavior; this is a narrow, capture-path-only behavior
  change with its own focused regression, not a broad AI/economy change warranting the ~60-90
  minute run).
- Solo/hot-seat: the invariant reads only `civilizations`/`cities`, with no `currentPlayer` or
  `hotSeat` dependency — identical behavior regardless of seat count, matching every other
  invariant in this file.
- No historical/migrated fixture failed — meaning no existing save-compat fixture already carries
  this defect's shape (consistent with the defect being newly-fixed forward, not retroactively
  present in checked-in fixtures).

## 6. Scope guardrails honored

No project redesign, no cost/yield changes, no new content, no AI production-preference change, no
broad city-capture rewrite (only the one already-existing, already-passed-in parameter got wired
up), no new save-schema field.

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

- **Gameplay / fun / new mechanics**: none introduced — this closes a latent duplicate-completion
  bug reachable only via a specific capture sequence; the fix makes the game behave the way its
  own uniqueness rule already promises, not a new rule.
- **Player ages 7-43 / play styles**: the only player-visible surface is a new toast ("X removed
  from Y's build queue — you already completed it in another city") in the rare case a captured
  city's queue is stale. Plain language, consistent with every sibling drop message in
  `describeDroppedProductionItem`.
- **Difficulty modes**: unaffected — the fix and the invariant read only tech/building/queue
  state, never `OpponentChallenge`; nothing here varies by Explorer/Standard/Veteran.
- **Computer players (AI)**: the AI already avoids queueing a duplicate via
  `getReservedNationalProjectKeys` at queue time (unaffected by this change); the fix protects the
  AI too when it inherits a captured city's stale queue, same as a human player would be.
  `applyAIProduction`'s own within-round duplicate-avoidance (threading `nextState` through its
  idle-city loop) was traced and confirmed already correct — not touched.
- **UI/UX**: one new notification string, following the exact existing pattern; no new panel, no
  new interaction.
- **Architecture**: reuses an existing, already-correctly-computed parameter instead of adding new
  plumbing — the smallest possible fix for the defect found, consistent with #1080's own "primarily
  a live-state correctness assertion plus regressions unless evidence exposes a real bug" scope
  guardrail.
- **Extensibility**: a future `uniquePerEmpire` national project is automatically covered by both
  the fix (generic over `building.uniquePerEmpire`) and the invariant (generic over the same
  field) — no per-project branch anywhere.
- **Data**: no `GameState` shape change. `ProductionDropReason` gained one new string-literal
  member — a TypeScript union widening, not a persisted-shape change (the field's *type* was
  already a bare `string` at the JSON level via `ProductionDropReason`, and every existing value
  already round-trips through saves the same way).
- **SFX**: not applicable — no audio-triggering surface touched.
- **Updating saved games**: no migration — see §3's explicit justification (a turn-processing
  behavior convergence, not a shape change). `tests/storage/save-persisted-shape-ratchet.test.ts`
  (part of the full suite run below) would fail if this were wrong; it did not.
- **Proper testing**: unit tests for the invariant (positive: single-city built, single-city
  queued, two different projects, non-unique building, two civs each with their own copy;
  negative: built-in-two-cities, queued-in-two-cities, built-in-one-queued-in-another, roster-drift
  exclusion; message-content assertion for civ/project/city-id naming) in
  `tests/helpers/save-state-invariants.test.ts`; regression tests for the `processCity` fix
  (positive drop case, negative "not yet built anywhere" case, negative "non-unique building"
  case) plus a `describeDroppedProductionItem` case in `tests/systems/city-system.test.ts`;
  integration via the save-compat matrix and AI-playability fixture (§5).
- **Regressions solo play / hot seat**: not seat-count-dependent (§5); full regular + intensive
  suite run before merge (see plan doc's test plan).
- **Proper implementation**: this doc, the plan doc, and the diff together are the full scope.
