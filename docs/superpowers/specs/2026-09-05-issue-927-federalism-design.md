# #927 Federalism / Autonomy Rung — Design (final rung)

**Date:** 2026-09-05
**Issue:** #927 (administration-ladder tracker)
**Base:** `origin/main` at `71a22826` (post Railway Administration, PR #968)
**Scope:** Era 9+ rung. Player-facing name: **Federal Autonomy**.

## Goal

A real tradeoff — substantial `Empire overextension` relief in exchange for
reduced central treasury remittance — not another free permanent bonus. A
persistent civ-wide choice (enable/disable), not an automatic tech effect.

## Current-main audit

- No existing major-civ "policy/stance" toggle exists. `MinorCivPolicy` is a
  minor-civ AI posture, unrelated. `src/core/autonomy-state.ts` /
  `autonomy-capacity.ts` / `autonomy-activation.ts` / `autonomy-postures.ts`
  are the Cyber/network-warfare system's `AutonomyPostureId` (network-unit AI
  autonomy) — an entirely different, explicitly-out-of-scope (#419) mechanic
  that happens to share the English word "autonomy." Naming this rung's state
  `federalismEnabled`/`FEDERALISM_*` (never `autonomy`/`Autonomy*`) avoids
  colliding with that system's vocabulary.
- `turn-manager.ts`'s per-civ turn loop already has exactly the canonical
  revenue-aggregation choke point this needs: `totalGold` accumulates every
  income source across the loop body, and immediately before
  `grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + totalGold` it
  already subtracts resource-outpost upkeep and Vassalage tribute
  (`processVassalageTribute`, 25% of `totalGold` to the overlord). This is the
  single correct place to apply Federal Autonomy's remittance loss — matches
  "apply the cost at a canonical civ revenue aggregation layer," and reuses an
  already-proven pattern rather than inventing a new one.
  - **Note (not touched, out of scope):** `processVassalageTribute` computes
    `Math.floor(vassalGoldIncome * 0.25)` with no floor at zero, so a civ with
    negative `totalGold` gets a *negative* tribute subtracted — a pre-existing
    reverse-subsidy bug. Federal Autonomy's own remittance calculation
    explicitly guards against this (see below) rather than copying it.
- `hud-controller.ts`'s `airDefenseButton` is the closest UI precedent for "a
  clickable HUD toggle with on/off presentation text," but it is a pure
  client-side rendering preference (`renderLoop.toggleAirDefenseOverlay()`,
  no `GameState` mutation) — not a template for a state-mutating action.
  `diplomacy-actions-controller.ts`'s `handleAppeaseFaction`/
  `handleConcedeToMovement` are the real precedent: a pure system function
  returning `{ success, state, message }`, committed via
  `deps.session.commit(result.state)`. `HudControllerDeps` already carries
  `session: GameSession`, so the HUD button can call `session.update(...)`
  directly with no new dependency.
- No existing empire/government/policy panel (`PanelId` in
  `panel-registry.ts` has 17 entries, none empire-governance-shaped). Per the
  rung's own guidance ("do not create a giant government screen for one
  mechanic... add the smallest coherent control"), this does not get a new
  `PanelId` — see UI decision below.
- Era 9+ civics candidates: `universal-suffrage` (era 9), `welfare-state`
  (era 9), `decolonization` (era 10, prereqs `universal-suffrage` +
  `propaganda-campaigns`), `international-institutions` (era 10). Decision
  below.

## Decision

**Unlock: `decolonization`** (era 10, civics). Its current text already reads
"emerging nations pursue self-determination and reshape world order" — an
unusually direct thematic match requiring no reinterpretation. Appended an
honest second `unlocks` sentence; left its existing `+2 gold empire-wide`
effect untouched.

**Scope: global civ-level stance**, per the rung's own strong default
preference — one boolean per civ, not per-city. Courthouse/Regional Capital
already cover local placement choices; Governors (#928) is reserved for
scarce per-city assignment; a per-city Federal Autonomy would overlap both.

**New persisted fields on `Civilization`** (schema 24 → 25, additive):

```ts
federalismEnabled?: boolean;      // undefined/false = centralized (default, safe on old saves)
federalismChangedTurn?: number;   // turn of the most recent toggle (either direction)
```

This is a genuine player choice that cannot be derived from anything else
(unlike every prior rung), so — per the rung's own save contract — it earns
the arc's first real schema bump.

**Toggle-abuse prevention: one lock covers both directions.**
`FEDERALISM_LOCK_TURNS = 8`: after any toggle (on *or* off),
`setFederalismStance` refuses another toggle until
`state.turn >= federalismChangedTurn + FEDERALISM_LOCK_TURNS`. A single lock
is deliberately simpler than tracking separate "minimum duration while on"
and "cooldown while off" timers, and it closes the actual abuse vector
(flip on, bank one turn's relief, flip off before paying for it again) by
construction: relief and remittance loss are read from the identical
`civ.federalismEnabled` field at the identical per-civ turn-processing pass,
so there is no phase-order gap between them to exploit in the first place —
the lock exists to stop *thrash* (flipping every turn to chase a marginal
edge), not to plug a synchronization hole that doesn't exist here.

**Relief target: `Empire overextension` only** (not `Distance from capital`).
Federal Autonomy is this ladder's *widest* lever, and the ordering
(`Courthouse → Road & Post → Regional Capital → Bureaucracy → Railway
Administration → Federal Autonomy`) already gives distance pressure three
dedicated, differently-themed levers; giving Federal Autonomy a fourth would
blur its identity as "the last resort for sheer city count" — Bureaucracy's
own natural successor, not a generic catch-all. War weariness, recent
conquest, and every other pressure family are untouched, matching every
earlier rung's own row-family discipline.

## Relief contract

The base positive row remains unchanged:

```
Empire overextension +O
```

```
bureaucracy = (separation-of-powers researched) ? getBureaucracyReliefAmount(...) : 0
rawRelief = max(0, O - bureaucracy)   // "how much of O remains after Bureaucracy"
federalismRelief = min(
  rawRelief,
  max(0, D + O - 2 - courthouseRelief - roadPostRelief - regionalCapitalRelief - bureaucracy - railwayRelief)
)
```

`rawRelief` is deliberately *not* independently capped at a small constant —
"substantial" is the point, and every prior rung's own relief is already
subtracted from the shared `D + O - 2` budget before Federal Autonomy's own
cap applies, so the shared residual floor still holds by the same inductive
argument the Railway Administration design doc already proved: each source's
cap enforces `priorSum + ownRelief <= D + O - 2`, so the invariant carries no
matter how many rungs stack — verified directly by a full six-rung stacking
test landing exactly on the floor.

## Economic cost

```
FEDERALISM_REMITTANCE_LOSS_FRACTION = 0.2   // 20% of this turn's positive gold income
```

Applied once per civ per turn in `turn-manager.ts`, in the same block as
Vassalage tribute:

```ts
if (civ.federalismEnabled) {
  const remittanceLoss = Math.floor(Math.max(0, totalGold) * FEDERALISM_REMITTANCE_LOSS_FRACTION);
  totalGold -= remittanceLoss;
}
```

`Math.max(0, totalGold)` is the explicit reverse-subsidy guard `processVassalageTribute`
itself lacks (see audit note above) — a civ already running a deficit never has that
deficit *reduced* by enabling Federal Autonomy. No city yield values are mutated; this
is a single post-aggregation subtraction at the canonical revenue choke point, so no
UI element needs to know about it beyond the final gold total it already displays.

## AI

`unrestReliefTechBonus` picks up `decolonization` generically via
`researchUnlockTechId`, same as every prior rung — zero new AI research code.
Whether the AI actually *enables* the stance (a state toggle, not a
build/research action) needs its own decision, separate from research
valuation: `basic-ai.ts`'s per-civ turn logic gets one new deterministic
check — enable when `Empire overextension` pressure is meaningful (a
pressured-city count analogous to `unrestReliefTechBonus`'s own gate) *and*
the civ's treasury can absorb the loss (a minimum gold reserve, so a poor
AI civ doesn't enable a costly stance it can't afford), *and* the lock
permits it; disable is never chosen automatically (matching "AI must not
toggle every turn" and "AI poor/low-unrest empire rejects it" — a poor AI
civ simply never enables it in the first place under this gate, so no
separate "disable when broke" branch is needed). No hidden information: the
gate reads only the AI's own `state.civilizations[civId]` and its own cities'
computed pressure rows, the same information a human player has in the city
panel.

## Guidance and UI

`unrest-guidance.ts` gets two new `Empire overextension` branches, ordered
after Bureaucracy's own (mutually exclusive: Bureaucracy's fires only when
*not* researched, so order between them does not matter functionally, but
placing Federal Autonomy's after keeps the file's reading order matching the
ladder's own progression):

- `research-federalism`: once `separation-of-powers` (Bureaucracy) is already
  researched (so this is never suggested as a substitute for the cheaper,
  no-cost rung), `decolonization` is not yet researched, and its own direct
  prerequisites (`universal-suffrage`, `propaganda-campaigns`) are done.
- `enable-federalism`: once `decolonization` is researched, the stance is not
  already enabled, and a hypothetical enabled-state simulation shows
  `getFederalismReliefAmount(...) > 0` for this city (mirrors the existing
  `build-regional-capital` guard, which checks a real relief amount rather
  than mere availability) — "meaningful administrative pressure remains,
  projected relief matters" from the rung's own design brief. Does not fire
  while the toggle is locked (points at the HUD control regardless; the
  lock's own turn number is not surfaced as a separate recommendation kind
  — the HUD button itself shows the lock state).

No new `PanelId`. Reusing the existing HUD readout (`hud-controller.ts`) is
the smallest coherent control: a button next to the treasury readout,
visible once `decolonization` is researched, reading "🏛 Federal Autonomy: Off"
/ "🏛 Federal Autonomy: On", disabled (with a title tooltip naming the turn it
unlocks) while locked. Click calls `session.update(state =>
setFederalismStance(state, state.currentPlayer, !enabled).state)` directly —
`HudControllerDeps` already exposes `session`, so no new dependency or
controller file is needed, matching the `airDefenseButton` button-lifecycle
pattern (created once, presentation refreshed every `update()`) without
copying its client-only-toggle mechanics.

## Hot-seat

`federalismEnabled`/`federalismChangedTurn` live on `Civilization`, keyed by
civ id like every other per-civ field — automatically owner-scoped. The HUD
button reads `state.civilizations[state.currentPlayer]`, so it already
reflects the active hot-seat player on handoff with no extra wiring, matching
every other HUD element's existing hot-seat behavior.

## Save

Schema 24 → 25. Migration is additive/no-op: old saves have neither field,
`federalismEnabled` defaults falsy (centralized — the safe default named
explicitly in the rung's own save contract), no toggle event or revenue
mutation fires on load.

## Test contract

`tests/systems/faction-system.test.ts`: relief formula (no tech, tech but
disabled, enabled with bounded relief, distance/war/conquest untouched,
unrelated tech), stacking with all five prior rungs landing on the shared
floor, `setFederalismStance` (research gate, redundant-toggle rejection, lock
enforcement in both directions, successful toggle updates both fields),
remittance-loss math including the zero/negative-income guard, hot-seat
isolation. `tests/systems/unrest-guidance.test.ts`: both new recommendation
kinds' gating. `tests/ai/ai-research.test.ts`: generic AI valuation of
`decolonization`. `tests/ui/unrest-guidance-copy.test.ts`: both new copy
cases. `tests/app/controllers/hud-controller.test.ts` (or equivalent):
button visibility, on/off presentation, lock-disabled state, click wiring.
`tests/storage/save-migrations.test.ts`: schema 25 migration round-trips an
old save with both fields defaulted.

## Full-ladder verification

`faction-system.test.ts`'s "lands exactly on the shared residual floor with
all six rungs stacked (full ladder)" test confirms this directly: a maxed-out
12-city, `D=20` fixture with Courthouse, Road & Post Network, Regional
Capital, Bureaucracy, Railway Administration, and Federal Autonomy all active
lands at exactly `total pressure = 2` — the shared floor, never below it, even
with the strongest single source (Regional Capital's own 10-point cap)
consuming enough of the shared budget that Railway Administration and Federal
Autonomy both correctly deliver zero marginal relief in that scenario. "The
ladder makes large empire playable; it does not make infinite empire free"
holds by construction, not by coincidence: every source's cap subtracts every
earlier source's *actual delivered relief* (via the real functions that
produce their real rows, never a duplicated formula), so
`sum(all relief) <= D + O - 2` is an inductive invariant regardless of which
or how many sources are active.

## Roadmap tracking and closure

#927 reopened and updated before implementation: Railway Administration
marked shipped (#968); Federal Autonomy marked active. This is the only PR
in the arc permitted to close #927, and only once every rung above is
verified shipped on `main`, the full-ladder stacking test passes, and the
FINAL pre-MR inline review (covering this rung plus its interaction with
every earlier one) has no remaining in-scope findings.
