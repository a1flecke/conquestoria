# Legendary Beasts MR5 — Sea Serpent + Dune Wurm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1–MR4 merged**.

**Goal:** Add the Sea Serpent (deep-ocean tier 3 — finally makes the ocean dangerous; only naval or ranged units can fight it) and the Dune Wurm (desert tier 2 burrower reusing MR3's concealment), plus the serpent-body animation rig.

**Architecture:** Two generalizations of MR1's beast movement: (1) passability becomes definition-driven (`domain: 'naval'` beasts move on water, land beasts on land) and (2) a `navalOnly` flag gates who may attack the serpent. The wurm is pure content — `concealedInHabitat` already does burrowing. New `beast-serpent` CSS animation kind (segmented undulation) lands in `sprite-animations-v2.css`.

**Tech Stack:** TypeScript, vitest, JSX→SVG sprites, CSS keyframe animation.

**Dependencies:** MR1–MR4 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `BeastId` += `'sea_serpent' \| 'dune_wurm'`; `UnitType` += `'beast_sea_serpent' \| 'beast_wurm'` |
| `src/systems/beast-definitions.ts` | Modify | Two definitions; `navalOnly?: boolean` field |
| `src/systems/beast-system.ts` | Modify | Definition-driven passability; `canUnitAttackBeast` |
| `src/systems/unit-system.ts` | Modify | Definitions (`domain: 'naval'` for serpent) + descriptions |
| `src/systems/attack-targeting.ts` | Modify | `navalOnly` gating |
| `src/main.ts` | Modify | navalOnly gating on the tap-attack path with player-facing warning |
| `src/renderer/sprites/beasts.tsx` | Modify | `SeaSerpentSprite`, `DuneWurmSprite` (`data-kind="beast-serpent"`) |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Register both |
| `src/renderer/unit-visual-resolver.ts` | Modify | Icons |
| `src/audio/sfx-catalog.ts` | Modify | Locomotion classes |
| `src/assets/sprite-animations-v2.css` | Modify | `beast-serpent` undulation keyframes |
| `docs/sprite-design-system.md` | Modify | Document the new animation kind |
| `tests/systems/beast-system.test.ts` | Modify | Passability + navalOnly tests |

## Misleading-UI risks

- If a land melee unit taps the serpent, the game must show a clear warning ("Only ships and ranged units can fight the Sea Serpent") — NOT silently ignore the tap, and NOT show a combat preview that then refuses. The gate must run **before** the preview.
- The serpent must never beach itself: a passability regression test proves naval beasts never receive move orders onto land, and land beasts never onto water.
- The wurm's Unknown bestiary hint must not literally say "desert" (MR2 privacy test pattern).

---

### Task 1: Types + definitions

**Files:**
- Modify: `src/core/types.ts`, `src/systems/beast-definitions.ts`, `src/systems/unit-system.ts`, `src/renderer/unit-visual-resolver.ts`, `src/renderer/sprites/sprite-catalog.ts` (motion only), `src/audio/sfx-catalog.ts`

- [ ] **Step 1: Unions in `src/core/types.ts`**

```typescript
export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk' | 'sea_serpent' | 'dune_wurm';
```

`UnitType` beast tail becomes:

```typescript
  | 'beast_boar' | 'beast_wolf' | 'beast_basilisk' | 'beast_sea_serpent' | 'beast_wurm';
```

- [ ] **Step 2: `BeastDefinition` field + entries (`src/systems/beast-definitions.ts`)**

New optional field:

```typescript
  navalOnly?: boolean;     // only naval-domain or ranged units may attack this beast
```

Entries:

```typescript
  sea_serpent: {
    id: 'sea_serpent',
    unitType: 'beast_sea_serpent',
    name: 'Sea Serpent',
    habitatTerrains: ['ocean'],
    awakenEra: 3,
    tier: 3,
    leashRadius: 5,
    packSize: 1,
    hoardGoldBase: 150,
    navalOnly: true,
    dangerHint: 'Ships vanish on the deep crossing. Sailors whisper of coils vast as harbor walls.',
    awakeningFlavor: 'The deep water churns. Captains report a vast shadow beneath the waves.',
    sightingFlavor: 'The Sea Serpent breaches — coils glinting above the waves!',
  },
  dune_wurm: {
    id: 'dune_wurm',
    unitType: 'beast_wurm',
    name: 'Dune Wurm',
    habitatTerrains: ['desert'],
    awakenEra: 2,
    tier: 2,
    leashRadius: 3,
    packSize: 1,
    hoardGoldBase: 80,
    concealedInHabitat: true,
    dangerHint: 'Caravans tell of dunes that ripple and shift where no wind blows.',
    awakeningFlavor: 'The sands tremble. Something colossal moves beneath the dunes.',
    sightingFlavor: 'The Dune Wurm erupts from the sand in a storm of grit and teeth!',
  },
```

- [ ] **Step 3: Unit definitions + descriptions (`src/systems/unit-system.ts`)**

```typescript
  beast_sea_serpent: {
    type: 'beast_sea_serpent', name: 'Sea Serpent', movementPoints: 3,
    visionRange: 3, strength: 38, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0, domain: 'naval',
  },
  beast_wurm: {
    type: 'beast_wurm', name: 'Dune Wurm', movementPoints: 2,
    visionRange: 2, strength: 30, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
  },
```

```typescript
  beast_sea_serpent: 'A serpent of the deep ocean. It drags ships under within its hunting waters — only ships and ranged units can fight it.',
  beast_wurm: 'The Dune Wurm swims beneath the sand, invisible until you stand beside it. Bring ranged units and overwhelming force.',
```

- [ ] **Step 4: Icons / motion / locomotion**

`FALLBACK_ICONS`: `beast_sea_serpent: '🐉',` `beast_wurm: '🪱',`
`UNIT_MOTION_STYLES`: `beast_sea_serpent: 'naval',` `beast_wurm: 'animal',`
`LOCOMOTION_CLASS`: serpent → the class ships use (check what `galley` uses); wurm → the hound class.

- [ ] **Step 5: Build (only `UNIT_SPRITE_CATALOG` should still error), commit**

```bash
git add src/core/types.ts src/systems/beast-definitions.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
git commit -m "feat(beasts): sea serpent and dune wurm definitions"
```

---

### Task 2: Definition-driven passability (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing tests (append)**

```typescript
import { isTerrainPassableForBeast } from '@/systems/beast-system';

describe('beast passability', () => {
  it('naval beasts move only on water; land beasts only on land', () => {
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'ocean')).toBe(true);
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'coast')).toBe(true);
    expect(isTerrainPassableForBeast('beast_sea_serpent', 'grassland')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'ocean')).toBe(false);
    expect(isTerrainPassableForBeast('beast_boar', 'forest')).toBe(true);
    expect(isTerrainPassableForBeast('beast_boar', 'mountain')).toBe(false);
  });

  it('serpent move orders never target land (no beaching)', () => {
    const map = tinyMap({
      '10,10': 'ocean', '11,10': 'ocean', '12,10': 'grassland',
      '9,10': 'ocean', '10,9': 'ocean', '10,11': 'coast', '11,9': 'grassland', '9,11': 'ocean',
    });
    const lair = makeLair({ id: 'lair-sea_serpent', beastId: 'sea_serpent', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['serp-1'] });
    const serpent = makeUnit({ id: 'serp-1', type: 'beast_sea_serpent', owner: 'beasts', position: { q: 10, r: 10 } });
    const ship = makeUnit({ id: 'ship-1', type: 'galley', position: { q: 12, r: 10 } });   // unreachable by water here
    const result = processBeasts([lair], map, [ship], [serpent], 3, 'wild', 7);
    for (const order of result.moveOrders) {
      const terrain = map.tiles[`${order.toCoord.q},${order.toCoord.r}`].terrain;
      expect(['ocean', 'coast']).toContain(terrain);
    }
  });
});
```

(`tinyMap` is MR3's test helper in the same file.)

- [ ] **Step 2: Run to verify failure, then implement**

In `src/systems/beast-system.ts`, replace the hardcoded `IMPASSABLE_FOR_BEASTS` usage:

```typescript
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

const IMPASSABLE_FOR_LAND_BEASTS = new Set(['ocean', 'coast', 'mountain']);
const WATER_TERRAINS = new Set(['ocean', 'coast']);

export function isTerrainPassableForBeast(unitType: UnitType, terrain: string): boolean {
  const domain = UNIT_DEFINITIONS[unitType]?.domain;
  if (domain === 'naval') return WATER_TERRAINS.has(terrain);
  return !IMPASSABLE_FOR_LAND_BEASTS.has(terrain);
}
```

Update the two places in `processBeasts` that consult passability (the awakening spawn-tile filter and the move-step filter) to call `isTerrainPassableForBeast(def.unitType, tile.terrain)`. Note: the spawn-tile loop currently checks `IMPASSABLE_FOR_BEASTS` — the serpent's lair tile is ocean, so the lair-tile spawn check must also use the definition-driven predicate (otherwise the serpent can never spawn). Check import direction: `unit-system.ts` must not import `beast-system.ts` back (it doesn't today — verify with `grep -n "beast" src/systems/unit-system.ts`).

- [ ] **Step 3: Run all beast tests, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS — including MR1's tests (the boar's behavior is unchanged by the refactor).

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): definition-driven beast passability (naval serpent)"
```

---

### Task 3: navalOnly attack gating (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`, `src/systems/attack-targeting.ts`, `src/main.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing tests (append)**

```typescript
import { canUnitAttackBeast } from '@/systems/beast-system';

