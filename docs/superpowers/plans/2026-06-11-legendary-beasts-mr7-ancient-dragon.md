# Legendary Beasts MR7 — Ancient Dragon (Apex) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1–MR6 merged**.

**Goal:** Ship the endgame boss: the Ancient Dragon (volcanic, era 4, tier 4) with a 2-hex fire-breath ranged attack, an apex reward (ALL THREE hoard rewards at once + the slaying unit becomes a maximum-veterancy legend), and a full-screen slay ceremony for tier ≥ 3 beasts.

**Architecture:** The dragon is pure definition content on top of MR5/MR6 flags (`flying`) plus one new capability that already exists in the engine: `attackProfile: { kind: 'ranged', range: 2 }` on its `UnitDefinition` — `resolveCombat` and counterattack logic already honor `attackProfile` (see `canCounterAttackAtDistance`, `src/systems/combat-system.ts:50`). Beast ranged attacks in `processBeasts` need one generalization: the attack-order trigger distance becomes the beast's attack range instead of hardcoded `1`. The apex reward is a tier-4 branch in `recordBeastSlain`. The slay ceremony follows the wonder-discovery-ceremony pattern.

**Tech Stack:** TypeScript, vitest, JSX→SVG sprites.

**Dependencies:** MR1–MR6 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/core/types.ts` | Modify | `BeastId` += `'ancient_dragon'`; `UnitType` += `'beast_dragon'` |
| `src/systems/beast-definitions.ts` | Modify | Dragon definition |
| `src/systems/beast-system.ts` | Modify | Range-aware attack orders; tier-4 apex reward branch |
| `src/systems/unit-system.ts` | Modify | Dragon definition with `attackProfile` + description |
| `src/ui/beast-slay-ceremony.ts` | Create | Full-screen ceremony for tier ≥ 3 slays |
| `src/main.ts` | Modify | Ceremony trigger; apex notification |
| `src/renderer/sprites/beasts.tsx` | Modify | `AncientDragonSprite` (`beast-winged` rig + ember glow) |
| `src/renderer/sprites/sprite-catalog.ts` | Modify | Register |
| `src/renderer/unit-visual-resolver.ts` | Modify | Icon |
| `src/audio/sfx-catalog.ts` | Modify | Locomotion class |
| `tests/systems/beast-system.test.ts` | Modify | Ranged attack orders + apex reward tests |

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Era reaches 4, dragon lair dormant | (turn processing awakens it) | EVERY civ gets a warning notification with a map target on the lair |
| My unit stands 2 hexes from the dragon, in its territory | (dragon's turn) | Fire breath: my unit takes damage at range — combat log/notification says the Dragon attacked |
| My catapult kills the dragon | (combat resolves) | Full-screen slay ceremony: dragon art, "The Ancient Dragon has fallen", reward summary (gold + lore + trophy), Continue button |
| Ceremony dismissed | Open Bestiary | Dragon entry: Slain, my civ credited |
| Any later turn | Check HUD | Trophy income (+8/turn) included in per-turn gold rate |

## Misleading-UI risks

- The apex reward shows NO choice panel — the ceremony must clearly list everything granted (gold amount, research amount, trophy income), or players will think they missed a choice.
- The dragon's 2-hex breath must appear in the combat preview trait lines (MR6 pattern): "⚠ Fire breath strikes from 2 hexes".
- The slay ceremony fires for tier ≥ 3 (serpent, roc, hydra get it retroactively) — exactly once per slay (transition-owned: triggered by the `beast:slain` event, which fires once from `recordBeastSlain` callers).

---

### Task 1: Types + definitions

**Files:**
- Modify: `src/core/types.ts`, `src/systems/beast-definitions.ts`, `src/systems/unit-system.ts`, `src/renderer/unit-visual-resolver.ts`, `src/renderer/sprites/sprite-catalog.ts` (motion), `src/audio/sfx-catalog.ts`

- [ ] **Step 1: Unions**

```typescript
export type BeastId = 'giant_boar' | 'dire_wolf' | 'emerald_basilisk' | 'sea_serpent' | 'dune_wurm' | 'storm_roc' | 'swamp_hydra' | 'ancient_dragon';
```

`UnitType` beast tail gains `| 'beast_dragon'`.

- [ ] **Step 2: Beast definition**

```typescript
  ancient_dragon: {
    id: 'ancient_dragon',
    unitType: 'beast_dragon',
    name: 'Ancient Dragon',
    habitatTerrains: ['volcanic'],
    awakenEra: 4,
    tier: 4,
    leashRadius: 4,
    packSize: 1,
    hoardGoldBase: 300,
    flying: true,
    dangerHint: 'The mountain that burns has a heartbeat. The oldest maps mark it with a single word: NO.',
    awakeningFlavor: 'The burning mountain splits open. The Ancient Dragon has awoken — and the world holds its breath.',
    sightingFlavor: 'The Ancient Dragon — wings of ember, eyes of molten gold. May fortune favor the bold.',
  },
