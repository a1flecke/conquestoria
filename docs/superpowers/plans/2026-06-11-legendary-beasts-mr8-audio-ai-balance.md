# Legendary Beasts MR8 — Audio, AI Engagement, Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor model:** Sonnet 4.5. Grounded in the codebase **after MR1–MR7 merged**.

**Goal:** Finish the feature: beast roars (synthesized SFX), a "beast territory" music tension layer, opportunistic AI beast-hunting behind a setting, and statistical balance tests per era.

**Architecture:** Audio rides the existing catalogs: `UNIT_SFX` (a `Partial` map — no exhaustiveness pressure) and the music-director's war-layer pattern. AI engagement is a conservative heuristic in `basic-ai.ts` gated by a new `aiContestsBeasts` setting (default **false** — the kids keep their kills). Balance is locked in with sampling tests per the strategy-game-mechanics rule.

**Tech Stack:** TypeScript, vitest, ffmpeg 8.0.1 (on PATH — use `ffmpeg` directly), Web Audio via existing audio-system.

**Dependencies:** MR1–MR7 merged. Branches from `main`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `public/audio/sfx/beast-*.ogg` | Create | 8 synthesized roar/death sounds (check the real SFX asset directory first) |
| `src/audio/sfx-catalog.ts` | Modify | `UNIT_SFX` entries for the 8 beast types |
| `src/audio/music-director.ts` | Modify | `beast-territory` tension layer |
| `src/systems/beast-system.ts` | Modify | `isCivUnitInBeastTerritory` helper |
| `src/ai/basic-ai.ts` | Modify | Opportunistic beast hunting |
| `src/core/types.ts` | Modify | `GameSettings.aiContestsBeasts?: boolean` |
| `AUDIO-CREDITS.md` | Modify | Credit the synthesized assets |
| `tests/systems/beast-balance.test.ts` | Create | Statistical combat sampling per tier/era |
| `tests/ai/basic-ai-beasts.test.ts` | Create | AI engagement heuristic tests |

---

### Task 1: Synthesized roar SFX

**Files:**
- Create: 16 OGG files (attack + death per beast)
- Modify: `src/audio/sfx-catalog.ts`, `AUDIO-CREDITS.md`

- [ ] **Step 1: Discover the asset conventions**

Run: `sed -n 1,60p src/audio/sfx-catalog.ts` and `ls public/audio* 2>/dev/null || grep -rn "\.ogg" src/audio/sfx-catalog.ts | head -5`
Note the `TrackEntry` shape (path, volume, variants?) and the directory existing unit SFX live in. All paths below must be adjusted to the real directory.

- [ ] **Step 2: Synthesize roars with ffmpeg**

Layered noise+pitch sweeps read as creature sounds. Generate one pair per beast — vary the base frequency by size (boar 110Hz … dragon 55Hz). Template (run from repo root, output into the real SFX dir):

```bash
# Giant Boar attack: grunt — short low sweep + noise burst
ffmpeg -y -f lavfi -i "sine=frequency=110:duration=0.5" -f lavfi -i "anoisesrc=color=brown:duration=0.5:amplitude=0.4" \
  -filter_complex "[0]vibrato=f=9:d=0.6,atrim=0:0.5[a];[1]highpass=f=200,afade=t=out:st=0.2:d=0.3[b];[a][b]amix=2,afade=t=in:st=0:d=0.03,afade=t=out:st=0.35:d=0.15,volume=1.4" \
  public/audio/sfx/beast-boar-attack.ogg

# Giant Boar death: longer falling sweep
ffmpeg -y -f lavfi -i "sine=frequency=140:duration=1.1" -f lavfi -i "anoisesrc=color=brown:duration=1.1:amplitude=0.3" \
  -filter_complex "[0]vibrato=f=6:d=0.8,asetrate=44100*0.8,aresample=44100[a];[1]lowpass=f=900[b];[a][b]amix=2,afade=t=out:st=0.5:d=0.6,volume=1.3" \
  public/audio/sfx/beast-boar-death.ogg
```

Repeat for each beast with these base frequencies and durations — keep the same filter graphs, change only frequency/duration/filename:

