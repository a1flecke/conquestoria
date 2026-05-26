# MR-D: Unrest Guidance, Era-2 Notification, and Audio Stinger Restore

**Issues:** #257, #259, #263, #265  
**Date:** 2026-05-25  
**PR strategy:** Single PR — all four issues share the faction notification path and the audio director

---

## #257 — Music Goes Silent After City-Founding Stinger (Era 1)

### Root cause

`MusicDirector.intendedSnapshot` (line 38, `src/audio/music-director.ts`) defaults to `'silent'`. When the audio system starts an era-1 game, it calls `this.mixer.setSnapshot('peace', 0)` directly (line 59, `src/audio/audio-system.ts`) without going through the director — so `intendedSnapshot` remains `'silent'`.

When a city is founded, `handleCityFounded` calls `playStingerWithDuck`. After the stinger ends, `playStingerWithDuck` restores to `this.intendedSnapshot` (line 80) — which is still `'silent'`. All bus gains drop to 0 and music stops.

The prior fix for issue #246 (era-1 music not initially playing) addressed initial playback by calling `mixer.setSnapshot` directly, but left `intendedSnapshot` stale. Issue #257 is the follow-on: the stinger's restore step reveals the unfixed state.

### Fix

**File:** `src/audio/music-director.ts`

Add a public `initPeaceSnapshot()` method that sets `intendedSnapshot` and delegates the snapshot update to the mixer:

```ts
initPeaceSnapshot(): void {
  this.intendedSnapshot = 'peace';
  this.mixer.setSnapshot('peace', 0);
}
```

**File:** `src/audio/audio-system.ts`

In `start()`, replace the era-1 direct mixer call with the director method:

```ts
if (state.era > 1) {
  this.director.handleEraAdvanced({ era: state.era, civType: this.currentCivType });
} else {
  // Era-1 new game: delegate to director so intendedSnapshot stays in sync.
  this.director.initPeaceSnapshot();
}
```

The `initPeaceSnapshot` call is synchronous and idempotent — it can safely be called before `preloadForEra` resolves.

### Tests (`tests/audio/music-director.test.ts`)

- `initPeaceSnapshot()` sets `intendedSnapshot` to `'peace'` (verify via subsequent `handleCityFounded` — after stinger, `mixer.setSnapshot` is called with `'peace'`, not `'silent'`).
- `handleCityFounded` after `initPeaceSnapshot`: `mixer.setSnapshot` is called with `'peace'` at stinger restore (not `'silent'`).
- `handleCityFounded` without `initPeaceSnapshot` (default `'silent'`): stinger restore calls `setSnapshot('silent')` — regression guard confirming the bug existed and is now fixed by `initPeaceSnapshot`.

---

## #259 — Unrest-Started Notification Doesn't Explain How to Stabilize

### Root cause

The existing `faction:unrest-started` handler in `src/ui/notification-routing.ts` (line 78–81) emits a brief one-liner:

```
"<City> is slipping into unrest. Stabilize it before revolt spreads."
```

This tells the player something is wrong but not what to do. Players — especially new ones — don't know the three stabilization options (garrison, gold appease, happiness buildings) or how many turns they have before revolt escalates. The notification is also not actionable enough to be useful on the recurring `faction:critical-status` event.

### Fix

**File:** `src/systems/faction-system.ts`

Export `REVOLT_UNREST_TURNS` so notification code can reference it:

```ts
export const REVOLT_UNREST_TURNS = 5;  // was private const
```

**File:** `src/ui/notification-routing.ts`

Import `REVOLT_UNREST_TURNS` and `getCityAppeaseCost` from `faction-system.ts`, and enrich the `faction:unrest-started` handler:

```ts
import { REVOLT_UNREST_TURNS, getCityAppeaseCost } from '@/systems/faction-system';

// In routeFactionTransition:
if (event.type === 'faction:unrest-started') {
  const city = state.cities[event.cityId];
  if (!city) return;  // null guard — city may be destroyed the same turn
  const appeaseCost = getCityAppeaseCost(city);
  sink(
    event.owner,
    `${city.name} is slipping into unrest. Stabilize within ${REVOLT_UNREST_TURNS} turns or rebels will spawn. Options: garrison a military unit, spend ${appeaseCost}🪙 to appease, or build happiness improvements.`,
    'warning',
  );
  return;
}
```

> **Critical-status spam:** The `faction:critical-status` event fires **every turn** for each city that remains in unrest or revolt. Do NOT add rich guidance text to the critical-status handler — it would produce identical guidance messages turn after turn, drowning the log. The critical-status notification remains brief (existing text). Rich guidance fires only on `faction:unrest-started` and `faction:revolt-started` (transition events, once per escalation).

**Enhanced revolt notification** (also a transition event, fires once):

```ts
if (event.type === 'faction:revolt-started') {
  const city = state.cities[event.cityId];
  if (!city) return;
  sink(
    event.owner,
    `${city.name} is in open revolt! Rebels have spawned. Defeat them and reduce pressure to restore order. After 10 turns of revolt the city may break away permanently.`,
    'warning',
  );
  return;
}
```

### Tests (`tests/ui/notification-routing.test.ts`)

- `routeFactionTransition` for `faction:unrest-started` produces a message containing `REVOLT_UNREST_TURNS` value (`'5'`), the city name, the appease cost, and the word `'garrison'`.
- `routeFactionTransition` for `faction:unrest-started` with a null city (`state.cities[event.cityId]` undefined) calls the sink **zero times** (null guard regression).
- `routeFactionTransition` for `faction:revolt-started` produces a message containing `'10 turns'` (breakaway warning) and the city name.
- `routeFactionTransition` for `faction:critical-status` with `status === 'unrest'` produces a **short** message (under 100 characters) that does NOT contain `REVOLT_UNREST_TURNS` guidance text (anti-spam regression).

---

## #263 — Null Safety for City and Capital Lookups in New MR-D Code

### Root cause

This is a structural requirement, not a standalone bug. The new notification enrichment code added by #259 and the era-2 guidance added by #265 will read `state.cities[event.cityId]` and `state.civilizations[owner]`. Both can be undefined if a city is destroyed or a civilization is eliminated in the same turn processing pass.

The faction-system's `computeUnrestPressure` already guards against this correctly (line 39–40):

```ts
const capitalId = civ.cities[0];
const capital = capitalId ? state.cities[capitalId] : null;
```

All new code introduced in this MR must follow the same pattern.

### Fix

Every new code path in `notification-routing.ts` and `main.ts` that reads city or civ state must:

1. **`state.cities[cityId]`** — always use `?.` or an explicit null check. Return early or use a fallback (`'a city'`) before accessing any property.
2. **`state.civilizations[owner]?.cities?.[0]`** — always guard the whole chain. If the capital ID is undefined or the capital city is undefined, skip the lookup gracefully.
3. **`state.civilizations[owner]?.gold`** — same pattern for gold lookups in appease-cost displays.

These are enforced by the tests in #259 (null-city case) and #265 (civ-with-no-cities case). No separate code change beyond the guards already specified in those sections.

### Tests (`tests/ui/notification-routing.test.ts`)

- #259 null guard test covers `state.cities[event.cityId] = undefined` → sink not called.
- `routeFactionTransition` for `faction:unrest-started` where `state.civilizations[event.owner]` is undefined does not throw (no crash test).

---

## #265 — Era-2 Transition Has No Unrest Guidance; Players Hit Cliff Unaware

### Root cause

The era-2 transition (era advancing from 1 to 2) unlocks the full unrest system (`processFactionTurn` exits its `clearEraOneUnrest` fast-path at `state.era <= 1`). There is no in-game notification that tells the player this has happened — they receive the era advancement stinger but no explanation that cities can now unrest.

Additionally, the `era:advanced` event (emitted by `turn-manager.ts` line 751) has no handler in `main.ts` for player-facing notifications. The notification log never shows era transition messages.