```

- [ ] **Step 3: Unit definition with ranged breath**

```typescript
  beast_dragon: {
    type: 'beast_dragon', name: 'Ancient Dragon', movementPoints: 3,
    visionRange: 3, strength: 55, canFoundCity: false,
    canBuildImprovements: false, productionCost: 0,
    attackProfile: { kind: 'ranged', range: 2, targets: ['unit'] },
  },
```

(Check `UnitAttackProfile`'s exact shape at `src/core/types.ts:296` and match the `targets` field's real values — copy from the `archer` entry.)

`UNIT_DESCRIPTIONS`:

```typescript
  beast_dragon: 'The Ancient Dragon, terror of the volcanic peaks. Its fire breath strikes from 2 hexes away. Slaying it is the deed of a lifetime — the hoard contains everything.',
```

- [ ] **Step 4: Icon / motion / locomotion**

`FALLBACK_ICONS`: `beast_dragon: '🐲',` · `UNIT_MOTION_STYLES`: `'animal'` · `LOCOMOTION_CLASS`: same as the roc.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/beast-definitions.ts src/systems/unit-system.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
git commit -m "feat(beasts): ancient dragon definitions with ranged breath"
```

---

### Task 2: Range-aware beast attacks (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Write failing tests (append)**

```typescript
describe('dragon ranged attacks', () => {
  it('orders an attack at 2-hex range', () => {
    const map = tinyMap({ '10,10': 'volcanic', '11,10': 'grassland', '12,10': 'grassland' });
    const lair = makeLair({ id: 'lair-ancient_dragon', beastId: 'ancient_dragon', position: { q: 10, r: 10 }, status: 'awake', unitIds: ['drg-1'] });
    const dragon = makeUnit({ id: 'drg-1', type: 'beast_dragon', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 12, r: 10 } });
    const result = processBeasts([lair], map, [intruder], [dragon], 4, 'wild', 7);
    expect(result.attackOrders).toEqual([{ attackerUnitId: 'drg-1', defenderUnitId: 'u1' }]);
  });

  it('melee beasts still require adjacency', () => {
    const map = tinyMap({ '10,10': 'forest', '11,10': 'grassland', '12,10': 'grassland' });
    const lair = makeLair({ status: 'awake', unitIds: ['beast-1'] });
    const boar = makeUnit({ id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 } });
    const intruder = makeUnit({ id: 'u1', position: { q: 12, r: 10 } });
    const result = processBeasts([lair], map, [intruder], [boar], 1, 'wild', 7);
    expect(result.attackOrders).toEqual([]);   // moves toward instead
  });
});
```

- [ ] **Step 2: Implement**

In `processBeasts`'s per-beast loop, replace the hardcoded adjacency check:

```typescript
    const attackRange = UNIT_DEFINITIONS[beast.type].attackProfile?.kind === 'ranged'
      ? UNIT_DEFINITIONS[beast.type].attackProfile!.range
      : 1;
    if (target && hexDistance(target.position, beast.position) <= attackRange) {
      attackOrders.push({ attackerUnitId: beast.id, defenderUnitId: target.id });
      continue;
    }
```

Verify the turn-manager's beast attack-order application uses `resolveCombat` (which already handles ranged profiles and counterattack range via `canCounterAttackAtDistance`) — no turn-manager change should be needed; confirm by reading the block.

- [ ] **Step 3: Run, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS.

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): range-aware beast attack orders"
```

---

### Task 3: Apex reward (TDD)

**Files:**
- Modify: `src/systems/beast-system.ts`
- Test: `tests/systems/beast-system.test.ts`

Apex (tier 4) slays grant **everything**: the gold option's amount, the lore option's research, the trophy auto-claimed, AND the slaying unit's experience raised to the top veterancy tier. No choice panel.

- [ ] **Step 1: Write failing tests (append)**

```typescript
import { VETERANCY_TIERS } from '@/systems/combat-reward-system';

