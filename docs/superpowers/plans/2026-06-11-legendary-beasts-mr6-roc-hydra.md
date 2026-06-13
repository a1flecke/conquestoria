# Legendary Beasts MR6 — Storm Roc + Swamp Hydra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1–MR5 merged**.

**Goal:** Add the Storm Roc (mountain tier 3, flies over any land terrain) and the Swamp Hydra (swamp tier 3, regenerates 10 HP/turn — punishes hit-and-run, rewards committed assaults), plus the `beast-winged` animation rig. Also ships v2 DOM sprites for all four MR5+MR6 beasts (sea serpent and dune wurm sprites were deferred from MR5).

**Architecture:** Two final definition flags: `flying` (passability: any land terrain including mountains) extends MR5's definition-driven passability, and `regenPerTurn` adds a `regenOrders` output to `processBeasts` (orders-out pattern — turn-manager applies the healing). Combat preview must surface the hydra's regeneration so players understand why chip damage fails (combat-preview visibility rule).

**Tech Stack:** TypeScript, vitest, JSX→SVG sprites, CSS keyframes, Claude Design (v2 sprite generation).

**Dependencies:** MR1–MR5 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/sprites/v2/beast_sea_serpent.svg.ts` | Create | v2 DOM sprite for Sea Serpent (Task 0) |
| `src/renderer/sprites/v2/beast_wurm.svg.ts` | Create | v2 DOM sprite for Dune Wurm (Task 0) |
| `src/renderer/sprites/v2/beast_roc.svg.ts` | Create | v2 DOM sprite for Storm Roc (Task 0) |
| `src/renderer/sprites/v2/beast_hydra.svg.ts` | Create | v2 DOM sprite for Swamp Hydra (Task 0) |
| `src/renderer/sprites/v2/index.ts` | Modify | Wire all four new beast sprites (Task 0) |
| `src/core/types.ts` | Modify | `BeastId` += `'storm_roc' \| 'swamp_hydra'`; `UnitType` += `'beast_roc' \| 'beast_hydra'` |
| `src/systems/beast-definitions.ts` | Modify | Two definitions; `flying?: boolean`, `regenPerTurn?: number` |
| `src/systems/beast-system.ts` | Modify | Flying passability; `regenOrders` in `BeastProcessResult` |
| `src/core/turn-manager.ts` | Modify | Apply regen orders |
| `src/systems/unit-system.ts` | Modify | Definitions + descriptions |
| `src/main.ts` | Modify | Combat preview shows "Regenerates" trait line for hydra |
| `src/renderer/sprites/beasts.tsx` | Modify | `StormRocSprite` (`data-kind="beast-winged"`), `SwampHydraSprite` (`data-kind="beast-serpent"`) |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Register both |
| `src/renderer/unit-visual-resolver.ts` | Modify | Icons |
| `src/audio/sfx-catalog.ts` | Modify | Locomotion classes |
| `src/assets/sprite-animations-v2.css` | Modify | `beast-winged` wing-flap + hover keyframes |
| `docs/sprite-design-system.md` | Modify | Document `beast-winged` |
| `tests/systems/beast-system.test.ts` | Modify | Flying + regen tests |

## Misleading-UI risks

- **Hydra regen must be visible before you commit**: the combat preview against a hydra must include a trait line ("Regenerates 10 HP every turn"). Without it the player can't understand why their two-turn plan fails — that's a lying preview.
- The roc flying over mountains must not imply player units can follow — no pathing change for players.

---

### Task 0: v2 sprite generation (Claude Design) — four beasts

**Why first:** The v2 sprites replace the JSX placeholder sprites shipped in Task 4. Generate them before starting so they're ready to drop in during Task 4's wire-up step. Sea Serpent and Dune Wurm are deferred from MR5; Storm Roc and Swamp Hydra are new in this MR.

**Files:**
- Create: `src/renderer/sprites/v2/beast_sea_serpent.svg.ts`, `beast_wurm.svg.ts`, `beast_roc.svg.ts`, `beast_hydra.svg.ts`
- Modify: `src/renderer/sprites/v2/index.ts`

**Before generating:**
Read `src/renderer/sprites/v2/beast_boar.svg.ts` and `beast_wolf.svg.ts` to internalize the v2 format (`.cq-sprite-wrap.cq-v2` wrapper, `data-state`, `data-kind`, `data-damage`, `--phase` CSS var, `cq-wound-1/2/3` battle damage groups).

---

#### Task 0a: Sea Serpent

- [ ] **Step 1:** Invoke the `generate-sprite-prompt` project skill (`.claude/skills/generate-sprite-prompt.md`) for `beast_sea_serpent`. Pass this visual brief:
  - **data-kind:** `beast-serpent`
  - **Silhouette:** Three coils rising above a dark waterline; a single rearing head with a crest fin and amber slit eye; no legs
  - **Palette:** Deep teal-blue body (`#2e6e8c`), darker scale undersides (`#1c4a61`), cyan fin accent (`#5ec0d8`), amber eye (`#ffd34d`)
  - **Signature elements:** Segment undulation classes `cq-segment-1` through `cq-segment-4` (each a coil or the head group); a `cq-waterline` froth strip at the base
  - **Damage tiers:** wound-1 = scuff marks on mid-coil; wound-2 = a torn fin + blood beads; wound-3 = a cracked scale patch on the neck with exposed flesh
  - **States required:** idle (gentle bob), walk (fast undulation), attack (head lunges forward), hurt (recoil shudder)
  - **Style ref:** `beast_wolf.svg.ts` body proportions; no legs, no fur — scale texture only

