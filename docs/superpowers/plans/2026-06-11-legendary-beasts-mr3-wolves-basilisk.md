# Legendary Beasts MR3 — Dire Wolf Pack + Emerald Basilisk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1 + MR2 merged**.

**Goal:** Add two beasts — the Dire Wolf Pack (tundra/snow, spawns as 3 wolves) and the Emerald Basilisk (jungle, concealed in its habitat until you stand next to it) — plus the shared habitat-concealment mechanic.

**Architecture:** Pack spawning is already generic in MR1 (`packSize` spawns N units on lair + free neighbors). The new mechanic is **habitat concealment**: a `concealedInHabitat` flag on `BeastDefinition`, one shared predicate `isBeastConcealedFrom`, wired into (a) renderer unit filtering, (b) attack targeting. This is the same shape as the existing `isForestConcealedUnit` in `src/systems/fog-of-war.ts:199` — read that function and its call sites first; the wiring must be parallel.

**Tech Stack:** TypeScript, vitest, JSX→SVG sprites.

**Dependencies:** MR1 + MR2 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `BeastId` += `'dire_wolf' \| 'emerald_basilisk'`; `UnitType` += `'beast_wolf' \| 'beast_basilisk'` |
| `src/systems/beast-definitions.ts` | Modify | Two new definitions; `concealedInHabitat?: boolean` field |
| `src/systems/beast-system.ts` | Modify | `isBeastConcealedFrom` predicate |
| `src/systems/unit-system.ts` | Modify | Definitions + descriptions (2 new types) |
| `src/systems/attack-targeting.ts` | Modify | Concealed beasts are not valid targets |
| `src/renderer/unit-visual-resolver.ts` | Modify | Fallback icons |
| `src/renderer/sprites/beasts.tsx` | Modify | `DireWolfSprite`, `EmeraldBasiliskSprite` |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Register both (motion + catalog) |
| `src/renderer/render-loop.ts` | Modify | Filter concealed beasts out of `visibleUnits` |
| `src/audio/sfx-catalog.ts` | Modify | `LOCOMOTION_CLASS` entries |
| `tests/systems/beast-system.test.ts` | Modify | Pack-spawn + concealment tests |

## Misleading-UI risks

- A concealed basilisk must be **completely absent** from the player's view: not rendered, not tappable, not a combat-preview target — but it can still attack you (ambush!). Partial hiding (hidden sprite, still attackable) would be a lie in the other direction.
- Negative test required: basilisk on jungle with a viewer unit 2 tiles away → concealed. Same position, viewer adjacent → revealed.
- A basilisk standing OFF its habitat terrain (chasing within leash) is always visible.
- Bestiary "Unknown" hints for these two must not name the habitat directly (privacy test from MR2 covers the rendered panel; keep the hint text evocative, not literal).

---

### Task 1: Type + definition extensions

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/beast-definitions.ts`

- [ ] **Step 1: Extend the unions in `src/core/types.ts`**

```typescript
export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk';
```

`UnitType` union — replace the MR1 tail line with:

```typescript
  | 'beast_boar' | 'beast_wolf' | 'beast_basilisk';
```

- [ ] **Step 2: Compile to enumerate forced updates**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: FAIL in `BEAST_DEFINITIONS` plus the six exhaustive `Record<UnitType, …>` maps (`UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`, `FALLBACK_ICONS`, `UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`, `LOCOMOTION_CLASS`). Tasks 1–3 fix all of them.

- [ ] **Step 3: Add the definitions (`src/systems/beast-definitions.ts`)**

Add the optional field to `BeastDefinition`:

```typescript
  concealedInHabitat?: boolean;     // hidden on habitat terrain unless a viewer unit is adjacent
