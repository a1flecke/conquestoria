# #1083 — Trade-route/marketplace civ-reference live-state invariant: design

## Status

Design + implementation complete in one pass. No production code change — this is a pure
defense-in-depth invariant (the issue's own text: "No demonstrated break"), unlike #1080, where
the equivalent investigation for national projects turned up a real, fixable bug.

## 0. Repository state and dependency gate

- Base SHA: `c109cd4f` (`origin/main`, the merged #1080 fix).
- Fresh worktree `.claude/worktrees/stability-arc-1083`.
- **This is a substitution, not the arc's original next issue.** The arc's queue calls for #1081
  next (opponentAI portfolio integrity), gated on #1122 (capture-force competence, owned by
  another agent) having landed first, with an explicit instruction: "if #1122 is still actively
  being implemented in another worktree, do not race it... swap #1081 with the next independent
  invariant follow-up (prefer #1083) until #1122 lands." Checked: #1122 is still OPEN, its
  worktree (`.worktrees/issue-1122-capture-force`) has local commits not yet pushed/PR'd, no open
  PR exists for it. Per the arc's own explicit preference, substituting #1083.
- Issue #1083: OPEN, no overlapping open PRs.

## 1. The canonical lifecycle (derived from current code, not the issue's own claim)

The issue's suggested fix direction says: *"every `tradeRoutes[].foreignCivId` and
`purchasedResources[].civId` names a civ that exists in `state.civilizations`."* Verified against
current code and found **partially wrong** (`.claude/rules/spec-fidelity.md`'s "Specs Can Be
Stale" pattern) — not carried forward uncorrected:

- **`purchasedResources[].civId` is confirmed major-civ-only.** `performBuyResourceAccess`
  (`resource-acquisition-system.ts`) reads `state.civilizations[buyerCivId]` and returns the state
  unchanged if that civ doesn't exist there. A minor civ can never appear here.
- **`tradeRoutes[].foreignCivId` is NOT major-civ-only.** `getRouteDiplomacy`
  (`trade-system.ts:179`) explicitly reads `state.minorCivs[foreignCivId]` as one of its two
  branches, and a route's `foreignCivId` is set from `toCity.owner` (`trade-system.ts:344`) —
  which is legitimately a minor-civ id whenever the destination city belongs to a city-state. A
  route to a city-state trading partner is completely normal gameplay.

So the invariant's two halves have genuinely different scopes: `foreignCivId` must resolve to
**either** a major civ or a minor civ; `civId` must resolve to a major civ specifically.

## 2. Reachability check for a real bug (same rigor as #1080, different result)

Traced every writer that could leave a stale/dangling reference:

- Route creation (`trade-system.ts`) always derives `foreignCivId` from a real, live
  `toCity.owner` at the moment of creation — never a bogus id.
- City capture (`city-capture-system.ts`) does **not** touch `marketplace.tradeRoutes` at all —
  confirmed by grep, zero references. This means a captured city's existing trade routes keep
  their pre-capture `foreignCivId`, which could become *semantically stale* (naming the old owner
  instead of the new one) — but the old owner id still resolves to a real, live civ. That is a
  staleness/correctness question, not a dangling reference, and is explicitly **outside this
  issue's stated scope** ("names a civ that exists" — it does, just possibly the wrong one). Not
  pursued further, matching #1080's own scope-creep guardrail and this issue's own "no
  demonstrated break" framing.
- Civ elimination (`civilization-elimination-system.ts:220`) already strips `tradeRoutes` entries
  referencing the eliminated civ — the one path that *does* clean up.

**Conclusion: no demonstrated break, matching the issue's own text.** This stays a pure
defense-in-depth invariant, not a bug fix — the honest outcome, not a target to manufacture a fix
for.

## 3. The invariant itself

`assertMarketplaceReferences(state)` (`tests/helpers/save-state-invariants.ts`), added to
`SAVE_STATE_INVARIANTS`, reusing the file's existing `ownerKind` helper (already shared with
`assertCityRosters`) rather than re-deriving a civ/minor-civ classifier. No-op if
`state.marketplace` is absent (a marketplace-less game state, e.g. an early-schema save before
migration, is legal and has nothing to check).

- For each `tradeRoutes[]` entry with a defined `foreignCivId`: must classify as `'civ'` or
  `'minor'` via `ownerKind` (not `'other'`).
- For each `purchasedResources[]` entry: `civId` must exist in `state.civilizations`.

**Deliberately does not re-check elimination status** — `ELIMINATED_CIV_AREAS.marketplace` /
`assertEliminatedCivHasNoLiveEntities` already owns "references an eliminated civ specifically";
this invariant owns the distinct, previously-uncovered question "references a civ/minor-civ that
exists at all," regardless of whether it's currently eliminated. The two checks are complementary,
not overlapping: this one catches an id that never corresponded to a real entity (typo,
copy-paste, key collision); the elimination check catches a real id whose civ died. Deliberately
does **not** assert `foreignCivId === state.cities[toCityId]?.owner` (a stronger staleness check
than requested — see §2).

## 4. Integration

Registered in `SAVE_STATE_INVARIANTS`, so it is automatically exercised wherever that array
already runs:

- `tests/storage/save-compat-matrix.test.ts` + `tests/simulation/ai-playability.test.ts` — **run
  together, 47/47 passed**, no historical fixture trips the new check.
- Long-horizon matrix: not run (docs-only-adjacent scope note — this is a narrow, no-code-change
  invariant addition, not a change materially affecting AI/gameplay-scale behavior).
- Solo/hot-seat: the invariant reads only `civilizations`/`minorCivs`/`marketplace`, no
  `currentPlayer`/`hotSeat` dependency.

## 5. Scope guardrails honored

No redesign of the marketplace/trade system, no new content, no AI change, no save-schema field,
no broad capture rewrite (the staleness question in §2 is explicitly left alone, not silently
"fixed" under this issue's banner).

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

- **Gameplay / fun / new mechanics**: none — this is a test-only invariant addition, zero
  production code touched.
- **Player ages 7-43 / play styles / difficulty modes**: unaffected — no player-facing surface at
  all (test-only change).
- **Computer players (AI)**: the AI creates trade routes through the same `trade-system.ts` path
  as the player; the invariant applies identically to AI- and player-created routes. No AI logic
  touched.
- **UI/UX**: none.
- **Architecture**: reuses the existing `ownerKind` helper rather than adding a parallel
  classifier — the smallest addition consistent with this file's own established pattern.
- **Extensibility**: a future marketplace field with a civ reference would need its own line here
  (not automatic), same as every other invariant in this file — no structural enforcement exists
  for "every civ-id-shaped field gets checked" (that would be a much larger, separate effort, out
  of this issue's scope).
- **Data**: no `GameState` shape change.
- **SFX**: not applicable.
- **Updating saved games**: no migration — test-only change, no persisted shape touched.
- **Proper testing**: 10 new cases (no-marketplace no-op, fresh-game pass, major-civ route pass,
  minor-civ route pass, no-`foreignCivId`-domestic-route pass, unknown-`foreignCivId` fail,
  major-civ purchase pass, unknown-purchase-civId fail, minor-civ-purchase fail (proving the
  major-civ-only asymmetry is actually enforced), multi-problem aggregate-message test) in
  `tests/helpers/save-state-invariants.test.ts`; integration via the save-compat matrix and
  AI-playability fixture (§4).
- **Regressions solo play / hot seat**: not seat-count-dependent; full regular + intensive suite
  run before merge (plan doc's test plan).
- **Proper implementation**: this doc, the plan doc, and the diff are the full scope.
