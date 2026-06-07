# Structured Tech Unlocks Design

**Date:** 2026-06-07
**Status:** Approved

## Problem

The `Tech.unlocks` field is a free-text `string[]` used to both drive the tech panel display and
document what a tech enables. Because it is manually maintained and disconnected from the actual
`techRequired` field on `TRAINABLE_UNITS` and `BUILDINGS`, it drifts silently:

- `galleys` lists `['Galley']` but also gates `transport` — Transport is invisible in the tech tree
- `navigation` lists `['Navigator']` — no Navigator unit exists
- `caravels` lists `['Caravel']` — no Caravel unit exists
- `naval-warfare` lists `['Warship']` — no Warship unit exists

A player researching the tech tree has no way to discover that Transport, Carrack, Galleon, and
Steamship exist, because they are never surfaced as unlocks. The mismatch is caught by no test.

## Goal

1. Make unit and building unlocks machine-readable so they can never silently drift from the actual
   gameplay gating.
2. Fix all four transport-ship display gaps and remove three ghost unit strings.
3. Add a closed test loop: gated → declared, declared → gated.
4. Add a rule that prevents the same class of bug when new units/buildings are added.

## Non-goals

- Implementing the missing Caravel and Warship units (deferred).
- Changing gameplay gating logic — `techRequired` on `TRAINABLE_UNITS` and `BUILDINGS` is correct
  and untouched.

---

## Design

### 1. Type change — `src/core/types.ts`

Add two optional fields to the `Tech` interface:

```ts
export interface Tech {
  // ... existing fields unchanged ...
  unlocksUnits?: UnitType[];      // trainable unit types gated by this tech
  unlocksBuildings?: string[];    // building IDs (keys of BUILDINGS) gated by this tech
}
```

`unlocksBuildings` is `string[]` rather than a named `BuildingId` type because no such type exists
and introducing one would require importing `BUILDINGS` (from `city-system.ts`) into `types.ts`,
creating a circular dependency. The test enforces correctness instead.

Both fields are optional — techs with no unit or building unlocks need no change.

### 2. `unlocks` becomes effect-text only

`unlocks: string[]` is retained for narrative effect text: resource reveals, combat bonuses, civic
unlocks, etc. All unit names and building names are **removed** from `unlocks` strings and moved
exclusively to the structured fields. This eliminates display duplication.

The three ghost strings are removed and not replaced in the structured fields (no such units exist):
- `navigation.unlocks` — remove `'Navigator'`
- `caravels.unlocks` — remove `'Caravel'`
- `naval-warfare.unlocks` — remove `'Warship'`

### 3. Data migration — `src/systems/tech-definitions.ts`

Every tech that gates a trainable unit or building gets `unlocksUnits`/`unlocksBuildings` populated.
The unit/building name strings are simultaneously removed from `unlocks`.

**Units (22 techs):**

| Tech | `unlocksUnits` |
|------|----------------|
| `archery` | `['archer']` |
| `stone-weapons` | `['axeman']` |
| `bronze-working` | `['spearman', 'swordsman']` |
| `fortification` | `['pikeman']` |
| `horseback-riding` | `['horseman', 'cavalry']` |
| `iron-forging` | `['knight']` |
| `tactics` | `['musketeer', 'crossbowman']` |
| `siege-warfare` | `['catapult', 'ballista']` |
| `galleys` | `['galley', 'transport']` |
| `navigation` | `['carrack']` |
| `triremes` | `['trireme', 'galleon']` |
| `caravels` | `['steamship']` |
| `amphibious-warfare` | `['troop_transport']` |
| `lookouts` | `['scout_hound']` *(civ-specific replacements excluded — see §5)* |
| `espionage-scouting` | `['spy_scout']` |
| `espionage-informants` | `['spy_informant']` |
| `spy-networks` | `['spy_agent']` |
| `cryptography` | `['spy_operative']` |
| `cyber-warfare` | `['spy_hacker']` |
| `trade-routes` | `['caravan']` |
| `foraging` | `['expedition']` |

`naval-warfare` gets no `unlocksUnits` — no trainable unit has `techRequired: 'naval-warfare'`.