describe('canUnitAttackBeast', () => {
  const serpent = makeUnit({ id: 's', type: 'beast_sea_serpent', owner: 'beasts' });
  const boar = makeUnit({ id: 'b', type: 'beast_boar', owner: 'beasts' });

  it('land melee cannot attack a navalOnly beast', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), serpent).allowed).toBe(false);
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), serpent).reason).toContain('ships and ranged');
  });

  it('naval and ranged units can attack a navalOnly beast', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'galley' }), serpent).allowed).toBe(true);
    expect(canUnitAttackBeast(makeUnit({ type: 'archer' }), serpent).allowed).toBe(true);
  });

  it('everything can attack normal beasts and non-beasts', () => {
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), boar).allowed).toBe(true);
    expect(canUnitAttackBeast(makeUnit({ type: 'warrior' }), makeUnit({ type: 'warrior', owner: 'ai-1' })).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
export interface BeastAttackEligibility { allowed: boolean; reason?: string }

/** Movement-validation rule pattern: return a structured reason so UI/AI callers can show it. */
export function canUnitAttackBeast(attacker: Unit, target: Unit): BeastAttackEligibility {
  const def = getBeastDefinitionByUnitType(target.type);
  if (!def?.navalOnly || target.owner !== BEAST_OWNER) return { allowed: true };
  const attackerDef = UNIT_DEFINITIONS[attacker.type];
  const isNaval = attackerDef.domain === 'naval';
  const isRanged = attackerDef.attackProfile?.kind === 'ranged';
  if (isNaval || isRanged) return { allowed: true };
  return { allowed: false, reason: `Only ships and ranged units can fight the ${def.name}.` };
}
```

Wire into `src/systems/attack-targeting.ts` target enumeration (alongside MR3's concealment exclusion):

```typescript
if (!canUnitAttackBeast(attacker, candidate).allowed) continue;
```

Wire into `src/main.ts` tap-attack path BEFORE any combat preview is built: when the gate fails, show the `reason` through the same player-facing warning channel movement failures use (find it: `grep -n "warning" src/main.ts | head` — the movement-safety warning path), and do not open the preview.

- [ ] **Step 3: Run, build, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts && bash scripts/run-with-mise.sh yarn build`
Expected: tests PASS; build fails only on missing sprites (Task 4).

```bash
git add src/systems/beast-system.ts src/systems/attack-targeting.ts src/main.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): navalOnly attack gating with player-facing reason"
```

---

### Task 4: Serpent animation rig + sprites

**Files:**
- Modify: `src/assets/sprite-animations-v2.css`
- Modify: `src/renderer/sprites/beasts.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `docs/sprite-design-system.md`

- [ ] **Step 1: Add the `beast-serpent` rig to `src/assets/sprite-animations-v2.css`**

Read the existing `[data-kind="hound"]` blocks first and match their structure (state selectors, `--phase` usage). Add:

```css
/* === beast-serpent: segmented undulation === */
@keyframes cq-serpent-undulate {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
[data-kind="beast-serpent"] .cq-segment-1 { animation: cq-serpent-undulate 2.4s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -2.4s); }
[data-kind="beast-serpent"] .cq-segment-2 { animation: cq-serpent-undulate 2.4s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -2.4s - 0.3s); }
[data-kind="beast-serpent"] .cq-segment-3 { animation: cq-serpent-undulate 2.4s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -2.4s - 0.6s); }
[data-kind="beast-serpent"] .cq-segment-4 { animation: cq-serpent-undulate 2.4s ease-in-out infinite; animation-delay: calc(var(--phase, 0) * -2.4s - 0.9s); }
```

If the file scopes animations under `data-state` (e.g. only `idle`/`walk` animate), mirror that scoping exactly as the hound rig does.

- [ ] **Step 2: Add sprites to `src/renderer/sprites/beasts.tsx`**

```tsx
const SERPENT = {
  scale: '#2e6e8c',
  scaleDark: '#1c4a61',
  fin: '#5ec0d8',
  eye: '#ffd34d',
};