describe('apex reward', () => {
  function stateWithSlainDragon() {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Apex Test');
    state.era = 4;
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-ancient_dragon': makeLair({ id: 'lair-ancient_dragon', beastId: 'ancient_dragon', status: 'awake', unitIds: ['drg-1'] }) },
      sightingsByCiv: {},
    };
    const dragon = makeUnit({ id: 'drg-1', type: 'beast_dragon', owner: 'beasts' });
    const victor = makeUnit({ id: 'hero-1', owner: state.currentPlayer, experience: 0 });
    state.units[dragon.id] = dragon;
    state.units[victor.id] = victor;
    return { state, dragon, victor };
  }

  it('grants gold + trophy claim + max veterancy with NO pending choice', () => {
    const { state, dragon, victor } = stateWithSlainDragon();
    const goldBefore = state.civilizations[victor.owner].gold;
    const { state: next, slain } = recordBeastSlain(state, dragon, victor);
    expect(slain).toBeDefined();
    expect(slain!.goldAwarded).toBeGreaterThan(0);
    expect(next.civilizations[victor.owner].gold).toBe(goldBefore + slain!.goldAwarded);
    expect(next.beasts!.lairs['lair-ancient_dragon'].status).toBe('claimed');
    expect(next.beasts!.lairs['lair-ancient_dragon'].claimedBy).toBe(victor.owner);
    expect(next.beasts!.pendingHoardChoices ?? []).toEqual([]);
    const topTier = VETERANCY_TIERS[VETERANCY_TIERS.length - 1];
    expect(next.units['hero-1'].experience).toBeGreaterThanOrEqual(topTier.minExperience ?? 0);
  });
});
```

Check `VeterancyTier`'s field names (`grep -n "interface VeterancyTier" -A 8 src/systems/combat-reward-system.ts`) — if the threshold field isn't `minExperience`, use the real name in test and code.

- [ ] **Step 2: Implement — tier-4 branch in `recordBeastSlain`**

Where MR4 branches on `def.tier >= 2`, refine:

```typescript
  const isApex = def.tier >= 4;
  const isChoiceTier = def.tier >= 2 && !isApex;
```

The apex amounts are computed inline from `def` and `state.era` using the same formulas as `getHoardChoicePreview` (gold ×2, lore ×1.5) — do not call the preview helper here, the lair record is mid-update. Apex branch after the base slain-lair update:

```typescript
  if (isApex && slayerCiv) {
    const apexGold = getBeastHoardGold(def, state.era) * 2;
    const apexLore = Math.round(getBeastHoardGold(def, state.era) * 1.5);
    next = { ...next, civilizations: { ...next.civilizations, [victor.owner]: { ...next.civilizations[victor.owner], gold: next.civilizations[victor.owner].gold + apexGold } } };
    next = applyBeastLoreResearch(next, victor.owner, apexLore);
    next = {
      ...next,
      beasts: {
        ...next.beasts!,
        lairs: { ...next.beasts!.lairs, [lair.id]: { ...next.beasts!.lairs[lair.id], status: 'claimed', claimedBy: victor.owner } },
      },
    };
    // legendary veterancy for the slayer
    const topTier = VETERANCY_TIERS[VETERANCY_TIERS.length - 1];
    const hero = next.units[victor.id];
    if (hero) {
      next = { ...next, units: { ...next.units, [victor.id]: { ...hero, experience: Math.max(hero.experience, topTier.minExperience ?? 0) } } };
    }
    // goldAwarded in the payload reports the apex gold so notifications/ceremony can show it
  }
```

Set the returned payload's `goldAwarded` to `apexGold` for apex, `0` for choice tiers, tier-1 gold otherwise. Import `VETERANCY_TIERS` from `@/systems/combat-reward-system` (verify no import cycle: combat-reward-system must not import beast-system — check with `grep -n "beast" src/systems/combat-reward-system.ts`).

- [ ] **Step 3: Run all beast + MR4 tests, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts`
Expected: PASS — tier-1, tier-2, and tier-4 paths all green.

```bash
git add src/systems/beast-system.ts tests/systems/beast-system.test.ts
git commit -m "feat(beasts): apex reward — everything at once plus legendary veterancy"
```

---

### Task 4: Slay ceremony (tier ≥ 3)