### Fix

**Step 1 — Handle `era:advanced` in `main.ts`**

**File:** `src/main.ts`

Add an `era:advanced` bus handler alongside the other bus handlers:

```ts
bus.on('era:advanced', ({ era }) => {
  const civName = gameState.civilizations[gameState.currentPlayer]?.name ?? 'Your civilization';
  showNotification(`${civName} has entered Era ${era}!`, 'success');

  if (era === 2) {
    // Emit deferred guidance notification for each player who just entered era 2.
    // This fires once per civ when they reach era 2, not on every turn.
    appendFactionNotice(
      gameState.currentPlayer,
      `Era 2 begins — cities can now experience unrest. High pressure (overcrowding, distance from capital, unhappiness) will trigger it. Garrison units, spend gold to appease, or build happiness improvements to keep order.`,
      'info',
    );
  }
});
```

> **Null guard:** `gameState.civilizations[gameState.currentPlayer]` is always defined during active gameplay (the player's civ cannot be eliminated while it is the current player), so a defensive `?.` is used but the fallback is cosmetic.

> **Hot-seat scope:** `era:advanced` fires once per era transition globally, not per player. In hot-seat mode, the current player at the moment of the event receives the notification. If other players need it on their next turn, this is out of scope — the current fix addresses the initial gap.

**Step 2 — Export era-2 constants for future city panel use**

**File:** `src/systems/faction-system.ts`

Export the breakaway threshold alongside `REVOLT_UNREST_TURNS` (already exported by #259):

```ts
export const REVOLT_UNREST_TURNS = 5;    // turns at unrest before revolt
export const BREAKAWAY_REVOLT_TURNS = 10; // turns at revolt before breakaway
```

The `BREAKAWAY_REVOLT_TURNS` constant is currently a magic number (`>= 10`) on line 250 of `faction-system.ts`. Extracting it makes it testable and available to city-panel code that wants to show "X turns until breakaway."

### Tests (`tests/main.integration.test.ts` and `tests/systems/faction-system.test.ts`)

- Advancing to era 2 causes `appendFactionNotice` to be called once with a message containing `'Era 2'` and the word `'unrest'`.
- Advancing to era 3 causes `showNotification` to be called with `'Era 3'` but does NOT call `appendFactionNotice` with unrest guidance (era-2 guidance is era-2-specific).
- `REVOLT_UNREST_TURNS` is exported and equals 5.
- `BREAKAWAY_REVOLT_TURNS` is exported and equals 10.
- `processFactionTurn` still calls `clearEraOneUnrest` when `state.era <= 1` (regression guard — gating still works).
- `processFactionTurn` does NOT call `clearEraOneUnrest` when `state.era === 2` (regression guard — gating lifts at era 2).

---

## Summary of files changed

| File | Change |
|------|--------|
| `src/audio/music-director.ts` | Add `initPeaceSnapshot()` public method |
| `src/audio/audio-system.ts` | Era-1 start path: `director.initPeaceSnapshot()` instead of `mixer.setSnapshot` directly |
| `src/systems/faction-system.ts` | Export `REVOLT_UNREST_TURNS`; extract and export `BREAKAWAY_REVOLT_TURNS` |
| `src/ui/notification-routing.ts` | Enrich `faction:unrest-started` and `faction:revolt-started` messages; null guards throughout; import `REVOLT_UNREST_TURNS` + `getCityAppeaseCost` |
| `src/main.ts` | `bus.on('era:advanced')` handler with era-2 unrest guidance notification |
| `tests/audio/music-director.test.ts` | 3 new tests for `initPeaceSnapshot` and stinger restore |
| `tests/ui/notification-routing.test.ts` | 4 new tests for enriched messages, null guard, anti-spam |
| `tests/main.integration.test.ts` | 2 new tests for era:advanced notification |
| `tests/systems/faction-system.test.ts` | 4 new/updated tests for exports and era-gating regressions |