| Beast | attack Hz / dur | death Hz / dur | flavor tweak |
|---|---|---|---|
| boar | 110 / 0.5s | 140 / 1.1s | as above |
| wolf | 220 / 0.7s | 320 / 1.4s | add `vibrato=f=14` (howl warble) |
| basilisk | 180 / 0.6s | 160 / 1.0s | add `highpass=f=400` hiss (raise noise amplitude to 0.6) |
| sea_serpent | 80 / 0.9s | 70 / 1.6s | add `lowpass=f=600` + `aecho=0.8:0.7:60:0.4` (underwater) |
| wurm | 65 / 0.8s | 60 / 1.3s | brown noise amplitude 0.7 (rumble dominates) |
| roc | 480 / 0.6s | 380 / 1.2s | sine→`sawtooth` via `aeval`? keep sine, add `vibrato=f=18:d=0.9` (screech) |
| hydra | 150 / 0.7s | 130 / 1.4s | run 3 detuned sines (150/157/164) mixed (many heads) |
| dragon | 55 / 1.0s | 50 / 2.0s | noise amplitude 0.6 + `aecho=0.8:0.8:90:0.5` (cavernous) |

Listen-check each file (`ffplay` or open in browser); regenerate any that clip or sound flat.

- [ ] **Step 3: Catalog entries**

In `UNIT_SFX` (`src/audio/sfx-catalog.ts:24` — a `Partial` map), add entries for all 8 beast types mirroring the hound entries' exact shape for the attack/death SFX classes (copy a hound entry, swap paths). Then verify the existing sfx-catalog test still passes — it may assert that every referenced file exists.

- [ ] **Step 4: Credits**

Append to `AUDIO-CREDITS.md`:

```markdown
## Legendary Beast SFX
beast-*-attack.ogg / beast-*-death.ogg — synthesized in-project with ffmpeg 8.0.1 (lavfi sine + anoisesrc layering). No external sources.
```

- [ ] **Step 5: Verify + commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/audio/sfx-catalog.test.ts && bash scripts/run-with-mise.sh yarn build`
Expected: PASS.

```bash
git add public/audio src/audio/sfx-catalog.ts AUDIO-CREDITS.md
git commit -m "feat(beasts): synthesized roar and death SFX for all eight beasts"
```

Manual: `yarn dev` → attack a beast → roar plays through the existing combat SFX path (sfx-director routes `UNIT_SFX` automatically; if beast sounds don't fire, read how `sfx-director.ts` picks attack/death tracks and confirm beast types flow through the same code path).

---

### Task 2: Beast-territory music layer

**Files:**
- Modify: `src/systems/beast-system.ts`, `src/audio/music-director.ts`
- Test: `tests/systems/beast-system.test.ts`

- [ ] **Step 1: Failing test for the helper (append)**

```typescript
import { isCivUnitInBeastTerritory } from '@/systems/beast-system';

