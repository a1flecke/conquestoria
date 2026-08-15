# GameSession state-mutation audit — design

**Status:** approved for planning (2026-08-15). Feeds `writing-plans` next.

## Problem

`GameSession` (`src/app/game-session.ts`) is documented in `src/app/ports.ts` as
"the single owner of game state" and states that `commit()` is "the ONLY correct
way to publish a state change to the player." In practice, it has exactly two
subscribers, wired once in `src/app/bootstrap.ts:454-455`:

```ts
session.subscribe(next => renderLoop.setGameState(next));
session.subscribe(() => hud.update());
```

Both fire only when `session.commit(next)` or `session.update(fn)` runs.

A full-repo grep of every `getState()` call site (`grep -rln "getState()" src/`,
25 files, ~700 call sites, cross-checked against mutation-shaped regexes) found
**44 sites across 6 app-layer files** that instead mutate the object returned
by `session.getState()` directly — an assignment, a `delete`, or a mutating
array method (`.push`) applied straight through the reference — then, in most
cases, manually call `renderLoop.setGameState(session.getState())` to patch
over the missing publish.

Because `renderLoop.setGameState` is called by hand but `hud.update()` is not,
**most of these sites silently skip the HUD refresh** — but not uniformly; see
"Severity is uneven" below. Where the HUD is skipped, it (yield rates,
notifications, turn counter — see `CLAUDE.md`'s "HUD should show per-turn
yield rates... not just totals") stays stale until some unrelated later
action happens to call `commit`/`update` and catch it up incidentally.

**Second-pass review (2026-08-15) found a sharper problem than HUD lag: at
least one panel's own refresh currently works only *because* of the mutation
bug, not despite it** — see "Fix pattern" and the `city-panel.ts` scope note
below. Naively converting those sites would regress a currently-working
surface into a stale one.

This is separate from the **already in-flight** `#787` Phase 14
(`setStateWithoutRefresh` debt audit — "14a" landed as of `db578fc9`). Phase 14
audits call sites that go *through* the `GameSession` API (`setStateWithoutRefresh`)
but intentionally skip the refresh, then decides per-site whether that's a bug.
This audit is calls that bypass the API's write path (`commit`/`update`/
`setStateWithoutRefresh`) *entirely*, mutating the live object out from under
the session. The two debts share files and reviewers should expect some of
Phase 14's remaining sites and this audit's sites to sit a few lines apart in
the same functions, but they are different bugs with different fixes.

## Two mutation shapes found

**Shape A — direct write-through** (the majority, ~38 of 44 sites):
```ts
deps.session.getState().cities[cityId] = enqueueCityProduction(targetCity, itemId);
deps.renderLoop.setGameState(deps.session.getState());   // hud.update() never runs
```

**Shape B — aliased-reference write** (6 sites, all routed through
`getCurrentCiv()`/`deps.currentCiv()` in `src/app/cross-cutting-helpers.ts:62`,
which returns `session.getState().civilizations[session.getState().currentPlayer]`
— a live reference, not a copy):
```ts
deps.currentCiv().diplomacy = declareWar(deps.currentCiv().diplomacy, targetCivId, ...);
```

## Full inventory (verified 2026-08-15, re-run before each phase per repo convention)

| File | Sites | Shape | Currently observable staleness | Notes |
|---|---|---|---|---|
| `src/app/controllers/player-action-controller.ts` | 4 | B×2, A×2 | HUD only (L264-267, L276); **neither** at L439 — `executeMinorCivConquest` already calls `hud.update()` manually at L447, so that site is architecture-debt only, not a live bug | L264-265 (`ensurePlayerWarState`, both civs — chains into a trailing `setStateWithoutRefresh` at L267, see Fix pattern), L276 (`restAction`), L439 (post-move unit, part of `executeMinorCivConquest`) |
| `src/app/controllers/campaign-entry-controller.ts` | 2 | A×2 | HUD only | L237, L257 — duplicate `settings.councilTalkLevel` branches |
| `src/app/controllers/turn-flow-controller.ts` | 2 | B×1, A×1 | **Neither** — `refreshRequiredChoicesAfterAction` (L188-192) already calls `renderLoop.setGameState` + `updateHUD()` manually right after both flagged sites; architecture-debt only | L261 (tech queue), L268 (city production) |
| `src/app/controllers/selection-controller.ts` | 15 | A×15 | HUD, need per-site re-check during Phase 4 — not individually verified in this review pass | Espionage actions (disguise, infiltrate, embed) + unit-automation clear/rest, all under a `session`-scoped closure |
| `src/app/controllers/panel-actions-controller.ts` | 21 | B×3, A×18 | HUD only for espionage sites (867-1019 — `deps.router.open('espionage')` fully rebuilds that panel from fresh state each time, so no panel-staleness risk there); **HUD + open-panel** for the 4 city-production sites (L665, L677, L683, L741) — see next section | Espionage panel (embed/mission/recall/verify/spawn), city production (enqueue/reorder/idle-mode/focus), tech queue (B-shape, mirrors turn-flow-controller), settings |
| `src/app/cross-cutting-helpers.ts` | 0 direct | — | — | Root-cause helper (`getCurrentCiv`) enabling all Shape-B sites above; not itself a mutation site |
| **Total** | **44** | | | |