- [ ] **Step 2:** Paste the generated prompt into Claude Design. Save the returned HTML string to `src/renderer/sprites/v2/beast_sea_serpent.svg.ts`:

```typescript
// Animations driven by sprite-animations-v2.css via data-state / data-kind / data-damage.
export const svg = {
  beast: `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="beast-serpent" data-damage="0" style="--phase:0">…</div>`,
};
```

---

#### Task 0b: Dune Wurm

- [ ] **Step 1:** Invoke `generate-sprite-prompt` for `beast_wurm`. Visual brief:
  - **data-kind:** `beast-serpent`
  - **Silhouette:** A thick armored body erupting from the ground at an arc; a tri-split maw (three jaw-plates fanning open) at the top; ringed segmented hide; no eyes (senses vibration)
  - **Palette:** Sandy brown hide (`#b08a52`), dark-brown underplates (`#84653a`), deep red maw interior (`#5e2f2a`), ivory teeth (`#e8e0cc`)
  - **Signature elements:** `cq-segment-1` (erupting body arc), `cq-segment-2` (maw plates — open on attack, closed on idle); scattered sand spray elements at the base
  - **Damage tiers:** wound-1 = sand-caked slash on the flank; wound-2 = a cracked ring segment with ooze; wound-3 = a partially crushed jaw plate
  - **States required:** idle (slow sway), walk (lunge-burrow), attack (maw snaps wide), hurt (whole body shudder)
  - **Style ref:** scale texture like `beast_basilisk.svg.ts`; much thicker body, no legs

- [ ] **Step 2:** Save to `src/renderer/sprites/v2/beast_wurm.svg.ts` with the same export shape as 0a.

---

#### Task 0c: Storm Roc