**Files:**
- Create: `src/ui/beast-slay-ceremony.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement the ceremony (read `src/ui/wonder-discovery-ceremony.ts` and `src/ui/beast-sighting-banner.ts` first; this is the banner pattern, bigger)**

```typescript
import { createGameButton } from '@/ui/ui-kit';
import { UNIT_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import type { UnitType } from '@/core/types';

export interface BeastSlayCeremonyOptions {
  beastName: string;
  unitType: UnitType;
  slayerName: string;
  rewardLines: string[];     // pre-formatted: ['+600 gold', '+450 research', 'Beast Trophy: +8 gold/turn', 'Your hero is now Legendary']
  onContinue: () => void;
}

export function showBeastSlayCeremony(container: HTMLElement, options: BeastSlayCeremonyOptions): HTMLElement {
  container.querySelector('#beast-slay-ceremony')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'beast-slay-ceremony';
  overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,8,18,0.95);z-index:60;display:flex;align-items:center;justify-content:center;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:360px;background:#1a1a2e;border:2px solid #e8c170;border-radius:14px;padding:24px;text-align:center;';

  const kicker = document.createElement('div');
  kicker.textContent = 'A LEGEND FALLS';
  kicker.style.cssText = 'font-size:12px;letter-spacing:3px;color:#d1a35a;margin-bottom:8px;';
  card.appendChild(kicker);

  const art = document.createElement('div');
  art.style.cssText = 'width:140px;height:140px;margin:0 auto 8px;filter:drop-shadow(0 0 12px rgba(232,193,112,0.5));';
  art.innerHTML = UNIT_SPRITE_CATALOG[options.unitType]({ palette: { mid: '#888', dark: '#555', bright: '#bbb', trim: '#999' } as never, svgOnly: true });
  card.appendChild(art);

  const title = document.createElement('h2');
  title.textContent = `The ${options.beastName} has fallen!`;
  title.style.cssText = 'font-size:22px;color:#e8c170;margin:0 0 4px;';
  card.appendChild(title);

  const credit = document.createElement('p');
  credit.textContent = `Slain by the forces of ${options.slayerName}. Bards will sing of this day.`;
  credit.style.cssText = 'font-size:13px;opacity:0.85;margin:0 0 12px;';
  card.appendChild(credit);

  const rewards = document.createElement('div');
  rewards.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:10px;margin-bottom:16px;';
  for (const line of options.rewardLines) {
    const row = document.createElement('div');
    row.textContent = line;
    row.style.cssText = 'font-size:14px;color:#9ad17b;padding:2px 0;';
    rewards.appendChild(row);
  }
  card.appendChild(rewards);

  const continueButton = createGameButton('Continue', 'primary');
  continueButton.addEventListener('click', () => { overlay.remove(); options.onContinue(); });
  card.appendChild(continueButton);

  overlay.appendChild(card);
  container.appendChild(overlay);
  return overlay;
}
```

(Same neutral-palette adjustment as MR2.)

- [ ] **Step 2: Trigger from the `beast:slain` listener in `src/main.ts`**

Extend the MR1 listener: when the slain beast's tier ≥ 3 AND the slayer is `gameState.currentPlayer`, show the ceremony instead of just the notification (the notification still logs for everyone):

```typescript
  const def = BEAST_DEFINITIONS[beastId];
  if (def.tier >= 3 && slayerCivId === gameState.currentPlayer) {
    const rewardLines = def.tier >= 4
      ? [`+${goldAwarded} gold`, 'Ancient Lore claimed (+research)', 'Beast Trophy raised (+8 gold/turn)', 'Your hero is now Legendary']
      : ['Choose your hoard reward…'];
    showBeastSlayCeremony(uiContainer, {
      beastName: def.name, unitType: def.unitType,
      slayerName: gameState.civilizations[slayerCivId]?.name ?? slayerCivId,
      rewardLines,
      onContinue: () => { maybeShowPendingHoardChoice(); },   // tier-3 flows into the MR4 choice panel
    });
  }
```

Note the ordering contract: for tier 3 the ceremony shows first, then `onContinue` opens the hoard choice panel (MR4's direct call after the slay must skip tiers ≥ 3 to avoid double-opening — adjust MR4's call site: only call `maybeShowPendingHoardChoice()` directly for tier 2).

- [ ] **Step 3: Build + manual check, commit**

```bash
git add src/ui/beast-slay-ceremony.ts src/main.ts
git commit -m "feat(beasts): slay ceremony for tier 3+ beasts"
```

---

### Task 5: Dragon sprite

**Files:**
- Modify: `src/renderer/sprites/beasts.tsx`, `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Step 1: `AncientDragonSprite` (winged rig + ember glow)**