export function SeaSerpentSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="beast-serpent" className="cq-sprite-figure">
        {/* three coils breaking the water, phase-offset segments */}
        <g className="cq-segment-1">
          <path d="M28,84 Q36,62 48,84" fill="none" stroke={SERPENT.scale} strokeWidth="11" strokeLinecap="round" />
        </g>
        <g className="cq-segment-2">
          <path d="M52,84 Q62,58 74,84" fill="none" stroke={SERPENT.scale} strokeWidth="13" strokeLinecap="round" />
          <path d="M58,68 L62,58 L66,68" fill={SERPENT.fin} />
        </g>
        <g className="cq-segment-3">
          <path d="M78,84 Q88,64 98,82" fill="none" stroke={SERPENT.scale} strokeWidth="11" strokeLinecap="round" />
        </g>
        {/* head rearing */}
        <g className="cq-segment-4">
          <path d="M98,82 Q108,70 104,56 Q102,46 92,48" fill="none" stroke={SERPENT.scale} strokeWidth="10" strokeLinecap="round" />
          <ellipse cx="91" cy="49" rx="9" ry="7" fill={SERPENT.scale} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M83,50 L76,52 L83,55 Z" fill={SERPENT.scaleDark} />
          <circle cx="89" cy="47" r="2.4" fill={SERPENT.eye} />
          <path d="M92,42 L95,34 L98,43" fill={SERPENT.fin} />
        </g>
        {/* waterline froth */}
        <path d="M24,86 Q40,82 56,86 Q72,90 88,86 Q100,83 108,86" fill="none" stroke="#bfe6f2" strokeWidth="2" opacity="0.7" />
      </g>
    </SpriteFrame>
  );
}