- [ ] **Step 1:** Invoke `generate-sprite-prompt` for `beast_roc`. Visual brief:
  - **data-kind:** `beast-winged`
  - **Silhouette:** A massive bird of prey seen from a ¾ angle; broad swept wings dominating the frame; compact raptor body; hooked beak; a detached shadow beneath (it's airborne)
  - **Palette:** Steel-blue feathers (`#5a6b8a`), dark wing coverts (`#3c4a63`), golden beak (`#d9a23a`), amber eye, pale-blue lightning accent on wingtips (`#9ed0ff`)
  - **Signature elements:** `cq-wing-l` and `cq-wing-r` (wing groups, flap on `beast-winged` rig); `cq-hover-body` (body + head group, bobs vertically); `cq-shadow-detached` (ground shadow, scaled down and faint); lightning spark streaks along wing edges
  - **Damage tiers:** wound-1 = torn feather gap on one wing; wound-2 = a slash across the breast + blood; wound-3 = a broken primary feather hanging at the wingtip
  - **States required:** idle (slow hover-bob, wings at half-beat), walk/move (full beat, leaning forward), attack (dive stoop — body pitches forward sharply), hurt (stagger in air)
  - **Style ref:** winged rig from `beast-winged` CSS; proportions similar to a peregrine but 3× bigger

- [ ] **Step 2:** Save to `src/renderer/sprites/v2/beast_roc.svg.ts`.

---

#### Task 0d: Swamp Hydra

- [ ] **Step 1:** Invoke `generate-sprite-prompt` for `beast_hydra`. Visual brief:
  - **data-kind:** `beast-serpent`
  - **Silhouette:** A squat, barrel-bodied beast half-submerged in murk; three serpentine necks rising from a shared body, each bearing a flat reptilian head; marsh bubbles and bog-water at the base
  - **Palette:** Dark swamp-green scales (`#4a6b4a`), deeper green underside (`#2f4a2f`), pale lime belly (`#7e9a6a`), yellow-green slit eyes (`#e0d34d`)
  - **Signature elements:** `cq-segment-1/2/3` — one per neck+head group, phase-offset for the weaving undulation; the shared body stays static; bog-bubble `<circle>` elements at water level
  - **Damage tiers:** wound-1 = claw marks on the central neck; wound-2 = a severed neck stump (one of the three heads missing, replaced by a bloody stub — sells the "regen" fantasy); wound-3 = two stubs, only the central head remaining
  - **States required:** idle (three heads weave slowly), walk (body lurches, heads sweep outward), attack (one head lunges toward the target), hurt (heads snap back, bodies ripple)
  - **Style ref:** multi-head spacing like the JSX placeholder; but fully detailed v2 quality

- [ ] **Step 2:** Save to `src/renderer/sprites/v2/beast_hydra.svg.ts`.

---

#### Task 0e: Wire all four into the v2 index

- [ ] **Step 1:** Add imports and entries to `src/renderer/sprites/v2/index.ts`:

```typescript
// MR6 — sea serpent and dune wurm (deferred from MR5), roc and hydra
import { svg as beastSeaSerpentSvg } from './beast_sea_serpent.svg';
import { svg as beastWurmSvg }       from './beast_wurm.svg';
import { svg as beastRocSvg }        from './beast_roc.svg';
import { svg as beastHydraSvg }      from './beast_hydra.svg';
```

```typescript
  beast_sea_serpent: beastSeaSerpentSvg,
  beast_wurm:        beastWurmSvg,
  beast_roc:         beastRocSvg,
  beast_hydra:       beastHydraSvg,
```

- [ ] **Step 2:** Run sprite catalog test to confirm no regressions:

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts
```

- [ ] **Step 3:** Commit:

```bash
git add src/renderer/sprites/v2/
git commit -m "feat(beasts): v2 sprites — sea serpent, dune wurm, storm roc, swamp hydra"
```

---

### Task 1: Types + definitions

**Files:**
- Modify: `src/core/types.ts`, `src/systems/beast-definitions.ts`, `src/systems/unit-system.ts`, `src/renderer/unit-visual-resolver.ts`, `src/renderer/sprites/sprite-catalog.ts` (motion), `src/audio/sfx-catalog.ts`

- [ ] **Step 1: Unions**

```typescript
export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk' | 'sea_serpent' | 'dune_wurm' | 'storm_roc' | 'swamp_hydra';
```

`UnitType` beast tail:

```typescript
  | 'beast_boar' | 'beast_wolf' | 'beast_basilisk' | 'beast_sea_serpent' | 'beast_wurm' | 'beast_roc' | 'beast_hydra';
```

- [ ] **Step 2: Definition fields + entries**

New optional fields on `BeastDefinition`:

```typescript
  flying?: boolean;        // passable on ANY land terrain including mountains
  regenPerTurn?: number;   // HP restored each beast turn
```

Entries:

```typescript
  storm_roc: {
    id: 'storm_roc',
    unitType: 'beast_roc',
    name: 'Storm Roc',
    habitatTerrains: ['mountain'],
    awakenEra: 3,
    tier: 3,
    leashRadius: 4,
    packSize: 1,
    hoardGoldBase: 150,
    flying: true,
    dangerHint: 'Herdsmen swear a shadow the size of a cloud sweeps the high peaks before a storm.',
    awakeningFlavor: 'A scream splits the thunder. Wings vast as sails circle the high peaks.',
    sightingFlavor: 'The Storm Roc wheels overhead — lightning dancing along its wings!',
  },
  swamp_hydra: {
    id: 'swamp_hydra',
    unitType: 'beast_hydra',
    name: 'Swamp Hydra',
    habitatTerrains: ['swamp'],
    awakenEra: 3,
    tier: 3,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 150,
    regenPerTurn: 10,
    dangerHint: 'The marsh-folk say wounds dealt to the thing in the bog are gone by morning.',
    awakeningFlavor: 'The bog exhales. Many heads rise where one fell long ago.',
    sightingFlavor: 'The Swamp Hydra rears from the mire — heads weaving, wounds closing as you watch!',
  },
```

- [ ] **Step 3: Unit definitions + descriptions**

```typescript
  beast_roc: {
    type: 'beast_roc', name: 'Storm Roc', movementPoints: 4,
    visionRange: 3, strength: 34, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_hydra: {
    type: 'beast_hydra', name: 'Swamp Hydra', movementPoints: 1,
    visionRange: 2, strength: 36, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
```

```typescript
  beast_roc: 'The Storm Roc nests on the high peaks and dives on anything that crosses its skies. It flies over terrain that would stop an army.',
  beast_hydra: 'The Swamp Hydra regrows flesh as fast as you can cut it — 10 health every turn. Strike hard and finish it in one assault.',
```

- [ ] **Step 4: Icons / motion / locomotion**

`FALLBACK_ICONS`: `beast_roc: '🦅',` `beast_hydra: '🐍',`
`UNIT_MOTION_STYLES`: both `'animal'`.
`LOCOMOTION_CLASS`: both use the hound class (or, if a flying/silent class exists in the union, use it for the roc — check the `LocomotionClass` type first).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/beast-definitions.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
git commit -m "feat(beasts): storm roc and swamp hydra definitions"
```

---

### Task 2: Flying passability + regen orders (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`, `src/core/turn-manager.ts`
- Test: `tests/systems/beast-system.test.ts`, `tests/core/turn-manager-beasts.test.ts`

- [ ] **Step 1: Write failing tests (append to beast-system tests)**

```typescript
describe('flying and regen', () => {
  it('the roc may move onto mountains; land beasts may not', () => {
    expect(isTerrainPassableForBeast('beast_roc', 'mountain')).toBe(true);
    expect(isTerrainPassableForBeast('beast_roc', 'grassland')).toBe(true);
    expect(isTerrainPassableForBeast('beast_roc', 'ocean')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'mountain')).toBe(false);
  });

  it('processBeasts emits regen orders for wounded hydras only', () => {
    const map = tinyMap({ '10,10': 'swamp', '11,10': 'swamp', '9,10': 'swamp' });
    const lair = makeLair({ id: 'lair-swamp_hydra', beastId: 'swamp_hydra', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['hydra-1'] });
    const wounded = makeUnit({ id: 'hydra-1', type: 'beast_hydra', owner: 'beasts', position: { q: 10, r: 10 }, health: 60 });
    const result = processBeasts([lair], map, [], [wounded], 3, 'wild', 7);
    expect(result.regenOrders).toEqual([{ unitId: 'hydra-1', amount: 10 }]);

    const healthy = { ...wounded, health: 100 };
    const none = processBeasts([lair], map, [], [healthy], 3, 'wild', 7);
    expect(none.regenOrders).toEqual([]);
  });

  it('regen never exceeds 100 (turn-manager clamps)', () => {
    // covered in turn-manager test below; the order carries the raw amount
    const map = tinyMap({ '10,10': 'swamp' });
    const lair = makeLair({ id: 'lair-swamp_hydra', beastId: 'swamp_hydra', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['hydra-1'] });
    const nearly = makeUnit({ id: 'hydra-1', type: 'beast_hydra', owner: 'beasts', position: { q: 10, r: 10 }, health: 95 });
    const result = processBeasts([lair], map, [], [nearly], 3, 'wild', 7);
    expect(result.regenOrders).toEqual([{ unitId: 'hydra-1', amount: 10 }]);
  });
});
```

- [ ] **Step 2: Implement**

In `isTerrainPassableForBeast`, consult the beast definition:

```typescript
export function isTerrainPassableForBeast(unitType: UnitType, terrain: string): boolean {
  const beastDef = getBeastDefinitionByUnitType(unitType);
  if (beastDef?.flying) return !WATER_TERRAINS.has(terrain);
  const domain = UNIT_DEFINITIONS[unitType]?.domain;
  if (domain === 'naval') return WATER_TERRAINS.has(terrain);
  return !IMPASSABLE_FOR_LAND_BEASTS.has(terrain);
}
```

In `BeastProcessResult` add:

```typescript
  regenOrders: Array<{ unitId: string; amount: number }>;
```

In `processBeasts`, before the per-beast movement loop (and in BOTH the `'calm'` early-return and the final return — calm beasts still regenerate):

```typescript
  const regenOrders: Array<{ unitId: string; amount: number }> = [];
  for (const beast of beastUnits) {
    const def = getBeastDefinitionByUnitType(beast.type);
    if (def?.regenPerTurn && beast.health < 100) {
      regenOrders.push({ unitId: beast.id, amount: def.regenPerTurn });
    }
  }
```

Update the `empty` result object and all return statements to include `regenOrders` (the `'off'` early-return keeps `[]`).

In `src/core/turn-manager.ts`, in the beast block after move orders:

```typescript
    for (const regen of beastResult.regenOrders) {
      const beast = newState.units[regen.unitId];
      if (beast) beast.health = Math.min(100, beast.health + regen.amount);
    }
```

- [ ] **Step 3: Turn-manager clamp test (append to `tests/core/turn-manager-beasts.test.ts`)**

```typescript
  it('hydra regen is applied and clamped at 100 by processTurn', () => {
    const state = createNewGame('rome', 'beast-turn-seed', 'small', 'Hydra Regen Test');
    state.era = 3;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-swamp_hydra': { id: 'lair-swamp_hydra', beastId: 'swamp_hydra', position: { q: 10, r: 10 }, status: 'awake', strength: 0, unitIds: ['hydra-1'] } },
      sightingsByCiv: {},
    };
    state.units['hydra-1'] = { id: 'hydra-1', type: 'beast_hydra', owner: 'beasts', position: { q: 10, r: 10 }, movementPointsLeft: 1, health: 95, experience: 0, hasMoved: false, hasActed: false, isResting: false } as any;
    const next = processTurn(state, new EventBus());
    expect(next.units['hydra-1'].health).toBe(100);
  });
```

(If the chosen seed's tile at 10,10 is water, pick coordinates on land — check with the map or relocate the lair/unit to a land tile found by scanning `next.map.tiles`.)

- [ ] **Step 4: Run, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts tests/core/turn-manager-beasts.test.ts`
Expected: PASS.

```bash
git add src/systems/beast-system.ts src/core/turn-manager.ts tests/
git commit -m "feat(beasts): roc flight passability and hydra regeneration"
```

---

### Task 3: Combat preview trait line

**Files:**
- Modify: `src/main.ts` (or the combat-preview module if previews are built elsewhere — find with `grep -rn "combat preview\|attackPreview\|preview" src/ui/ src/main.ts | head`)

- [ ] **Step 1: Add the trait line**

Where the combat preview panel composes the defender's info (it already shows `UNIT_DESCRIPTIONS`), append a highlighted trait line when the defender is a beast with special mechanics:

```typescript
import { getBeastDefinitionByUnitType } from '@/systems/beast-definitions';
// when building the preview for defender:
const beastDef = getBeastDefinitionByUnitType(defender.type);
if (beastDef?.regenPerTurn) {
  // add a line styled like existing bonus/penalty lines:
  // `⚠ Regenerates ${beastDef.regenPerTurn} HP every turn`
}
if (beastDef?.navalOnly) {
  // `⚠ Only ships and ranged units can fight it`
}
```

Use `textContent` for the line; mirror the styling of existing preview detail rows.

- [ ] **Step 2: Manual check + commit**

`yarn dev` → preview an attack on a hydra → the regen line shows.

```bash
git add src/main.ts src/ui
git commit -m "feat(beasts): combat preview surfaces beast traits"
```

---

### Task 4: Winged rig + sprites

**Files:**
- Modify: `src/assets/sprite-animations-v2.css`, `src/renderer/sprites/beasts.tsx`, `src/renderer/sprites/sprite-catalog.ts`, `docs/sprite-design-system.md`

- [ ] **Step 1: `beast-winged` CSS (match the hound rig's state scoping, as in MR5)**

```css
/* === beast-winged: wing flap + hover bob === */
@keyframes cq-wing-flap-l {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-18deg); }
}
@keyframes cq-wing-flap-r {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(18deg); }
}
@keyframes cq-hover-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
[data-kind="beast-winged"] .cq-wing-l { transform-origin: 64px 60px; animation: cq-wing-flap-l 1.1s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -1.1s); }
[data-kind="beast-winged"] .cq-wing-r { transform-origin: 64px 60px; animation: cq-wing-flap-r 1.1s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -1.1s); }
[data-kind="beast-winged"] .cq-hover-body { animation: cq-hover-bob 2.2s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -2.2s); }
[data-kind="beast-winged"] .cq-shadow-detached { transform: scale(0.7); opacity: 0.5; }
```

- [ ] **Step 2: Sprites**

```tsx
const ROC = {
  feather: '#5a6b8a',
  featherDark: '#3c4a63',
  beak: '#d9a23a',
  spark: '#9ed0ff',
};