describe('isCivUnitInBeastTerritory', () => {
  it('true only when a civ unit stands within an AWAKE lair leash radius', () => {
    const state = createNewGame('rome', 'beast-test-seed', 'small', 'Territory Test');
    state.beasts = {
      mode: 'wild',
      lairs: { 'lair-giant_boar': makeLair({ status: 'awake', unitIds: ['beast-1'] }) },   // at 10,10 leash 3
      sightingsByCiv: {},
    };
    const me = state.currentPlayer;
    state.units['scout-1'] = makeUnit({ id: 'scout-1', owner: me, position: { q: 12, r: 10 } });
    expect(isCivUnitInBeastTerritory(state, me)).toBe(true);

    state.units['scout-1'].position = { q: 20, r: 20 };
    expect(isCivUnitInBeastTerritory(state, me)).toBe(false);

    state.units['scout-1'].position = { q: 12, r: 10 };
    state.beasts.lairs['lair-giant_boar'].status = 'dormant';
    expect(isCivUnitInBeastTerritory(state, me)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
export function isCivUnitInBeastTerritory(state: GameState, civId: string): boolean {
  if (!state.beasts || state.beasts.mode === 'off') return false;
  const awakeLairs = Object.values(state.beasts.lairs).filter(l => l.status === 'awake');
  if (awakeLairs.length === 0) return false;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId) continue;
    for (const lair of awakeLairs) {
      if (hexDistance(unit.position, lair.position) <= BEAST_DEFINITIONS[lair.beastId].leashRadius) return true;
    }
  }
  return false;
}
```

- [ ] **Step 3: Wire into the music director**

Read `src/audio/music-director.ts` and find how the **war layer** activates (a per-state-evaluation boolean → layer gain). Add a `beast-territory` tension layer using the same mechanism, driven by `isCivUnitInBeastTerritory(state, state.currentPlayer)`. For the audio asset: reuse an existing tension/war layer track at reduced gain if the director supports per-layer source reuse; otherwise synthesize a 30s low drone loop with ffmpeg (`sine=55` + brown noise, `afade` in/out, loopable) into the music directory and register it the way era bases are registered. Match whatever the war-layer code does for crossfade timing.

- [ ] **Step 4: Verify + commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-system.test.ts && bash scripts/run-with-mise.sh yarn test`
Manual: walk a unit into an awake lair radius → tension layer fades in; leave → fades out.

```bash
git add src/systems/beast-system.ts src/audio tests/systems/beast-system.test.ts public/audio
git commit -m "feat(beasts): beast-territory music tension layer"
```

---

### Task 3: AI beast hunting (gated, conservative)

**Files:**
- Modify: `src/core/types.ts`, `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai-beasts.test.ts`

- [ ] **Step 1: Setting**

`GameSettings` in `src/core/types.ts`:

```typescript
  aiContestsBeasts?: boolean;   // default false: AI ignores beasts, players keep the glory
```

(No UI control in this MR — `false` is the family-friendly default; a settings field without UI is not a player-visible dead surface.)

- [ ] **Step 2: Failing tests**

Create `tests/ai/basic-ai-beasts.test.ts`. First read how existing AI tests construct a state and invoke the AI (`ls tests/ai/`, open `basic-ai` tests, copy their harness). Then assert:

```typescript
// Pseudostructure — use the real AI test harness from the existing file:
describe('AI vs beasts', () => {
  it('never attacks a beast when aiContestsBeasts is false (default)', () => {
    // state: AI warrior adjacent to a 60-health beast_boar; settings.aiContestsBeasts undefined
    // run the AI decision function; assert no attack order targets the beast unit
  });

  it('attacks an adjacent beast when enabled AND local strength advantage >= 1.5x', () => {
    // settings.aiContestsBeasts = true; AI swordsman (str 25 area) vs wounded boar at 30 health
    // effective beast strength = base * health/100; assert the AI issues the attack
  });

  it('does not attack when enabled but the beast is healthy and stronger', () => {
    // AI warrior (str 10) vs full-health basilisk (str 26); assert no attack
  });
});
```

Write these as REAL tests against the actual AI entry point — the existing `transportHostileOwners` set at `src/ai/basic-ai.ts:358` and `aiHostileOwners` at `:506` show where hostility is decided; your tests should drive the same function those lines live in.

- [ ] **Step 3: Implement**

In `src/ai/basic-ai.ts`, where hostile-owner sets are built (lines 358 and 506), beasts join only when contesting is enabled — and attack decisions additionally require a strength advantage:

```typescript
import { BEAST_OWNER, isBeastUnit } from '@/systems/beast-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';   // already imported? check

// hostile sets (both sites):
const contestsBeasts = state.settings.aiContestsBeasts === true;
const hostileOwners = new Set<string>(['barbarian', ...(contestsBeasts ? [BEAST_OWNER] : []), ...(civ.diplomacy?.atWarWith ?? [])]);

// at the attack-decision point for a candidate target:
if (isBeastUnit(target)) {
  const myStrength = UNIT_DEFINITIONS[unit.type].strength * (unit.health / 100);
  const beastStrength = UNIT_DEFINITIONS[target.type].strength * (target.health / 100);
  if (myStrength < beastStrength * 1.5) continue;   // only clearly-winnable fights
}
```

Respect MR5's `canUnitAttackBeast` gate too — verify the AI's attack path flows through attack-targeting (it should after MR5; if it has a parallel direct path, add the gate there).

- [ ] **Step 4: Run, commit**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai-beasts.test.ts`
Expected: PASS.

```bash
git add src/core/types.ts src/ai/basic-ai.ts tests/ai/basic-ai-beasts.test.ts
git commit -m "feat(beasts): gated opportunistic AI beast hunting"
```

---

### Task 4: Balance tests (statistical sampling)

**Files:**
- Create: `tests/systems/beast-balance.test.ts`

Per `.claude/rules/strategy-game-mechanics.md`: balance must be tested at each era with sampling, not single rolls.

- [ ] **Step 1: Write the suite**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCombat } from '@/systems/combat-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { generateMap } from '@/systems/map-generator';
import type { Unit, UnitType } from '@/core/types';

const map = generateMap(20, 20, 'balance-seed');

function unit(type: UnitType, overrides: Partial<Unit> = {}): Unit {
  return {
    id: `u-${type}-${Math.floor((overrides.position?.q ?? 1) * 1000)}`, type, owner: 'player',
    position: { q: 1, r: 1 }, movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

/** Simulate full fights: era-appropriate attacker squad vs one beast; return win rate and avg exchanges. */
function sampleFights(attackerType: UnitType, squadSize: number, beastType: UnitType, trials: number) {
  let wins = 0; let totalExchanges = 0;
  for (let trial = 0; trial < trials; trial++) {
    let beast = unit(beastType, { owner: 'beasts', position: { q: 2, r: 1 } });
    let exchanges = 0; let won = false;
    for (let i = 0; i < squadSize && !won; i++) {
      let attacker = unit(attackerType);
      while (attacker.health > 0 && beast.health > 0 && exchanges < 30) {
        const result = resolveCombat(attacker, beast, map, trial * 7919 + exchanges * 31 + i);
        beast = { ...beast, health: Math.max(0, beast.health - result.defenderDamage) };
        attacker = { ...attacker, health: Math.max(0, attacker.health - result.attackerDamage) };
        exchanges++;
      }
      if (beast.health <= 0) won = true;
    }
    if (won) wins++;
    totalExchanges += exchanges;
  }
  return { winRate: wins / trials, avgExchanges: totalExchanges / trials };
}

describe('beast balance bands (N=200 per matchup)', () => {
  it('era 1: three warriors beat the boar most of the time, one warrior usually dies trying', () => {
    expect(sampleFights('warrior', 3, 'beast_boar', 200).winRate).toBeGreaterThan(0.7);
    expect(sampleFights('warrior', 1, 'beast_boar', 200).winRate).toBeLessThan(0.45);
  });

  it('era 2: a small swordsman squad handles a single wolf comfortably', () => {
    expect(sampleFights('swordsman', 2, 'beast_wolf', 200).winRate).toBeGreaterThan(0.85);
  });

  it('era 2-3: the basilisk demands a real squad', () => {
    expect(sampleFights('swordsman', 1, 'beast_basilisk', 200).winRate).toBeLessThan(0.4);
    expect(sampleFights('swordsman', 3, 'beast_basilisk', 200).winRate).toBeGreaterThan(0.7);
  });

  it('era 4: knights can fell the dragon only in numbers', () => {
    expect(sampleFights('knight', 2, 'beast_dragon', 200).winRate).toBeLessThan(0.5);
    expect(sampleFights('knight', 4, 'beast_dragon', 200).winRate).toBeGreaterThan(0.6);
  });

  it('fights resolve in a reasonable exchange count (no 30-exchange slogs on average)', () => {
    expect(sampleFights('warrior', 3, 'beast_boar', 200).avgExchanges).toBeLessThan(15);
  });
});
```

(Check `CombatResult` field names — `attackerDamage`/`defenderDamage` — against `src/systems/combat-system.ts` and adjust. `resolveCombat`'s 4th arg is the seed.)

- [ ] **Step 2: Run; tune STRENGTH, not the tests, if bands fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/beast-balance.test.ts`
If a band fails, adjust the beast's `strength` in `UNIT_DEFINITIONS` in steps of ±2 until all bands hold. The bands encode the design intent ("3 warriors for the boar", "4 knights for the dragon") — they are the spec; beast stats are the free variable. Document any stat change in the commit message.

- [ ] **Step 3: Commit**

```bash
git add tests/systems/beast-balance.test.ts src/systems/unit-system.ts
git commit -m "test(beasts): statistical balance bands per era; tune beast strengths"
```

---

### Task 5: Final verification + PR

- [ ] **Step 1: Gates**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`
Expected: both exit 0.

- [ ] **Step 2: PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(beasts): MR8 — roars, tension music, AI hunting, balance bands" --body "$(cat <<'EOF'
## Summary
- 16 synthesized roar/death SFX (ffmpeg lavfi, credited) wired through UNIT_SFX
- "Beast territory" music tension layer using the war-layer mechanism
- AI beast-hunting behind `aiContestsBeasts` (default OFF — players keep the glory), with a 1.5× strength-advantage guard
- Statistical balance bands per era (N=200 sampling) locking the design intent: 3 warriors ≈ boar, 4 knights ≈ dragon

## Completion
This closes the Legendary Beasts feature (MR8/8). Index: docs/superpowers/plans/2026-06-11-legendary-beasts-index.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [ ] SFX files exist, are credited, and the catalog test passes
- [ ] Music layer activates only for `state.currentPlayer`'s units (hot-seat correct)
- [ ] AI default leaves beasts alone; enabled AI only takes winnable fights and respects navalOnly
- [ ] Balance bands green; any stat tuning documented
- [ ] `grep -rn "Math.random" src/systems/beast-* src/ai/basic-ai.ts` returns nothing
