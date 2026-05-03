# Idle Production & Build Badges Design

**Issue:** [#159 — Cities should have an option to just produce X](https://github.com/a1flecke/conquestoria/issues/159)
**Date:** 2026-05-02

## Overview

Three related improvements to city production legibility:

1. **Idle production selector** — always visible in the city panel so players can set a gold/science fallback at any time, not just when the queue is empty.
2. **Map badges** — small emoji overlays on city circles showing what is currently being built (bottom-right) and what idle conversion mode is set (top-left), so players can read the full city state at a glance without opening any panel.
3. **Build-list icons** — the same emoji used for map badges appears alongside every item in the city panel's choose-what-to-build list, so the mapping is self-documenting.

Culture was considered as a third idle option and explicitly scoped out: culture is not currently a civ-level tracked yield. It will be addressed in a separate issue once civ-level culture tracking exists.

---

## Section 1 — Always-Visible Idle Production Selector

### What changes

In `src/ui/city-panel.ts`, remove the `if (city.productionQueue.length === 0)` guard around the idle selector HTML block. The selector renders unconditionally.

The label changes from:
> "Queue is empty — convert +X/turn production to:"

to:
> "When idle, convert +X/turn production to:"

This makes clear it is a standing preference, not a live command.

### What does NOT change

- The conversion logic in `src/systems/city-system.ts` is untouched — production is still only converted to gold/science at turn start when `productionQueue.length === 0`.
- The `City.idleProduction?: 'gold' | 'science' | null` type is untouched.
- The `onSetIdleProduction` callback signature is untouched.

### Behaviour

| Queue state | Selector visible? | Conversion fires? |
|---|---|---|
| Empty | Yes | Yes (each turn) |
| Non-empty | Yes | No |

---

## Section 2 — HUD Per-Turn Yield Wiring (NEW)

The HUD in `src/main.ts` (`updateHUD`) sums `calculateProjectedCityYields(state, cityId)` across all the player's cities to display `+gold/turn` and `+science/turn`. The idle conversion is applied separately inside `processCity` at turn-end, so without this section the HUD's per-turn rates will not reflect the idle bonus, and the player will see gold/science silently jump each turn with no visible source.

### What changes

`calculateProjectedCityYields` in `src/systems/city-work-system.ts` (or the HUD aggregation in `src/main.ts:updateHUD` — see decision note below) must apply the idle conversion when projecting yields:

- If `city.productionQueue.length === 0 && city.idleProduction === 'gold'`: shift `production` → 0 and add the original `production` value to `gold`.
- If `city.productionQueue.length === 0 && city.idleProduction === 'science'`: shift `production` → 0 and add the original `production` value to `science`.
- Otherwise: no change.

### Decision: where to apply

Apply inside `calculateProjectedCityYields` so every consumer of projected yields (HUD, `getRecommendedIdleCityChoice`, advisor preview, future panels) sees the same numbers. Keep `processCity` as the authoritative actor at turn-end — `calculateProjectedCityYields` just mirrors what would happen if the turn were processed now.

### Tests

- `calculateProjectedCityYields` returns shifted yields for an idle city with `idleProduction === 'gold'`.
- `calculateProjectedCityYields` returns shifted yields for an idle city with `idleProduction === 'science'`.
- `calculateProjectedCityYields` returns unshifted yields when queue is non-empty even if `idleProduction` is set.
- `calculateProjectedCityYields` returns unshifted yields when `idleProduction` is `null`.

---

## Section 3 — Map Badges

City circles in `src/renderer/city-renderer.ts` gain two new badge positions. All badge drawing happens inside the existing `drawCities` loop, reading `city.idleProduction` and `city.productionQueue` directly from the city object (no change to `CityRenderInfo`).

### Ownership gate (privacy)

**Both new badges only render when `city.owner === playerCivId`.** Visibility (fog-of-war) alone is not sufficient — `ui-panels.md` rule "Persistent intel UI must render from viewer-safe snapshots" forbids exposing an enemy city's production or idle setting via the badge. Without this gate, hot-seat Player A would leak Player B's plans.

The existing top-right status badge (breakaway/occupation/unrest) is unchanged and stays visible for any owner — those are world-state observable to all viewers.

### Top-left badge — idle production mode

Position: `screen.x - size * 0.45, screen.y - size * 0.45`
Font: `${size * 0.28}px system-ui` with `textAlign = 'center'`, `textBaseline = 'middle'` (matches existing status badge for visual consistency).

Drawn only when **all three** are true:
1. `city.owner === playerCivId`
2. `city.idleProduction !== null && city.idleProduction !== undefined`
3. `city.productionQueue.length === 0` (the badge means "actively converting now", not "fallback set but inactive")

| `city.idleProduction` | Badge |
|---|---|
| `'gold'` | 💰 |
| `'science'` | 🔬 |

### Bottom-right badge — currently building

Position: `screen.x + size * 0.45, screen.y + size * 0.45`
Font: same as top-left badge.

Drawn only when **all three** are true:
1. `city.owner === playerCivId`
2. `city.productionQueue.length > 0`

Looks up `PRODUCTION_ICONS[city.productionQueue[0]]`, falling back to `🏗️` for any unrecognised ID (including legendary wonders, which use the fallback by design — see Section 4).

### Mutual exclusion

By construction of the conditions above, top-left and bottom-right are mutually exclusive on any given city — the player sees exactly one of `[idle badge | build badge | nothing]` plus the existing top-right status badge if applicable. No dual-state ambiguity.

### Existing top-right badge

Unchanged: breakaway ⛓/👑, occupation ☹/⚡, unrest 🔥/⚡.

---

## Section 4 — Production Icon Map

A new exported constant in `src/systems/city-system.ts`:

```ts
export const PRODUCTION_ICONS: Record<string, string> = {
  // full mapping defined in the tables below
};
```

Placed directly after the `BUILDINGS` and `TRAINABLE_UNITS` declarations. Both the renderer and the city panel import it from this single location.

### Building icons

| ID | Icon | Rationale |
|---|---|---|
| `granary` | 🌾 | Grain storage |
| `herbalist` | 🌿 | Herbal medicine |
| `aqueduct` | 💧 | Fresh water |
| `workshop` | 🔨 | Tools |
| `forge` | 🔥 | Metalworking (avoids clash with ⚒️ used as production-yield emoji in panel/HUD) |
| `lumbermill` | 🪵 | Timber |
| `quarry-building` | ⛏️ | Stone cutting |
| `library` | 📚 | Knowledge |
| `archive` | 📜 | Preserved records |
| `observatory` | 🔭 | Astronomy |
| `marketplace` | 🏪 | Trade |
| `harbor` | ⚓ | Sea trade |
| `barracks` | 🪖 | Military training |
| `walls` | 🧱 | City defence |
| `stable` | 🐴 | Mounted units |
| `temple` | 🛕 | Spiritual centre |
| `monument` | 🗿 | Commemoration |
| `amphitheater` | 🎭 | Entertainment |
| `shrine` | ⛩️ | Worship |
| `forum` | 📢 | Public gathering |
| `safehouse` | 🏠 | Spy support |
| `intelligence-agency` | 🛡️ | Counter-intelligence shielding (distinct from spy_agent 🕵️) |
| `security-bureau` | 🔒 | Advanced CI |

### Unit icons

| Type | Icon | Rationale |
|---|---|---|
| `warrior` | ⚔️ | Melee combat |
| `archer` | 🏹 | Ranged |
| `scout` | 🔍 | Exploration |
| `worker` | 🪚 | Improvement |
| `settler` | 🏕️ | City founding |
| `swordsman` | 🗡️ | Advanced melee |
| `pikeman` | 🔱 | Pike formation |
| `musketeer` | 🔫 | Gunpowder |
| `galley` | ⛵ | Early naval |
| `trireme` | 🚢 | Advanced naval |
| `spy_scout` | 👁️ | Surveillance |
| `spy_informant` | 📡 | Intelligence gathering |
| `spy_agent` | 🕵️ | Field operations |
| `spy_operative` | 🎯 | Precision ops |
| `spy_hacker` | 💻 | Cyber warfare |
| `scout_hound` | 🐕 | Tracking |
| `shadow_warden` | 👤 | Stealth (Persia) |
| `war_hound` | 🐺 | Combat (Rome) |

### Fallback

Any ID not in `PRODUCTION_ICONS` (including all legendary wonders) renders as `🏗️`. Wonders are intentionally excluded from the icon map for this issue — adding wonder icons is a follow-up.

### City panel build list

The current code in `src/ui/city-panel.ts` **already prepends literal hardcoded prefixes**: `🏗️` for every building (line 74) and `⚔️` for every unit (line 89). These literals must be **replaced**, not augmented, by the per-item `PRODUCTION_ICONS[id]` lookup. Naively prepending would produce double-icon output like `🏗️ 🌾 Granary`.

The icon also appears prefixed in:
- The current-production block (`Building: <name>` → `Building: <icon> <name>`)
- The queue follow-up rows (`queue-name-${idx}` placeholder)

All icon output uses the same `textContent` injection pattern as existing dynamic labels (no `innerHTML` with game-generated strings).

---

## Section 5 — Tests

### City panel — idle selector

| Test | Description |
|---|---|
| Selector visible, queue empty | Existing — unchanged |
| Selector visible, queue non-empty | Replaces "not shown when queue non-empty" assertion |
| Gold button click | Existing — unchanged |
| Science button click | New |
| None button click | New |

Test fixtures: reuse `makeWonderPanelFixture()` from `tests/ui/city-panel.test.ts`.

### City panel — build list icons

- Assert that the rendered HTML for the build list contains the correct `PRODUCTION_ICONS` icon for at least one building (e.g. `🌾 Granary`) and one unit (e.g. `⚔️ Warrior`).
- Assert that the literal `🏗️` does not appear before a building name when that building has a more specific icon (i.e. literal pre-existing prefixes were replaced, not duplicated).

### Renderer — production badge helper

Create a pure function `getProductionBadgeIcon(city: City): string | null` in `src/renderer/city-renderer.ts` (exported for testing). Returns the icon string when queue is non-empty, `null` when empty. Renderer skips drawing when result is `null`.

| Test | Assertion |
|---|---|
| Queue non-empty, known ID | Returns correct emoji from PRODUCTION_ICONS |
| Queue non-empty, unknown ID | Returns `'🏗️'` fallback |
| Queue non-empty, wonder ID | Returns `'🏗️'` fallback (documents wonder exclusion) |
| Queue empty | Returns `null` |

### Renderer — ownership gate

A focused integration test that renders `drawCities` against a stub canvas context and asserts:
- Idle badge emoji is **not** drawn when `city.owner !== playerCivId`, even with `idleProduction` set and queue empty.
- Build badge emoji is **not** drawn when `city.owner !== playerCivId`, even with non-empty queue.
- Both badges are drawn correctly when `city.owner === playerCivId`.

Implement via a `ctx` spy that records every `fillText` call.

### HUD per-turn projection

| Test | Assertion |
|---|---|
| Idle gold city | `calculateProjectedCityYields` returns `production: 0`, `gold: original-gold + original-production` |
| Idle science city | `calculateProjectedCityYields` returns `production: 0`, `science: original-science + original-production` |
| Idle setting + queue non-empty | Returns unshifted yields |
| `idleProduction: null` | Returns unshifted yields |

### Regression — icon coverage

Two regression tests in `tests/systems/city-system.test.ts`:

```
every key in BUILDINGS has an entry in PRODUCTION_ICONS
every type in TRAINABLE_UNITS has an entry in PRODUCTION_ICONS
```

These fail immediately when a new building or unit is added without a corresponding icon, making the omission impossible to miss.

---

## Section 6 — Wiring rule update

Add a one-line entry to `.claude/rules/end-to-end-wiring.md` so future contributors and the PostToolUse hook treat `PRODUCTION_ICONS` as a required wiring partner:

> When you add an entry to `BUILDINGS` or `TRAINABLE_UNITS` in `src/systems/city-system.ts`, you MUST also add a matching entry to `PRODUCTION_ICONS` in the same file. The icon-coverage regression test enforces this, but the rule prevents the failed test cycle.

This is preventive (catches before commit) rather than reactive (test fail after commit).

---

## Out of Scope

- **Culture as idle production option** — requires adding a `culture` field to `Civilization`, HUD wiring, and turn-manager plumbing. Tracked separately.
- **AI usage of idle production** — AI does not yet set `idleProduction`. Can be added in a follow-up alongside AI build-queue improvements.
- **Wonder icons** — legendary wonders fall back to `🏗️` and are documented as such in tests. Adding wonder-specific icons is a follow-up.