```tsx
const DRAGON = {
  scale: '#8c2f2f',
  scaleDark: '#5e1d1d',
  wing: '#a8443a',
  wingMembrane: '#d97f4a',
  horn: '#e8e0cc',
  fire: '#ffb13d',
};

export function AncientDragonSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g className="cq-shadow-detached"><Shadow /></g>
      <g data-kind="beast-winged" className="cq-sprite-figure">
        <g className="cq-hover-body">
          <g className="cq-wing-l">
            <path d="M56,58 Q30,34 12,44 L20,50 L14,56 L24,58 L20,66 Q40,64 56,66 Z" fill={DRAGON.wing} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M22,46 Q36,52 50,60 M18,56 Q34,58 50,63" fill="none" stroke={DRAGON.wingMembrane} strokeWidth="1.5" opacity="0.8" />
          </g>
          <g className="cq-wing-r">
            <path d="M72,58 Q98,34 116,44 L108,50 L114,56 L104,58 L108,66 Q88,64 72,66 Z" fill={DRAGON.wing} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M106,46 Q92,52 78,60 M110,56 Q94,58 78,63" fill="none" stroke={DRAGON.wingMembrane} strokeWidth="1.5" opacity="0.8" />
          </g>
          {/* body + tail */}
          <ellipse cx="64" cy="66" rx="14" ry="17" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M58,80 Q48,94 36,96 L42,90 Q50,88 56,78" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1" />
          <path d="M60,54 L64,48 L68,54 M58,62 L62,57 L66,62" fill="none" stroke={DRAGON.scaleDark} strokeWidth="1.5" />
          {/* head, horns, molten eyes, breath ember */}
          <ellipse cx="64" cy="44" rx="10" ry="8" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M57,38 L52,28 L60,35 Z M71,38 L76,28 L68,35 Z" fill={DRAGON.horn} stroke={P.ink.line} strokeWidth="1" />
          <circle cx="60" cy="43" r="2" fill={DRAGON.fire} className="cq-glow" />
          <circle cx="68" cy="43" r="2" fill={DRAGON.fire} className="cq-glow" />
          <path d="M62,50 Q64,56 66,50" fill="none" stroke={DRAGON.fire} strokeWidth="2" strokeLinecap="round" className="cq-glow" />
        </g>
      </g>
    </SpriteFrame>
  );
}
```

(`.cq-glow` already exists as a building effect class — verify it animates standalone elements; if it's building-scoped, copy its keyframe under a `[data-kind="beast-winged"] .cq-glow` selector in the CSS.)

- [ ] **Step 2: Register, build, sprite tests**

```typescript
  beast_dragon: AncientDragonSprite,
```

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn vitest run tests/renderer/sprites/sprite-catalog.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sprites/beasts.tsx src/renderer/sprites/sprite-catalog.ts src/assets/sprite-animations-v2.css
git commit -m "feat(beasts): ancient dragon sprite"
```

---

### Task 6: Final verification + PR

- [ ] **Step 1: Gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.

- [ ] **Step 2: Manual boss-fight check**

`yarn dev` → era-4 game near a volcanic region (temporarily set the dragon's `awakenEra` to 1 and awaken chance to 1 locally to test; **revert before committing**) → dragon breathes fire at 2 hexes; preview shows the trait warning; slaying it plays the ceremony listing all rewards; bestiary + HUD income verified.

- [ ] **Step 3: PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR7 — the Ancient Dragon" --body "$(cat <<'EOF'
## Summary
- Ancient Dragon: apex (tier 4) volcanic beast, era 4, flying, 2-hex fire breath via the engine's existing ranged attackProfile machinery
- Apex reward: gold + research + auto-claimed trophy + the slaying unit becomes max-veterancy — everything at once, no choice panel, all listed in the new slay ceremony
- Slay ceremony now plays for all tier ≥ 3 beasts (serpent/roc/hydra retroactively), flowing into the hoard choice panel for tier 3

## Why this is safe to merge partial
The roster is complete (8/8 beasts). Remaining: MR8 (audio, AI engagement, balance tests) — polish only. See docs/superpowers/plans/2026-06-11-legendary-beasts-index.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] Tier-1/2/3/4 reward paths all distinct and tested (auto-gold / choice / ceremony+choice / ceremony+everything)
- [ ] MR4's direct `maybeShowPendingHoardChoice()` call skips tier ≥ 3 (ceremony owns the flow) — no double panel
- [ ] Ranged attack orders honor `attackProfile.range`; melee beasts unchanged
- [ ] No temporary awaken-chance hacks left in committed code (`grep -n "AWAKEN_CHANCE" src/systems/beast-system.ts` shows 0.25)
- [ ] `VETERANCY_TIERS` import creates no cycle
