# Economy, Era Detection & Espionage Fixes Design

**Issues addressed:** #375 (era detection, building upkeep), #376 (disguise scaling)

**Goal:** Fix era advancement stalling, make building upkeep create real economic pressure, scale spy disguises by tier, and surface a civ-wide revenue/P&L view in the HUD.

**Architecture:** All fixes touch existing systems only — no new files needed except `src/ui/treasury-drawer.ts` for the HUD expansion. The economy rebalance changes `getFreeBuildingSlots` in `economy-system.ts`. Era fix changes `checkEraAdvancement` in `minor-civ-system.ts`. Disguise fix changes `selected-unit-info.ts`. Unit upkeep audit is read-only verification + display polish.

---

## 1. Era Detection Fix (`minor-civ-system.ts`)

### Root Cause
`checkEraAdvancement` requires ≥60% of each era's techs to advance, checked one era per turn. A player who follows the prerequisite chain to reach era 4 techs may have only completed 5–8 era 2 techs (well below the 18-of-30 threshold), leaving `state.era` permanently stuck at 1.

Additionally, legacy saves that predate the `era` field store `state.era = undefined`. `undefined + 1 = NaN`, `NaN > undefined = false`, so `state.era` is never updated.

### Fix
Replace the 60%-threshold logic with: **`state.era` = highest era of any `countsForEraAdvancement !== false` tech completed by any civ.** Era 5 techs are all marked `countsForEraAdvancement: false` and must remain excluded — advancing to era 5 would produce `ERA_UNIT_MAP[5] ?? 'warrior'` regressions in minor civ upgrades. Restricting to `countsForEraAdvancement !== false` techs (same flag used by the old threshold check) naturally caps at era 4.

```typescript
// minor-civ-system.ts — add TECH_TREE to existing import from './tech-definitions'
// Change: import { hasReachedEraThreshold } from './tech-definitions';
// To:     import { hasReachedEraThreshold, TECH_TREE } from './tech-definitions';

export function checkEraAdvancement(state: GameState): number {
  let maxEra = state.era ?? 1;
  for (const civ of Object.values(state.civilizations)) {
    for (const techId of civ.techState.completed) {
      const tech = TECH_TREE.find(t => t.id === techId && t.countsForEraAdvancement !== false);
      if (tech && tech.era > maxEra) maxEra = tech.era;
    }
  }
  return maxEra;
}
```

Also add `era ?? 1` normalization to `normalizeLoadedState` in `save-manager.ts` to fix any existing stuck saves on load. Place it inside the spread that already normalizes other defaults on the state object.

**Note on multi-era jump for stuck saves:** When a legacy save loads with `state.era = undefined` and the player already has era 4 techs, the era jumps directly to 4 on the first turn-end. `processMinorCivEraUpgrade` is only called with the final era level, so minor civs get era 4 upgrades only (skipping eras 2 and 3). This is acceptable — the alternative of replaying intermediate upgrades would over-power minor civs in an old save.

### Test contract
- State with `state.era = 1`, one civ having `musketeer` (era 4, `countsForEraAdvancement` not false) → returns 4.
- State with `state.era = undefined`, one civ having an era 2 tech → returns 2.
- State with `state.era = 3`, one civ having an era 5 tech (`global-logistics`, `countsForEraAdvancement: false`) → returns 3 (era 5 excluded).
- No advancement-eligible techs completed → returns 1.
- `normalizeLoadedState` on a save with no `era` field → resulting state has `era: 1`.

---

## 2. Building Upkeep Rebalance (`economy-system.ts`)

### Root Cause
`getFreeBuildingSlots` returns `4 + floor(population/2) + maturityBonus`. Even a starting outpost (pop 1) gets 4 free paid-building slots. Combined with the 7 buildings already exempt via `coreFreeBuildings`, all buildings a player typically owns fit inside the free budget — making upkeep invisible.

### Fix
Remove the base 4 and reduce maturity bonuses so early cities pay immediately and larger cities earn meaningful relief:

```typescript
function getFreeBuildingSlots(city: City): number {
  const maturityBonusByLevel: Record<City['maturity'], number> = {
    outpost:    0,
    village:    0,
    town:       1,
    city:       2,
    metropolis: 3,
  };
  return Math.floor(city.population / 2) + maturityBonusByLevel[city.maturity];
}
```

