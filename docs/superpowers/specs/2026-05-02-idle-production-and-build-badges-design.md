# Idle Production & Build Badges Design

**Issue:** [#159 — Cities should have an option to just produce X](https://github.com/a1flecke/conquestoria/issues/159)
**Date:** 2026-05-02

## Overview

Two related improvements to city production legibility:

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

## Section 2 — Map Badges

City circles in `src/renderer/city-renderer.ts` gain two new badge positions. All badge drawing happens inside the existing `drawCities` loop, reading `city.idleProduction` and `city.productionQueue` directly from the city object (no change to `CityRenderInfo`).

### Top-left badge — idle production mode

Position: `screen.x - size * 0.45, screen.y - size * 0.45`

| `city.idleProduction` | Badge |
|---|---|
| `'gold'` | 💰 |
| `'science'` | 🔬 |
| `null` / `undefined` | (none) |

### Bottom-right badge — currently building

Position: `screen.x + size * 0.45, screen.y + size * 0.45`

Drawn only when `city.productionQueue.length > 0`. Looks up `PRODUCTION_ICONS[city.productionQueue[0]]`, falling back to `🏗️` for any unrecognised ID.

### Existing top-right badge

Unchanged: breakaway ⛓/👑, occupation ☹/⚡, unrest 🔥/⚡.

---

## Section 3 — Production Icon Map

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
| `forge` | ⚒️ | Metalworking |
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
| `intelligence-agency` | 🕵️ | Counter-intelligence |
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

Fallback for any ID not in the map: `🏗️`

### City panel build list

Each item in the available buildings list and units list in `city-panel.ts` prepends the icon from `PRODUCTION_ICONS` before the item name. The icon also appears in the current-production block and the queue follow-up list.

---

## Section 4 — Tests

### City panel — idle selector

| Test | Description |
|---|---|
| Selector visible, queue empty | Existing — unchanged |
| Selector visible, queue non-empty | Replaces "not shown when queue non-empty" assertion |
| Gold button click | Existing — unchanged |
| Science button click | New |
| None button click | New |

### City panel — build list icons

- Assert that the rendered HTML for the build list contains the icon for at least one building and one unit.

### Renderer — production badge helper

Extract a pure function `getProductionBadgeIcon(city: City): string | null` from the render loop. Returns the icon string when queue is non-empty, `null` when empty.

| Test | Assertion |
|---|---|
| Queue non-empty, known ID | Returns correct emoji |
| Queue non-empty, unknown ID | Returns `'🏗️'` fallback |
| Queue empty | Returns `null` |

### Regression — icon coverage

Two regression tests in `tests/systems/city-system.test.ts`:

```
every key in BUILDINGS has an entry in PRODUCTION_ICONS
every type in TRAINABLE_UNITS has an entry in PRODUCTION_ICONS
```

These fail immediately when a new building or unit is added without a corresponding icon, making the omission impossible to miss.

---

## Out of Scope

- **Culture as idle production option** — requires adding a `culture` field to `Civilization`, HUD wiring, and turn-manager plumbing. Tracked separately.
- **AI usage of idle production** — AI does not yet set `idleProduction`. Can be added in a follow-up alongside AI build-queue improvements.