export function StormRocSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g className="cq-shadow-detached"><Shadow /></g>
      <g data-kind="beast-winged" className="cq-sprite-figure">
        <g className="cq-hover-body">
          <g className="cq-wing-l">
            <path d="M58,60 Q34,40 16,48 Q30,56 34,64 Q44,62 58,66 Z" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M22,48 l6,4 M30,46 l5,5 M38,48 l4,5" stroke={ROC.featherDark} strokeWidth="1.5" />
          </g>
          <g className="cq-wing-r">
            <path d="M70,60 Q94,40 112,48 Q98,56 94,64 Q84,62 70,66 Z" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M106,48 l-6,4 M98,46 l-5,5 M90,48 l-4,5" stroke={ROC.featherDark} strokeWidth="1.5" />
          </g>
          {/* body, tail, head */}
          <ellipse cx="64" cy="64" rx="12" ry="16" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M60,78 L56,92 L64,84 L72,92 L68,78 Z" fill={ROC.featherDark} />
          <circle cx="64" cy="48" r="8" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M64,50 L72,54 L64,57 Z" fill={ROC.beak} />
          <circle cx="61" cy="47" r="1.8" fill="#ffd34d" />
          {/* storm sparks */}
          <path d="M40,42 l-3,6 4,-1 -3,6 M90,40 l-3,6 4,-1 -3,6" fill="none" stroke={ROC.spark} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </g>
    </SpriteFrame>
  );
}