**Resulting free slots by city size** (illustrative — actual slots depend on realized population at each maturity level):

| Maturity | Example Pop | Free paid slots | Typical feel |
|----------|-------------|-----------------|--------------|
| Outpost  | 1           | 0               | First paid building costs immediately |
| Village  | 2           | 1               | One slot of grace |
| Town     | 4           | 3               | Most early-game paid buildings covered |
| City     | 6           | 5               | Substantial relief for large cities |
| Metropolis | 9         | 7               | High-pop capitals earn broad coverage |

Early players feel the first forge/harbor immediately. Large empires with high-population cities earn natural relief. The `coreFreeBuildings` set (city-center, barracks, granary, library, workshop, shrine, herbalist) remains permanently exempt — basic infrastructure never costs gold.

The city panel already reads upkeep from `calculateCityBuildingMaintenance` and displays `'Upkeep: -X gold/turn'` vs `'Free support'` based on whether `upkeep > 0`. No UI code changes are needed — the display fixes itself once the formula changes.

### Test contract
- Outpost city with pop 1: `getFreeBuildingSlots` returns 0.
- Village with pop 2: returns `1 + 0 = 1`.
- Town with pop 4: returns `2 + 1 = 3`.
- Metropolis with pop 10: returns `5 + 3 = 8`.
- `calculateCityBuildingMaintenance` for an outpost city (pop 1) with a forge (advanced, 2/turn) and 0 free slots → `upkeep = 2`, `paidBuildings` has 1 entry with `upkeep: 2`.
- Regression: same city with granary (coreFreeBuildings member) added → granary in `exemptBuildings`, upkeep unchanged at 2.

---

## 3. Unit Upkeep Audit

### Approach
Read-only verification that unit upkeep is correctly deducted each turn (via `applyEconomyTurn` in `turn-manager.ts`). No number changes — the current formula (`2 + cities×2 + floor(totalPop/3)` free general slots, plus 2 free defenders per city) is appropriate and the user confirmed units feel fine.

### UI fix
The selected-unit info panel currently shows no upkeep line for units. Add a one-line upkeep display below the unit description matching the building row format:

- Units in `freeUnitTypes` (settler, worker, scout): show nothing — these are categorically free and the label would just add noise.
- Units covered by a free slot (exempt defender, or within free general slots): `Free support`
- Paid units: `Upkeep: -1 gold/turn` or `Upkeep: -2 gold/turn` (advanced unit types)

Implementation: call `calculateCivUnitMaintenance(state, unit.owner)` and look up `unit.id` across `exemptUnits`, `freeUnits`, and `paidUnits` arrays to determine the label. `freeUnitTypes` members appear in `exemptUnits` (reason: 'exempt'); show nothing for those. All others in non-`paidUnits` lists show "Free support". `paidUnits` members show the upkeep amount.

### Test contract (unit upkeep display)
- `spy_scout` unit owned by a civ with 0 free unit slots (enough paid units to exhaust them) → upkeep line shows "Upkeep: -2 gold/turn".
- `settler` unit → no upkeep line rendered in the panel.
- `warrior` unit within free defender slots → "Free support" line rendered.

---

## 4. Disguise Scaling by Spy Tier (`selected-unit-info.ts`)

### Root Cause
Disguise options are gated by civ tech IDs. Higher disguises require `spy-networks`, which requires both `espionage-informants` AND `disguise` — the `disguise` tech is a separate era-2 branch (`lookouts` → `disguise`) that is easy to miss. Players who research the main espionage prerequisite chain never see advanced disguise options even with era 4 tech.

### Fix
Replace tech-gating with spy **unit type** gating. Since training a higher spy tier already requires the corresponding tech (you need `espionage-informants` to train `spy_informant`, etc.), the gate is already implicit:

| Spy type | Disguise options |
|----------|-----------------|
| `spy_scout` | None (section hidden) |
| `spy_informant` | As Barbarian, As Warrior |
| `spy_agent` | + As Scout, As Archer |
| `spy_operative`, `spy_hacker` | + As Worker |