**Buildings (~20 techs):** Every building in `BUILDINGS` with a `techRequired` field gets its ID
added to that tech's `unlocksBuildings`. This includes all standard buildings (library, archive,
marketplace, harbor, dock, walls, stable, temple, monument, forum, amphitheater, etc.) and all
espionage buildings. Full enumeration is derived mechanically from `BUILDINGS` at implementation
time and enforced by the completeness test.

### 4. Tech panel — `src/ui/tech-panel.ts`

Add a pure helper:

```ts
function getUnlockLines(tech: Tech): string[] {
  const lines = [...tech.unlocks];
  for (const ut of tech.unlocksUnits ?? []) {
    const def = UNIT_DEFINITIONS[ut];
    if (def) lines.push(def.name);
  }
  for (const bid of tech.unlocksBuildings ?? []) {
    const b = BUILDINGS[bid];
    if (b) lines.push(b.name);
  }
  return lines;
}

function getFirstUnlockHint(tech: Tech): string {
  return getUnlockLines(tech)[0] ?? 'New options for your empire';
}
```

Replace all four render sites:
- **Line 87** (HUD subtitle): `getFirstUnlockHint(currentTech)`
- **Line 93** (advisor text): `getFirstUnlockHint(currentTech)`
- **Line 213** (tree node tooltip): `getFirstUnlockHint(node.tech)`
- **Line 258** (inspector panel): `getUnlockLines(selectedNode.tech).join(', ') || 'New options...'`

No cargo-capacity annotation in the display — that information is already in the unit description
shown when the unit is selected in the build queue.

### 5. Civ-specific unit replacements

Units with `civTypeRequired` set (`shadow_warden`, `war_hound`) replace `scout_hound` for specific
civs. They are excluded from the `unlocksUnits` completeness test: their display is handled by
the civ-definition system, not the tech panel. `lookouts.unlocksUnits` contains `['scout_hound']`
as the canonical representative.

### 6. Tests — `tests/systems/tech-unlocks-consistency.test.ts`

Four new tests added; two existing tests retained unchanged:

**Existing (retained as-is) — string-pattern validity:**

The existing `"Unlock <Name> unit"` and `"Unlock <Name> building"` pattern tests stay. After
migration those patterns will no longer appear in `unlocks` strings, so they pass vacuously — but
they remain as guardrails that catch anyone re-introducing the old string style.

**New — structured validity (declared → gated):**

- *`unlocksUnits` validity*: Every entry in `tech.unlocksUnits` must be a `UnitType` that has
  `techRequired === tech.id` in `TRAINABLE_UNITS`.
- *`unlocksBuildings` validity*: Every entry in `tech.unlocksBuildings` must be a building ID in
  `BUILDINGS` with `techRequired === tech.id`.

**New — completeness (gated → declared):**

- *Unit completeness*: For every entry in `TRAINABLE_UNITS` where `techRequired` is set and
  `civTypeRequired` is NOT set, the corresponding tech in `TECH_TREE` must include the unit's
  `type` in its `unlocksUnits`.
- *Building completeness*: For every entry in `BUILDINGS` where `techRequired` is set, the
  corresponding tech in `TECH_TREE` must include the building's `id` in its `unlocksBuildings`.

Together these four tests form a closed loop. A unit or building cannot be added with a
`techRequired` without the tests failing until the tech's structured arrays are updated.

### 7. Rule — `.claude/rules/end-to-end-wiring.md`

Add under "Trainable units must be wired end-to-end":

> When adding a `TRAINABLE_UNIT` with `techRequired`, add its `type` to that tech's `unlocksUnits`
> in `tech-definitions.ts`. When adding a `BUILDING` with `techRequired`, add its `id` to that
> tech's `unlocksBuildings`. The completeness tests in `tech-unlocks-consistency.test.ts` will fail
> if either is omitted.

---

## File change summary

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `unlocksUnits` and `unlocksBuildings` to `Tech` interface |
| `src/systems/tech-definitions.ts` | Populate structured arrays; remove entity names and ghost strings from `unlocks` |
| `src/ui/tech-panel.ts` | Add `getUnlockLines` + `getFirstUnlockHint`; update 4 render sites |
| `tests/systems/tech-unlocks-consistency.test.ts` | Add 2 completeness tests; update 2 validity tests |
| `.claude/rules/end-to-end-wiring.md` | Add one bullet under trainable-unit wiring checklist |

No other files change. Gameplay logic (`techRequired` gating, `getTrainableUnitsForCity`, AI,
turn-manager) is untouched.