const WURM = {
  hide: '#b08a52',
  hideDark: '#84653a',
  maw: '#5e2f2a',
  tooth: '#e8e0cc',
};

export function DuneWurmSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g data-kind="beast-serpent" className="cq-sprite-figure">
        {/* erupting body arc */}
        <g className="cq-segment-1">
          <path d="M40,92 Q44,60 64,52 Q84,46 92,66 Q96,78 90,92" fill="none" stroke={WURM.hide} strokeWidth="16" strokeLinecap="round" />
          <path d="M46,80 q6,-2 10,2 M54,66 q6,-2 10,2 M70,54 q6,-2 10,2" fill="none" stroke={WURM.hideDark} strokeWidth="2" />
        </g>
        {/* tri-split maw */}
        <g className="cq-segment-2">
          <path d="M58,50 L50,34 L64,44 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M64,44 L66,28 L74,44 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M74,44 L86,34 L78,50 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M58,46 l3,-4 M66,40 l2,-5 M76,46 l3,-4" stroke={WURM.tooth} strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* sand spray */}
        <path d="M34,92 q4,-8 0,-14 M104,92 q-4,-8 0,-14 M44,94 q2,-5 -1,-9" fill="none" stroke="#dcc88e" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </g>
    </SpriteFrame>
  );
}
```

- [ ] **Step 3: Register in `UNIT_SPRITE_CATALOG`**

```typescript
import { GiantBoarSprite, DireWolfSprite, EmeraldBasiliskSprite, SeaSerpentSprite, DuneWurmSprite } from './beasts';
// ...
  beast_sea_serpent: SeaSerpentSprite,
  beast_wurm: DuneWurmSprite,
```

- [ ] **Step 4: Document the new kind in `docs/sprite-design-system.md`**

In the "Body-plan kinds" table add:

```markdown
| `beast-serpent` | beast_sea_serpent, beast_wurm | phase-offset segment undulation (`cq-segment-1..4`) |
```

Also add the two sprites to the unit inventory table with `data-kind` `beast-serpent`.

- [ ] **Step 5: Build + sprite tests + commit**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS.

```bash
git add src/assets/sprite-animations-v2.css src/renderer/sprites/beasts.tsx src/renderer/sprites/sprite-catalog.ts docs/sprite-design-system.md
git commit -m "feat(beasts): serpent animation rig, sea serpent and dune wurm sprites"
```

---

### Task 5: Final verification + PR

- [ ] **Step 1: Gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.

- [ ] **Step 2: Manual**

`yarn dev` → Wild game on a large/continents map → sail toward the serpent lair: serpent attacks ships in its waters; a land warrior tapping it from shore gets the warning, an archer gets a combat preview. Wurm: invisible on desert until adjacent.

- [ ] **Step 3: PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR5 — sea serpent + dune wurm" --body "$(cat <<'EOF'
## Summary
- Sea Serpent: tier-3 deep-ocean beast; naval passability is now definition-driven; only ships/ranged units may engage (with player-facing warning, gated before the combat preview)
- Dune Wurm: tier-2 desert burrower riding the MR3 concealment mechanic
- New `beast-serpent` animation rig (phase-offset segment undulation), documented in the sprite design system

## Why this is safe to merge partial
Both beasts complete end-to-end. Remaining: MR6 (roc + hydra), MR7 (dragon), MR8 (audio/AI/balance) — see docs/superpowers/plans/2026-06-11-legendary-beasts-index.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Serpent can spawn on its ocean lair tile (spawn check uses definition-driven passability)
- [ ] No-beaching regression passes; boar tests unchanged
- [ ] navalOnly gate runs BEFORE the combat preview on the tap path and shows a reason
- [ ] AI also respects the gate (it goes through attack-targeting — verify with `grep -n "attack-targeting\|canAttack" src/ai/basic-ai.ts`)
- [ ] New animation kind documented; CSS scoped exactly like the hound rig