const HYDRA = {
  scale: '#4a6b4a',
  scaleDark: '#2f4a2f',
  belly: '#7e9a6a',
  eye: '#e0d34d',
};

export function SwampHydraSprite({ svgOnly = false }: UnitSpriteProps): string {
  const head = (cx: number, cy: number, flip: number) => (
    <g>
      <ellipse cx={cx} cy={cy} rx="7" ry="6" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.2" />
      <path d={`M${cx + 6 * flip},${cy} L${cx + 12 * flip},${cy + 2} L${cx + 6 * flip},${cy + 4} Z`} fill={HYDRA.scaleDark} />
      <circle cx={cx + 2 * flip} cy={cy - 2} r="1.6" fill={HYDRA.eye} />
    </g>
  );
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="beast-serpent" className="cq-sprite-figure">
        {/* squat body in the mire */}
        <ellipse cx="64" cy="80" rx="26" ry="14" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <ellipse cx="64" cy="86" rx="20" ry="7" fill={HYDRA.belly} opacity="0.6" />
        {/* three weaving necks + heads, phase-offset */}
        <g className="cq-segment-1">
          <path d="M52,72 Q40,56 44,44" fill="none" stroke={HYDRA.scale} strokeWidth="7" strokeLinecap="round" />
          {head(44, 42, -1)}
        </g>
        <g className="cq-segment-2">
          <path d="M64,70 Q64,52 64,40" fill="none" stroke={HYDRA.scale} strokeWidth="8" strokeLinecap="round" />
          {head(64, 37, 1)}
        </g>
        <g className="cq-segment-3">
          <path d="M76,72 Q88,56 84,44" fill="none" stroke={HYDRA.scale} strokeWidth="7" strokeLinecap="round" />
          {head(84, 42, 1)}
        </g>
        {/* marsh bubbles */}
        <circle cx="40" cy="92" r="2" fill="#9ec79e" opacity="0.6" />
        <circle cx="90" cy="90" r="1.5" fill="#9ec79e" opacity="0.6" />
      </g>
    </SpriteFrame>
  );
}
```

If JSX helpers-as-functions (the `head` lambda) don't fit the project's JSX-to-string pipeline, inline the three head groups literally — check how existing sprites compose repeated elements first.

- [ ] **Step 3: Register**

```typescript
  beast_roc: StormRocSprite,
  beast_hydra: SwampHydraSprite,