```

Add the entries:

```typescript
  dire_wolf: {
    id: 'dire_wolf',
    unitType: 'beast_wolf',
    name: 'Dire Wolf Pack',
    habitatTerrains: ['tundra', 'snow'],
    awakenEra: 1,
    tier: 1,
    leashRadius: 4,
    packSize: 3,
    hoardGoldBase: 50,
    dangerHint: 'Howls echo across the frozen wastes at night. They hunt as one.',
    awakeningFlavor: 'Howls rise from the frozen north. The Dire Wolves are hunting!',
    sightingFlavor: 'Your scouts spot the Dire Wolf Pack prowling the snows!',
  },
  emerald_basilisk: {
    id: 'emerald_basilisk',
    unitType: 'beast_basilisk',
    name: 'Emerald Basilisk',
    habitatTerrains: ['jungle'],
    awakenEra: 2,
    tier: 2,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 80,
    concealedInHabitat: true,
    dangerHint: 'Expeditions vanish in the green depths. Survivors speak of unblinking emerald eyes.',
    awakeningFlavor: 'Something ancient stirs beneath the canopy. Travelers, beware the green depths.',
    sightingFlavor: 'The Emerald Basilisk reveals itself — eyes like cold gems in the gloom!',
  },
```

- [ ] **Step 4: Unit definitions + descriptions (`src/systems/unit-system.ts`)**

`UNIT_DEFINITIONS`:

```typescript
  beast_wolf: {
    type: 'beast_wolf', name: 'Dire Wolf', movementPoints: 3,
    visionRange: 2, strength: 12, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
  beast_basilisk: {
    type: 'beast_basilisk', name: 'Emerald Basilisk', movementPoints: 2,
    visionRange: 2, strength: 26, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
```

`UNIT_DESCRIPTIONS`:

```typescript
  beast_wolf: 'One of the Dire Wolf Pack. Fast, relentless, and never alone — defeat the whole pack to claim their hoard.',
  beast_basilisk: 'The Emerald Basilisk lies hidden in the jungle until prey wanders close. Approach with overwhelming force.',
```

- [ ] **Step 5: Icons, motion, locomotion**

`src/renderer/unit-visual-resolver.ts` `FALLBACK_ICONS`:

```typescript
  beast_wolf: '🐺',
  beast_basilisk: '🦎',
```

`src/renderer/sprites/sprite-catalog.ts` `UNIT_MOTION_STYLES`:

```typescript
  beast_wolf: 'animal',
  beast_basilisk: 'animal',
```

(Catalog entries land in Task 3 with the sprites.)

`src/audio/sfx-catalog.ts` `LOCOMOTION_CLASS`: same class the hounds use, for both types.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/beast-definitions.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
git commit -m "feat(beasts): dire wolf and emerald basilisk definitions"
```

---

### Task 2: Concealment mechanic (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Modify: `src/systems/attack-targeting.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing tests (append to `tests/systems/beast-system.test.ts`)**

```typescript
import { isBeastConcealedFrom } from '@/systems/beast-system';

// Module-scope helper: build a tiny map by hand so terrain is fully controlled.
// IMPORTANT: define this at the top level of the test file (next to makeLair/makeUnit),
// NOT inside a describe block — MR5/MR6/MR7 tests reuse it from other describes.
function tinyMap(terrainAt: Record<string, string>) {
    const tiles: Record<string, any> = {};
    for (const [key, terrain] of Object.entries(terrainAt)) {
      const [q, r] = key.split(',').map(Number);
      tiles[key] = { coord: { q, r }, terrain, elevation: 'flat', resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
    }
  return { width: 40, height: 30, tiles, wrapsHorizontally: false } as any;
}

describe('isBeastConcealedFrom', () => {
  const jungleMap = tinyMap({ '5,5': 'jungle', '6,5': 'grassland', '7,5': 'grassland' });
  const basilisk = makeUnit({ id: 'beast-bas', type: 'beast_basilisk', owner: 'beasts', position: { q: 5, r: 5 } });

  it('conceals a basilisk on jungle when no viewer unit is adjacent', () => {
    const farViewer = makeUnit({ id: 'v1', position: { q: 7, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [farViewer])).toBe(true);
  });

  it('reveals a basilisk when a viewer unit is adjacent', () => {
    const nearViewer = makeUnit({ id: 'v1', position: { q: 6, r: 5 } });
    expect(isBeastConcealedFrom(basilisk, jungleMap, [nearViewer])).toBe(false);
  });

  it('never conceals a basilisk off its habitat terrain', () => {
    const offHabitat = { ...basilisk, position: { q: 6, r: 5 } };
    expect(isBeastConcealedFrom(offHabitat, jungleMap, [])).toBe(false);
  });

  it('never conceals non-stealth beasts (boar) or non-beasts', () => {
    const boar = makeUnit({ id: 'beast-boar', type: 'beast_boar', owner: 'beasts', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(boar, jungleMap, [])).toBe(false);
    const warrior = makeUnit({ id: 'w1', position: { q: 5, r: 5 } });
    expect(isBeastConcealedFrom(warrior, jungleMap, [])).toBe(false);
  });
});
```

(`makeUnit` is the MR1 test helper in the same file.)

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts -t "isBeastConcealedFrom"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement (append to `src/systems/beast-system.ts`)**

```typescript
/**
 * Habitat concealment: a beast with concealedInHabitat is invisible to a viewer civ
 * while it stands on its habitat terrain and none of that civ's units are adjacent.
 * Mirrors isForestConcealedUnit (fog-of-war.ts) — keep the two consistent if either changes.
 */
export function isBeastConcealedFrom(
  beast: Unit,
  map: GameMap,
  viewerUnits: Array<Pick<Unit, 'position'>>,
): boolean {
  if (beast.owner !== BEAST_OWNER) return false;
  const def = getBeastDefinitionByUnitType(beast.type);
  if (!def?.concealedInHabitat) return false;
  const tile = map.tiles[hexKey(beast.position)];
  if (!tile || !def.habitatTerrains.includes(tile.terrain)) return false;
  return !viewerUnits.some(v => hexDistance(v.position, beast.position) === 1);
}
```

- [ ] **Step 4: Run to verify pass, then commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS.

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): habitat concealment predicate"
```

- [ ] **Step 5: Wire into rendering and targeting**

Renderer — `src/renderer/render-loop.ts` builds `visibleUnits` before `drawUnits` (line ~378). Find how `isForestConcealedUnit` is applied there (`grep -n "isForestConcealedUnit" src/renderer/render-loop.ts src/main.ts`) and apply `isBeastConcealedFrom(unit, this.state.map, viewerUnitsOfCurrentPlayer)` in the same filter, where `viewerUnitsOfCurrentPlayer` is the current viewer civ's units (the forest-concealment call already has this list in scope — reuse it).

Targeting — in `src/systems/attack-targeting.ts`, where candidate targets are enumerated (read the file; find where target validity is computed against fog/visibility), exclude concealed beasts from the attacker's owner's perspective:

```typescript
import { isBeastConcealedFrom } from '@/systems/beast-system';
// inside target filtering, with attackerOwnerUnits available:
if (isBeastConcealedFrom(candidate, map, attackerOwnerUnits)) continue;
```

If `attack-targeting.ts` does not have the attacker's full unit list in scope, follow how `isForestConcealedUnit` gets its viewer list at ITS call sites and replicate. Also check `src/main.ts` tap-target resolution (the `isBarbarian` branches around lines 2337/2433) — if tap-to-attack resolves targets there rather than via attack-targeting, apply the same exclusion there.

- [ ] **Step 6: Build + full tests, commit**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: exit 0 (sprites still pending — if build fails ONLY on `UNIT_SPRITE_CATALOG` missing entries, proceed to Task 3 and run this gate after).

```bash
git add src/renderer/render-loop.ts src/systems/attack-targeting.ts src/main.ts
git commit -m "feat(beasts): concealment wired into rendering and targeting"
```

---

### Task 3: Sprites

**Files:**
- Modify: `src/renderer/sprites/beasts.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

Both reuse the `hound` rig (`data-kind="hound"`, `cq-leg-l/r`), like the MR1 boar. Match the boar's frame skeleton exactly (SpriteFrame/Shadow/HexBase order).

- [ ] **Step 1: Add `DireWolfSprite` to `src/renderer/sprites/beasts.tsx`**

```tsx
const WOLF = {
  fur: '#7d8a99',
  furDark: '#55606e',
  belly: '#aab4c0',
  eye: '#d8b13a',
};

export function DireWolfSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="hound" className="cq-sprite-figure">
        <rect className="cq-leg-l" x="48" y="86" width="6" height="14" rx="3" fill={WOLF.furDark} />
        <rect className="cq-leg-r" x="58" y="86" width="6" height="14" rx="3" fill={WOLF.fur} />
        <rect className="cq-leg-l" x="74" y="86" width="6" height="14" rx="3" fill={WOLF.furDark} />
        <rect className="cq-leg-r" x="82" y="86" width="6" height="14" rx="3" fill={WOLF.fur} />
        {/* lean body, low head, raised hackles */}
        <path d="M44,80 Q42,64 58,62 Q76,58 88,66 L96,60 Q104,58 106,64 Q108,70 100,73 L92,76 Q90,84 76,86 Q56,90 44,80 Z"
          fill={WOLF.fur} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M56,64 Q66,58 80,62" fill="none" stroke={WOLF.furDark} strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="66" cy="82" rx="18" ry="6" fill={WOLF.belly} opacity="0.5" />
        {/* muzzle, fangs, ear, eye, tail */}
        <path d="M104,66 L112,68 L105,71 Z" fill={WOLF.furDark} />
        <path d="M104,70 l2,3 M107,70 l2,3" stroke="#e8e0cc" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M94,58 L97,50 L101,58 Z" fill={WOLF.furDark} />
        <circle cx="98" cy="63" r="2.2" fill={WOLF.eye} />
        <path d="M44,78 Q34,74 33,64" fill="none" stroke={WOLF.fur} strokeWidth="4" strokeLinecap="round" />
      </g>
    </SpriteFrame>
  );
}
```

- [ ] **Step 2: Add `EmeraldBasiliskSprite`**

```tsx
const BASILISK = {
  scale: '#2f7d4f',
  scaleDark: '#1d5535',
  frill: '#46b878',
  eye: '#9aedc0',
};

export function EmeraldBasiliskSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="hound" className="cq-sprite-figure">
        {/* low splayed legs */}
        <rect className="cq-leg-l" x="46" y="88" width="7" height="11" rx="3" fill={BASILISK.scaleDark} />
        <rect className="cq-leg-r" x="60" y="88" width="7" height="11" rx="3" fill={BASILISK.scale} />
        <rect className="cq-leg-l" x="78" y="88" width="7" height="11" rx="3" fill={BASILISK.scaleDark} />
        <rect className="cq-leg-r" x="90" y="88" width="7" height="11" rx="3" fill={BASILISK.scale} />
        {/* long low body + curling tail */}
        <path d="M36,84 Q30,72 42,70 Q40,60 52,62 Q50,52 64,56 Q78,52 86,62 Q100,60 104,70 Q112,74 108,82 Q104,90 88,90 L52,90 Q40,92 36,84 Z"
          fill={BASILISK.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M36,84 Q22,86 20,76 Q19,68 28,68" fill="none" stroke={BASILISK.scale} strokeWidth="5" strokeLinecap="round" />
        {/* dorsal frill */}
        <path d="M48,64 L52,54 L58,62 L64,50 L70,60 L78,52 L84,62" fill={BASILISK.frill} stroke={BASILISK.scaleDark} strokeWidth="1" />
        {/* head with unblinking gem eye */}
        <ellipse cx="104" cy="74" rx="11" ry="8" fill={BASILISK.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M113,73 L120,75 L113,78 Z" fill={BASILISK.scaleDark} />
        <circle cx="106" cy="71" r="3" fill={BASILISK.eye} />
        <circle cx="106" cy="71" r="1.2" fill={P.ink.line} />
        {/* scale texture */}
        <path d="M52,74 q4,-3 8,0 M62,70 q4,-3 8,0 M72,74 q4,-3 8,0" fill="none" stroke={BASILISK.scaleDark} strokeWidth="1" />
      </g>
    </SpriteFrame>
  );
}
```

- [ ] **Step 3: Register both in `UNIT_SPRITE_CATALOG`**

```typescript
import { GiantBoarSprite, DireWolfSprite, EmeraldBasiliskSprite } from './beasts';
// in UNIT_SPRITE_CATALOG:
  beast_wolf: DireWolfSprite,
  beast_basilisk: EmeraldBasiliskSprite,
```

- [ ] **Step 4: Verify + commit**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS.

```bash
git add src/renderer/sprites/beasts.tsx src/renderer/sprites/sprite-catalog.ts
git commit -m "feat(beasts): dire wolf and basilisk sprites"
```

---

### Task 4: Pack-spawn regression

**Files:**
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write the test (append)**

```typescript
describe('pack spawning', () => {
  it('spawns up to packSize wolves on awakening, never stacking', () => {
    const map = generateMap(40, 30, 'beast-test-seed');
    // Force a tundra lair position by scanning the generated map for tundra
    const tundraTile = Object.values(map.tiles).find(t => t.terrain === 'tundra');
    if (!tundraTile) return; // seed has no tundra — placement would skip the wolf anyway
    const lair = makeLair({ id: 'lair-dire_wolf', beastId: 'dire_wolf', position: tundraTile.coord });
    // Awaken deterministically: scan seeds until one awakens
    for (let seed = 1; seed <= 60; seed++) {
      const result = processBeasts([lair], map, [], [], 1, 'wild', seed);
      if (result.awakenings.length === 0) continue;
      expect(result.spawnOrders.length).toBeGreaterThanOrEqual(1);
      expect(result.spawnOrders.length).toBeLessThanOrEqual(3);
      const keys = result.spawnOrders.map(o => `${o.position.q},${o.position.r}`);
      expect(new Set(keys).size).toBe(keys.length);   // no two spawns share a tile
      return;
    }
    throw new Error('no seed awakened the wolf lair in 60 tries');
  });
});
```

- [ ] **Step 2: Run**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS (MR1's spawn logic already handles packs). If spawn count exceeds packSize or stacks, fix `processBeasts` — the bug is real.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/beast-system.test.ts
git commit -m "test(beasts): pack spawn occupancy regression"
```

---

### Task 5: Final verification + PR

- [ ] **Step 1: Gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.

- [ ] **Step 2: Manual ambush check**

`yarn dev` → Wild game on a map with jungle → move a unit toward a basilisk lair: the basilisk must be invisible until adjacent, then appear; combat preview shows its description warning. Wolves: confirm 2–3 wolves spawn and chase within leash, return to lair when you retreat ≥5 tiles.

- [ ] **Step 3: PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR3 — dire wolf pack + emerald basilisk" --body "$(cat <<'EOF'
## Summary
- Dire Wolf Pack: era-1 tundra/snow beast, spawns as a pack of 3 (occupancy-safe)
- Emerald Basilisk: era-2 jungle ambusher with the new habitat-concealment mechanic (hidden until adjacent), wired into rendering AND attack targeting
- Both fully end-to-end: definitions, sprites, icons, audio class, bestiary entries

## Out of scope (see docs/superpowers/plans/2026-06-11-legendary-beasts-index.md)
- Hoard choice rewards (MR4) — basilisk tier-2 hoard currently pays the MR1 gold reward; MR4 upgrades it to a choice
- Remaining beasts (MR5–MR7), audio/AI/balance (MR8)

## Why this is safe to merge partial
Both beasts are complete playable content. The tier-2 basilisk paying flat gold (instead of MR4's choice panel) is a smaller reward, not a dead end.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Both new `UnitType`s present in all six exhaustive maps (build passes)
- [ ] Concealment excluded from BOTH rendering and targeting — and beasts can still attack while concealed (ambush preserved)
- [ ] Negative tests: off-habitat basilisk visible; adjacent viewer reveals; boar never concealed
- [ ] Pack spawns never stack (occupancy regression)
- [ ] Bestiary panel from MR2 renders three entry kinds without code changes (presentation is definition-driven)