Exact line numbers are recorded in each phase's own PR (grep drifts between
phases the same way Phase 14's 66-site count drifted from its original 46-site
estimate — re-run the inventory grep at the start of each phase, don't trust
this table's line numbers verbatim once other phases have landed). The
"currently observable staleness" column is a spot-check from this review
pass, not an exhaustive per-site audit — each phase must verify its own
sites' actual severity before writing PR-body claims, rather than assuming
uniform HUD-only staleness (`spec-fidelity.md`'s overclaiming concern).

Inventory greps used (rerun with `--include="*.ts"` from repo root):
```
grep -rnE "getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]" src/
grep -rnE "delete [A-Za-z0-9_.]*getState\(\)" src/
grep -rnE "getState\(\)(\.[A-Za-z0-9_]+|\[[^]]+\])+\.(push|splice|pop|shift|unshift|sort|reverse)\(" src/
grep -rnE "\.diplomacy = (declareWar|makePeace|breakTreaty)" src/app/
grep -rn "currentCiv()\." src/app/ | grep -v "\.diplomacy\b"
```

## Scope

**In scope:** the 6 files above, **plus `src/ui/city-panel.ts`** (added in
review — see "Fix pattern" below; not a `getState()` mutation site itself,
but its callback contract must change in lockstep with 4 of
`panel-actions-controller.ts`'s sites or Phase 5 introduces a regression).

**Out of scope, deliberately:**
- `src/systems/**`, `src/ai/**`, `src/core/**` — these functions take a local
  `state: GameState` parameter and never call `.getState()` themselves. They're
  already governed by `.claude/rules/game-systems.md`'s "Immutable Turn
  Processing" rule (spread-copy, return new `GameState`) and its existing test
  coverage. Not re-audited here.
- `src/app/game-session.ts` itself — its internal `state = fn(state)` / `state
  = next` assignments inside `commit`/`update`/`setStateWithoutRefresh` are the
  one sanctioned mutation path; that's what makes it "the single owner."
- The ~650 *read-only* `getState()` call sites across the other 19 files
  surfaced by the initial grep (`bootstrap.ts`, `game-session-controller.ts`,
  `hud-controller.ts`, `map-interaction-controller.ts`, `diplomacy-actions-controller.ts`,
  every `src/presentation/register-*.ts`, `src/ui/*.ts`, `src/audio/*-director.ts`)
  — verified by inspection to only read through `getState()`, never assign
  through it. Not touched.
- `#787` Phase 14's `setStateWithoutRefresh` debt — different axis, tracked in
  its own plan (`docs/superpowers/plans/2026-08-04-composition-root-decomposition.md`
  Phase 14), already in progress. This audit does not change any
  `setStateWithoutRefresh` call that isn't also one of the 44 mutation sites.
- Compile-time enforcement (`DeepReadonly<GameState>` on `getState()`'s return
  type) — considered and rejected. Every `src/systems/**` function accepts
  `state: GameState` by value; a readonly return type would need either an
  unsafe cast at every one of the ~650 read call sites or a signature change
  across every systems function that takes state — turning a bounded audit
  into a type-system rewrite. A grep-based regression test (below) gets the
  same "no new sites" guarantee at a fraction of the blast radius, matching
  this repo's existing convention (`tests/app/architecture-boundaries.test.ts`
  is the same class of check).

## Fix pattern

`GameSession.update(fn)` is already the "read-modify-commit" primitive this
needs — no new `GameSession` API. Each site becomes a spread-copy building a
new `GameState`, passed to `session.commit(next)` (when the full next state is
already assembled) or `session.update(state => next)` (when reading fresh
state at update time avoids a stale-read race — e.g. two rapid actions against
the same civ). This is the same spread-copy convention
`.claude/rules/game-systems.md` already mandates for systems code:

```ts
// before (Shape A)
deps.session.getState().cities[cityId] = enqueueCityProduction(targetCity, itemId);
deps.renderLoop.setGameState(deps.session.getState());

// after
deps.session.commit({
  ...deps.session.getState(),
  cities: { ...deps.session.getState().cities, [cityId]: enqueueCityProduction(targetCity, itemId) },
});
```

```ts
// before (Shape B)
deps.currentCiv().diplomacy = declareWar(deps.currentCiv().diplomacy, targetCivId, turn);

// after — cross-cutting-helpers.ts's getCurrentCiv() keeps its current
// read-only convenience shape (unchanged, to avoid widening this audit's
// blast radius into every other read-only consumer of getCurrentCiv); only
// the two mutating call sites change to build a new civ and commit it
const civ = deps.currentCiv();
deps.session.update(state => ({
  ...state,
  civilizations: { ...state.civilizations, [civ.id]: { ...civ, diplomacy: declareWar(civ.diplomacy, targetCivId, turn) } },
}));
```

Each conversion is a behavior fix (the HUD now refreshes where it silently
didn't before) — same framing Phase 14 uses: **list every converted site as
its own line in the PR body**, not a silent bundle. Where a call site's
`renderLoop.setGameState(...)` companion call becomes redundant (because
`commit`/`update` now does it), delete the now-redundant manual call rather
than leaving both.

**Trace chained writes to the real terminal state-write before converting.**
A flagged mutation is sometimes followed, in the same function, by a further
non-refreshing write (`setStateWithoutRefresh`, or a second mutation) that
would silently absorb the fix if only the flagged line is touched.
Concretely: `ensurePlayerWarState` ([player-action-controller.ts:256-268](../../../src/app/controllers/player-action-controller.ts))
mutates both civs' `.diplomacy` (Shape B, the flagged lines) and *then* calls
`deps.session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(...))`
— converting only the two flagged lines leaves the function's actual final
state-write non-publishing. The correct fix unifies all three writes
(attacker diplomacy, defender diplomacy, opportunistic-penalty) into one
`session.update(state => ...)` call. Before converting any site, read the
enclosing function to its actual end, not just the flagged line.

**`city-panel.ts`'s four queue callbacks need a matching contract change, not
just a mutation fix.** `onBuild`, `onMoveQueueItem`, `onRemoveQueueItem`, and
`onSetIdleProduction` ([city-panel.ts:72-90](../../../src/ui/city-panel.ts))
currently return `void`, and their handler in `city-panel.ts` calls bare
`rerenderPanel()` — which defaults its `nextState` parameter to a **closure
variable captured once when the panel opened**
([city-panel.ts:1384](../../../src/ui/city-panel.ts)). Today the panel shows
fresh data after these actions only because the flagged in-place mutation
writes onto the exact same object that closure already points to — the panel
refresh currently works *by accident of shared reference*, not by design.
Converting `panel-actions-controller.ts`'s corresponding 4 sites (L665, L677,
L683, L741) to genuine `session.commit()` (a new object) **without** also
widening those 4 callback signatures to `GameState | void` and passing the
result to `rerenderPanel(nextState)` — the pattern `onSetCityFocus` /
`onToggleWorkedTile` / `onRushBuyActiveProduction` already use correctly
([city-panel.ts:76-95](../../../src/ui/city-panel.ts)) — **regresses a
currently-working panel into a stale one**, violating
`.claude/rules/ui-panels.md`'s explicit rule: *"If a panel action mutates
state that the same panel renders, the visible panel must refresh
immediately... Updating only global state/HUD while leaving the open panel
stale is a bug."* Phase 5 must convert these 4 sites and their `city-panel.ts`
wiring together, in the same commit.

**The existing test for this exact path is coupled to the bug and must be
rewritten, not extended.** `panel-actions-controller.test.ts`'s "queues real
production via the live city state and refreshes the renderer" test asserts
`state.cities['test-city'].productionQueue` against the *outer* fixture
variable, which only stays in sync with `deps.session.getState()` today
because of the same in-place-mutation shortcut — and it mocks `createCityPanel`,
so it cannot currently prove the visible panel re-renders either way. Phase 5
must rewrite this assertion to read `deps.session.getState()` directly, and
add real coverage that `createCityPanel` gets re-invoked with the fresh city
after `onBuild`/`onMoveQueueItem`/`onRemoveQueueItem`/`onSetIdleProduction`
(matching `docs/superpowers/plans/README.md`'s "test what the player sees,
not just what state changed").

## Regression guard

Add a new `it` block to `tests/app/architecture-boundaries.test.ts` (same file
and style as the existing `document.getElementById` ban), scanning
`src/app/**`, `src/presentation/**`, and `src/ui/**` (excluding
`src/app/game-session.ts` and `src/app/ports.ts`) for the same three regex
shapes used in this audit's inventory. Zero matches required. This is a
counter that can only move one direction, same framing as this repo's other
source-grep ratchets (e.g. the retired `refresh-bypass-ratchet.test.ts`) — add
it in the **last** phase, once the count is verified at zero, so it isn't
failing mid-arc.

**Real-time backstop (recommended, cheaper than the test):**
`.claude/hooks/check-src-edit.sh` already has a PostToolUse check for direct
state mutation (`state\.(cities|units|civilizations)\[[^]]+\]\s*=`), but it's
scoped to a bare `state` variable — the turn-processing convention — and does
not match `getState()` chains, so it currently gives zero real-time feedback
on this exact bug class. Add a companion block there in the same phase as the
boundary test, mirroring the existing pattern, so future violations are
caught at edit time instead of only at `yarn test` time.

## Behavioral test per site

For each converted site, the phase's tests must prove a `session.subscribe`
listener actually fires post-action — not just that `session.getState()`
returns the expected new value. Concretely: register a test-only subscriber
(mirroring `hud.update()`'s role) before the action, assert it was called
after. Several controller test files already assert `renderLoop.setGameState`
was called for these actions; extend those rather than duplicating, and add
the missing HUD-equivalent assertion alongside.

## Phasing

One PR per phase, mirroring this repo's existing per-file sub-phase
convention (`#787` Phase 8a-d, 10b-a..g, 14):

1. **`cross-cutting-helpers.ts` decision + `player-action-controller.ts`** (4
   sites) — smallest, includes both mutation shapes, sets the template other
   phases follow.
2. **`campaign-entry-controller.ts`** (2 sites) — trivial, quick win.
3. **`turn-flow-controller.ts`** (2 sites) — touches turn advancement; run
   `yarn test:ai-playability` for this phase per Part VI of the composition-root
   plan's testing rules (any change that can shift when the HUD/AI observe a
   state update needs that guard).
4. **`selection-controller.ts`** (15 sites) — heaviest single-domain
   (espionage + unit-automation), no turn-flow risk.
5. **`panel-actions-controller.ts`** (21 sites) **+ `src/ui/city-panel.ts`**
   — heaviest overall (espionage panel + city production + tech queue). The 4
   city-production sites must land together with `city-panel.ts`'s callback
   contract change (see "Fix pattern") and the rewrite of
   `panel-actions-controller.test.ts`'s coupled queue test — not as follow-up
   work, since shipping the mutation fix alone regresses the open panel.
6. **Regression guard** — add the `architecture-boundaries.test.ts` boundary
   test and the `check-src-edit.sh` real-time check (see "Regression guard"),
   from a verified zero count, close the arc.

Every phase runs `yarn build` and `yarn test` (per `CLAUDE.md`); Phase 3 also
runs `yarn test:ai-playability`. Phase 1 and Phase 5 each require reading
their flagged functions to their actual end (not just the flagged line) per
the chained-write note in "Fix pattern," since both phases contain a
confirmed instance of that hazard.

## Risks

| Risk | Mitigation |
|---|---|
| Inventory drifts between phases (new mutation sites added by unrelated feature work landing concurrently) | Re-run the inventory greps at the start of each phase, same practice Phase 14 uses |
| A site's manual `renderLoop.setGameState()` call is deleted but the conversion misses a case where `renderLoop` and `hud` genuinely need different timing | Behavioral test asserts both subscribers fire; if a site turns out to need to stay split, document why at that site rather than silently leaving old code in place |
| Converting a Shape-B site changes `getCurrentCiv()`'s contract for its other (read-only) callers | Explicitly not changing the helper's shape — only the 6 mutating call sites change, verified by grep before each phase closes |
| **(found in review) Converting a flagged mutation without checking for a trailing non-refreshing write in the same function leaves the real bug unfixed while looking fixed** | "Trace chained writes to the real terminal state-write" requirement in Fix pattern; confirmed instance at `ensurePlayerWarState` |
| **(found in review) A panel whose refresh currently works only via shared-object-reference "regresses to stale" once the underlying mutation becomes a genuine copy** | `city-panel.ts`'s 4 queue callbacks scoped into Phase 5 explicitly, converted in the same commit as their `panel-actions-controller.ts` call sites; searched all of `src/ui/*.ts` for the same `GameState \| void = state`-default pattern and confirmed `city-panel.ts` is the only file with this specific hazard shape |
| **(found in review) The one existing test for the city-production queue path is coupled to the mutation bug and would give a false pass or false regression signal either way** | Phase 5 rewrites (not extends) that test to assert against `deps.session.getState()` and to prove `createCityPanel` is re-invoked with fresh data |