The local `DisguiseOption` type definition in `selected-unit-info.ts` changes from `{ label, value, tech?: string }` to `{ label, value, minTier?: number }` — remove the `tech` field, add `minTier`.

```typescript
const SPY_DISGUISE_TIERS: Partial<Record<UnitType, number>> = {
  spy_scout: 0, spy_informant: 1, spy_agent: 2, spy_operative: 3, spy_hacker: 3,
};
const spyTier = SPY_DISGUISE_TIERS[unit.type] ?? 0;  // unit.type is already UnitType — no cast needed

const allDisguises: DisguiseOption[] = [
  { label: 'No Disguise', value: null },
  { label: 'As Barbarian', value: 'barbarian', minTier: 1 },
  { label: 'As Warrior',   value: 'warrior',   minTier: 1 },
  { label: 'As Scout',     value: 'scout',     minTier: 2 },
  { label: 'As Archer',    value: 'archer',    minTier: 2 },
  { label: 'As Worker',    value: 'worker',    minTier: 3 },
];
const disguiseOptions = allDisguises.filter(opt => !opt.minTier || spyTier >= opt.minTier);
// Show section only when disguiseOptions.length > 1 (spy_scout tier=0: only 'No Disguise' → length=1 → hidden)
```

**Data migration:** A `spy_scout` may have `disguiseAs` set from before this fix. The disguise section is hidden in the UI, but the disguise remains active silently. Add to the save-migration chain: for each spy record where the unit type is `spy_scout`, set `disguiseAs: null`. This prevents the unit from operating disguised with no UI affordance to clear it.

### Test contract
- `spy_scout` → disguise section not rendered at all (length check is 1, not > 1).
- `spy_informant` → barbarian + warrior buttons rendered (2 disguise options + "No Disguise" = 3 total).
- `spy_agent` → 4 options + "No Disguise" = 5 total rendered.
- `spy_operative` → all 5 disguise options + "No Disguise" = 6 total rendered.
- `spy_hacker` → same as `spy_operative` (tier 3 = same options).
- Migration: `spy_scout` with `disguiseAs: 'barbarian'` in a loaded save → after `normalizeLoadedState`, `disguiseAs` is `null`.

---

## 5. HUD Treasury Drawer (`src/ui/treasury-drawer.ts`)

### Mobile-first layout constraints

The game targets tablet/phone as primary input. Key constraints from the current shell layout:

- `#hud` is `position:absolute; top:0; left:0; right:0; z-index:10`. Height is approximately 44px (two lines of content at 13px + 8px padding).
- Floating action buttons (`📜 🗺️ ✦ ☰ ⏩`) are at `position:absolute; top:44px; right:X`. Any drawer must co-exist with them.
- Notifications sit at `top:40px; z-index:20`. Drawer needs `z-index:25` to overlay them while open.
- The game canvas handles `pointerdown` for tile selection — a canvas tap must close the drawer.
- No hover/title tooltip available on touch. The existing `goldSpan.title` only works on desktop; the drawer fully replaces it.
- Touch targets must be `min-height:44px` per project rules.
- Safe-area: viewport uses `viewport-fit=cover` and `black-translucent` status bar. The HUD top of 0 already accounts for this via the OS — no additional offset needed in the drawer.

### Design

The gold chip becomes a **tap-to-toggle** button (min-height 44px). Tapping opens an overlay drawer anchored to the top of the screen at the HUD bottom edge (`top:44px`). The drawer spans the **left two-thirds** of the screen, leaving the right third free for the floating buttons. Tapping outside the drawer (canvas or any other area) closes it.

```
┌──────────────────────────────────┐  [📜][🗺️][✦][☰]
│ 💰 450 (+12 net)  [×]            │   ← HUD bar
├──────────────────────────────────┤
│ Revenue       +32/turn           │
│ Buildings      -8/turn           │
│ Units         -12/turn           │
│ Net           +12/turn ████████  │  ← colored bar
│ Treasury      450 gold           │
└──────────────────────────────────┘
      ↑ drawer (left 66%, below HUD, z-index 25)
```

