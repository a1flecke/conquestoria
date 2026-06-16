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
Replace the 60%-threshold logic with: **`state.era` = highest era of any tech completed by any civ.** This is intuitive (the world's technological era reflects the most advanced research done), removes the hidden threshold, and immediately corrects stale state.

```typescript
// minor-civ-system.ts
export function checkEraAdvancement(state: GameState): number {
  let maxEra = state.era ?? 1;
  for (const civ of Object.values(state.civilizations)) {
    for (const techId of civ.techState.completed) {
      const tech = TECH_TREE.find(t => t.id === techId);
      if (tech && tech.era > maxEra) maxEra = tech.era;
    }
  }
  return maxEra;
}
```

Also add `era ?? 1` normalization to `normalizeLoadedState` in `save-manager.ts` to fix any existing stuck saves on load.

### Test contract
- A state with `state.era = 1` and one civ having an era 4 tech → `checkEraAdvancement` returns 4.
- A state with `state.era = undefined` and era 2 techs → returns 2 (not NaN/undefined).
- No techs completed → returns 1.

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

**Resulting free slots by city size:**

| Maturity | Pop | Free paid slots | First paid building costs |
|----------|-----|-----------------|--------------------------|
| Outpost  | 1   | 0               | 1–2 gold/turn immediately |
| Village  | 3   | 1               | 1 building covered        |
| Town     | 5   | 3               | 3 buildings covered       |
| City     | 7   | 5               | 5 buildings covered       |
| Metropolis | 10 | 8             | 8 buildings covered       |

Early players feel the first forge/harbor immediately. Large empires with high-population cities earn natural relief. The `coreFreeBuildings` set (city-center, barracks, granary, library, workshop, shrine, herbalist) remains permanently exempt — basic infrastructure never costs gold.

### Test contract
- Outpost city with pop 1: `getFreeBuildingSlots` returns 0.
- Town with pop 4: returns `2 + 1 = 3`.
- Metropolis with pop 10: returns `5 + 3 = 8`.
- `calculateCityBuildingMaintenance` for a city with forge (2/turn) and 0 free slots → `upkeep = 2`.

---

## 3. Unit Upkeep Audit

### Approach
Read-only verification that unit upkeep is correctly deducted each turn (via `applyEconomyTurn` in `turn-manager.ts`). No number changes — the current formula (`2 + cities×2 + floor(totalPop/3)` free general slots, plus 2 free defenders per city) is appropriate and the user confirmed units feel fine.

### UI fix
The selected-unit info panel currently shows no upkeep line for units. Add a one-line upkeep display below the unit description matching the building row format:

- Free units (settler, worker, scout): show nothing (same as coreFreeBuildings)
- Free via free-support slot: `Free support`
- Paid: `Upkeep: -1 gold/turn` or `Upkeep: -2 gold/turn` (advanced)

This is display-only — call `calculateCivUnitMaintenance` and look up the unit's row.

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

```typescript
const SPY_DISGUISE_TIERS: Partial<Record<UnitType, number>> = {
  spy_scout: 0, spy_informant: 1, spy_agent: 2, spy_operative: 3, spy_hacker: 3,
};
const spyTier = SPY_DISGUISE_TIERS[unit.type as UnitType] ?? 0;

const allDisguises: DisguiseOption[] = [
  { label: 'No Disguise', value: null },
  { label: 'As Barbarian', value: 'barbarian', minTier: 1 },
  { label: 'As Warrior',   value: 'warrior',   minTier: 1 },
  { label: 'As Scout',     value: 'scout',     minTier: 2 },
  { label: 'As Archer',    value: 'archer',    minTier: 2 },
  { label: 'As Worker',    value: 'worker',    minTier: 3 },
];
const disguiseOptions = allDisguises.filter(opt => !opt.minTier || spyTier >= opt.minTier);
// Show section only when disguiseOptions.length > 1 (spy_scout: hidden entirely)
```

### Test contract
- `spy_scout` → no disguise buttons rendered.
- `spy_informant` → barbarian + warrior buttons.
- `spy_agent` → barbarian + warrior + scout + archer.
- `spy_operative` → all 5 options.

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

- **Drawer position**: `position:absolute; top:44px; left:0; width:66%; background:rgba(0,0,0,0.85); border-radius:0 0 8px 0; padding:8px 12px; z-index:25`
- **Row height**: each row `min-height:36px; display:flex; align-items:center; justify-content:space-between; font-size:13px`
- **Net row color**: green (`#4ade80`) when ≥0, yellow (`#facc15`) when strain='low'/'high', red (`#f87171`) when strain='critical'
- **Close button** (×): top-right of drawer, `min-height:44px; min-width:44px` touch target — satisfies the 44px rule
- **Canvas close**: `main.ts` adds a `pointerdown` listener on `#game-canvas` that calls `drawer.close()` when the drawer is open. This fires before tile-selection logic so the drawer dismisses cleanly without also selecting the tile under the finger.
- **Panel close**: `drawer.close()` is called by `main.ts` whenever any other panel opens (city, espionage, etc.)
- No "link to city panel" from the drawer — keeps the drawer simple and prevents accidental navigation on touch

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
1. The existing plain `goldSpan` is replaced by a `<button>` (styled inline, not via `createGameButton` — the HUD chip has its own compact style) that calls `drawer.toggle()`.
2. `drawer.element` is appended to `game-shell` immediately after `#hud`.
3. A `pointerdown` handler on `#game-canvas` calls `drawer.close()` when `drawer.isOpen()`.
4. Every panel-open call-site (city, espionage, tech, etc.) calls `drawer.close()` before opening.

The `updateHUD()` function calls `drawer.update(economyStatus, civ.gold)` so the drawer content stays current without requiring a separate refresh cycle.

### Test contract
- `createTreasuryDrawer().update(economy, gold)` with known values → drawer element contains correct revenue/maintenance/net text nodes.
- `toggle()` → `element.style.display` toggles between `'block'` and `'none'`; `isOpen()` reflects state.
- Strain level `'critical'` → net value element has red color in `style.color`.
- Strain level `'none'` with positive net → net value element has green color.
- `close()` when already closed → no error, `isOpen()` returns false.