```

- [ ] **Step 4: Document `beast-winged` in `docs/sprite-design-system.md`** (body-plan kinds table + unit inventory rows for both sprites).

- [ ] **Step 5: Build + sprite tests + commit**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS.

```bash
git add src/assets/sprite-animations-v2.css src/renderer/sprites/beasts.tsx src/renderer/sprites/sprite-catalog.ts docs/sprite-design-system.md
git commit -m "feat(beasts): winged rig, storm roc and swamp hydra sprites"
```

---

### Task 5: Final verification + PR

- [ ] **Step 1: Gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.

- [ ] **Step 2: PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR6 — storm roc + swamp hydra" --body "$(cat <<'EOF'
## Summary
- Storm Roc: tier-3 mountain beast that flies over any land terrain (definition-driven `flying` flag)
- Swamp Hydra: tier-3 swamp beast regenerating 10 HP/turn via new `regenOrders` in the beast turn pipeline; regen is clamped at 100 and surfaced in the combat preview so players understand the fight
- New `beast-winged` animation rig (wing flap + hover bob + detached shadow), documented

## Why this is safe to merge partial
Both beasts complete end-to-end. Remaining: MR7 (Ancient Dragon apex), MR8 (audio/AI/balance) — see docs/superpowers/plans/2026-06-11-legendary-beasts-index.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Roc never receives water move orders; boar/serpent passability unchanged (all prior tests green)
- [ ] Hydra regens in calm mode too (calm early-return includes regenOrders)
- [ ] Regen clamped at 100 in turn-manager (test)
- [ ] Combat preview shows regen + navalOnly trait lines via `textContent`
- [ ] Both new types in all six exhaustive maps