- **Drawer position**: `position:absolute; top:44px; left:0; width:66%; background:rgba(0,0,0,0.85); border-radius:0 0 8px 0; padding:8px 12px; z-index:25; pointer-events:auto`  
  The `pointer-events:auto` is required: without it, taps on the drawer propagate to the canvas beneath, which would close the drawer immediately via the canvas `pointerdown` handler.
- **Row height**: each row `min-height:36px; display:flex; align-items:center; justify-content:space-between; font-size:13px`
- **Net row color**: driven by `strainLevel` (authoritative), not by net sign. `strainLevel` can be non-'none' even when net > 0 if the treasury balance is very low. Mapping:
  - `'none'` → green (`#4ade80`)
  - `'low'` → yellow (`#facc15`)
  - `'high'` → yellow (`#facc15`)
  - `'critical'` → red (`#f87171`)
- **Close button** (×): top-right of drawer, `min-height:44px; min-width:44px; background:rgba(255,255,255,0.1); color:#e0d6c8` — must include `background` and `color` per the no-bare-buttons rule (hook enforces this on all buttons in `src/ui/`).
- **Gold chip button** (in `main.ts` replacing `goldSpan`): must also include `background` and `color` in its inline `style.cssText` to pass the hook. Use `background:transparent; color:inherit` to match the existing HUD text style. Also remove the old `goldSpan.title = formatMaintenanceTooltip(...)` line — the drawer is now the sole breakdown surface.
- **Canvas close**: `main.ts` adds a `pointerdown` listener on `#game-canvas` that calls `if (drawer.isOpen()) drawer.close()`. The listener fires first (registered before tile-selection) so the drawer dismisses without selecting the tile beneath.
- **Panel close**: `drawer.close()` called by `main.ts` at every panel-open call-site (city, espionage, tech, diplomacy, etc.)
- No "link to city panel" from the drawer — prevents accidental navigation on touch

### Implementation

New file `src/ui/treasury-drawer.ts` exports:
```typescript
export function createTreasuryDrawer(): {
  element: HTMLElement;                               // insert into game-shell
  isOpen: () => boolean;
  update(economy: EconomyProjection, currentGold: number): void;
  toggle(): void;
  close(): void;
}
```

In `main.ts`:
1. `createTreasuryDrawer()` is called **before** the first `updateHUD()` call, and the drawer element is appended to the game-shell. This ordering matters — `updateHUD()` calls `drawer.update()` on every invocation.
2. The existing `goldSpan` (plain `<span>`) is replaced by a `<button>` with inline `style.cssText` that includes `background:transparent; color:inherit; border:none; font-size:inherit; padding:0; cursor:pointer; min-height:44px`. Calls `drawer.toggle()` on click.
3. The old `goldSpan.title = formatMaintenanceTooltip(economyStatus)` line is **deleted** — the drawer is the sole breakdown surface.
4. A `pointerdown` handler is registered on `#game-canvas` after the canvas is in the DOM: `canvas.addEventListener('pointerdown', () => { if (drawer.isOpen()) drawer.close(); })`. Must be registered **before** the existing tile-selection `pointerdown` handler so it fires first.
5. Every panel-open call-site (city, espionage, tech, diplomacy, beast, wonder, etc.) calls `drawer.close()` as the first line.

The `updateHUD()` function calls `drawer.update(economyStatus, civ.gold)` so the drawer content stays current without requiring a separate refresh cycle. `update()` must be safe to call while the drawer is hidden — it simply pre-populates the DOM so the content is ready on first open.

### Test contract
- `createTreasuryDrawer()` → `element.style.display` starts as `'none'`; `isOpen()` is false.
- `update(economy, gold)` with known values (grossGoldIncome=32, buildingMaintenance=8, unitMaintenance=12, netGoldPerTurn=12, strainLevel='none') → drawer element text includes "32", "8", "12", "+12".
- `toggle()` once → `isOpen()` true; `toggle()` again → `isOpen()` false.
- `strainLevel: 'critical'` → net value element `style.color` is `#f87171`.
- `strainLevel: 'high'` → net value element `style.color` is `#facc15`.
- `strainLevel: 'none'` → net value element `style.color` is `#4ade80`.
- `close()` when already closed → no error, `isOpen()` returns false.
- Regression: opening the city panel while the drawer is open → drawer `isOpen()` becomes false.
