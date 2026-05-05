# Stacked Combat Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents for issue 173.

**Goal:** Make every attack against a stacked enemy hex resolve against the strongest available combat defender, leaving defenseless units such as settlers and workers protected until combat defenders are gone.

**Architecture:** Add a single combat-system target selector that ranks units on a target hex by effective defensive strength, with combat units always ahead of civilians. Wire the real player preview/confirm path, AI adjacent attack path, and barbarian attack order path through that selector so the UI, gameplay, and non-player turns agree.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM UI in `src/main.ts`, existing repo wrapper `./scripts/run-with-mise.sh yarn ...`.

---

## Root Cause

Issue [#173](https://github.com/a1flecke/conquestoria/issues/173) reports that attacking a stacked enemy tile can target a settler while a warrior is present. The code currently discovers a unit with `Object.entries(gameState.units).find(...)` in `src/main.ts` and single-id occupancy maps in AI/barbarian logic. That means object insertion order chooses the defender. `resolveCombat()` correctly makes non-combat units lose, but there is no shared rule that says which unit in a stack must defend first.

## File Structure

- Modify `src/systems/combat-system.ts`
  - Add `getEffectiveDefenseStrength()` and `selectDefenderForAttack()` as the canonical stacked-defender rule.
- Modify `tests/systems/combat-system.test.ts`
  - Add regression coverage proving civilians are last and stronger combat defenders are selected.
- Modify `src/main.ts`
  - Use `selectDefenderForAttack()` for enemy-info panels, combat preview, attack confirmation, and attack highlights.
- Modify `src/ai/basic-ai.ts`
  - Use `selectDefenderForAttack()` when AI attacks an adjacent occupied hex.
- Modify `src/systems/barbarian-system.ts`
  - Use `selectDefenderForAttack()` when issuing barbarian attack orders against stacked player units.
- Modify `tests/systems/barbarian-system.test.ts`
  - Add non-human parity coverage proving barbarians attack a warrior before a stacked settler.

## Player Truth Table

| Before | Action | Internal state change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Enemy hex contains Warrior and Settler, no player unit selected | Tap enemy stack | None | Info panel shows Warrior as defender, with HP/strength and stack note | Later attack preview still available after selecting attacker |
| Player Warrior selected next to enemy Warrior + Settler stack | Tap enemy stack | None until confirmation | Combat Preview shows Warrior, not Settler | Cancel must still deselect/clear preview |
| Combat Preview shows Warrior defending a stack | Click `Attack` | `resolveCombat()` receives Warrior as defender | Warrior takes damage or dies; Settler remains unless no combat defender remains | City/camp consequences still fire from the target hex |
| Enemy stack has only Settler and Worker | Tap with selected attacker | None until confirmation | Combat Preview may show a civilian because no combat defender exists | Attack still works and clears the civilian |
| Barbarian adjacent to player Warrior + Settler stack | End turn | Barbarian attack order uses Warrior id | Combat result damages/removes Warrior first | Settler remains protected while Warrior survives |

## Misleading UI Risks

- `Combat Preview` must not show a civilian when any visible hostile combat unit exists on the same target hex.
- A stack note must not imply the displayed defender is optional; it is the forced defender chosen by the rules.
- Attack highlights must classify a hex as `attack` if any visible hostile unit is on it, even if another unit in insertion order would have hidden the hostile.
- Negative tests prove `settler` is excluded while `warrior` is present, and included only when no combat defender exists.

## Interaction Replay Checklist

- Open enemy info by tapping a Warrior + Settler stack with no selected attacker.
- Select an attacker, tap the same stack, and verify the preview names Warrior.
- Cancel preview and tap again; the preview must still name Warrior.
- Confirm attack; the defender id passed to combat must be Warrior.
- Repeat with a stack containing only civilians; a civilian can be targeted because no combat defender remains.

### Task 1: Add Shared Defender Selection

**Files:**
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `src/systems/combat-system.ts`

- [ ] **Step 1: Write the failing combat target tests**

Add these tests inside `describe('resolveCombat', ...)` in `tests/systems/combat-system.test.ts`:

```ts
  it('selects a combat defender before a stacked civilian regardless of insertion order', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 });
    settler.id = 'settler-first';
    const warrior = createUnit('warrior', 'p2', { q: 11, r: 10 });
    warrior.id = 'warrior-second';

    const defender = selectDefenderForAttack([settler, warrior], map);

    expect(defender?.id).toBe('warrior-second');
  });

  it('selects the strongest combat defender in a stack before civilians', () => {
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 });
    const injuredSwordsman = createUnit('swordsman', 'p2', { q: 11, r: 10 });
    injuredSwordsman.health = 20;
    const warrior = createUnit('warrior', 'p2', { q: 11, r: 10 });

    const defender = selectDefenderForAttack([settler, injuredSwordsman, warrior], map);

    expect(defender?.id).toBe(warrior.id);
  });
```

Also update the import:

```ts
import { resolveCombat, getTerrainDefenseBonus, selectDefenderForAttack } from '@/systems/combat-system';
```

- [ ] **Step 2: Run the failing combat test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: FAIL with `No exported member 'selectDefenderForAttack'`.

- [ ] **Step 3: Implement the selector**

Add this code to `src/systems/combat-system.ts` after `getTerrainDefenseBonus()`:

```ts
export function getEffectiveDefenseStrength(defender: Unit, map: GameMap): number {
  const def = UNIT_DEFINITIONS[defender.type];
  let strength = def.strength * (defender.health / 100);
  const tile = map.tiles[hexKey(defender.position)];
  if (tile) {
    strength *= (1 + getTerrainDefenseBonus(tile.terrain));
    if (tile.wonder) {
      strength *= (1 + getWonderCombatBonus(tile.wonder));
    }
  }
  return strength;
}

export function selectDefenderForAttack(defenders: Unit[], map: GameMap): Unit | undefined {
  return [...defenders].sort((a, b) => {
    const aStrength = getEffectiveDefenseStrength(a, map);
    const bStrength = getEffectiveDefenseStrength(b, map);
    const aCanFight = aStrength > 0;
    const bCanFight = bStrength > 0;
    if (aCanFight !== bCanFight) return aCanFight ? -1 : 1;
    if (aStrength !== bStrength) return bStrength - aStrength;
    if (a.health !== b.health) return b.health - a.health;
    return a.id.localeCompare(b.id);
  })[0];
}
```

- [ ] **Step 4: Run the combat test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: PASS.

### Task 2: Wire Player Preview and Confirmation

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace single-unit lookup with stack-aware helpers**

Import the selector:

```ts
import { resolveCombat, getTerrainDefenseBonus, selectDefenderForAttack } from '@/systems/combat-system';
```

Add helpers near `handleHexTap()`:

```ts
function visibleUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  return Object.entries(gameState.units).filter(([, unit]) =>
    hexKey(unit.position) === key
    && (unit.owner === gameState.currentPlayer || !isForestConcealedUnit(gameState, gameState.currentPlayer, unit))
  );
}

function visibleHostileUnitEntriesAtKey(key: string): Array<[string, Unit]> {
  return visibleUnitEntriesAtKey(key).filter(([, unit]) => unit.owner !== gameState.currentPlayer);
}

function selectDefenderEntryAtKey(key: string): [string, Unit] | undefined {
  const hostileEntries = visibleHostileUnitEntriesAtKey(key);
  const defender = selectDefenderForAttack(hostileEntries.map(([, unit]) => unit), gameState.map);
  if (!defender) return undefined;
  return hostileEntries.find(([id]) => id === defender.id);
}
```

- [ ] **Step 2: Use the chosen defender in highlights, info, preview, and confirm**

In `selectUnit()`, classify highlights with `visibleHostileUnitEntriesAtKey(k).length > 0`.

In `handleHexTap()`, replace `Object.entries(gameState.units).find(...)` with `visibleUnitEntriesAtKey(key)`, select friendly units from that list, and use `selectDefenderEntryAtKey(key)` for enemy info and combat preview.

Change attack confirmation to:

```ts
attackBtn.addEventListener('click', () => {
  executeAttack(selectedUnitId!, key);
});
```

Change `executeAttack()` to derive the defender at execution time:

```ts
function executeAttack(attackerId: string, targetKey: string): void {
  const attacker = gameState.units[attackerId];
  const defenderEntry = selectDefenderEntryAtKey(targetKey);
  if (!attacker || !defenderEntry) return;

  const [defenderId, defender] = defenderEntry;
  // existing combat body continues with this defender id/unit
}
```

- [ ] **Step 3: Run the mirrored checks for `src/main.ts`**

Run:

```bash
scripts/check-src-rule-violations.sh src/main.ts
./scripts/run-with-mise.sh yarn test --run tests/renderer/movement-highlights.test.ts tests/input/selected-unit-tap-intent.test.ts
```

Expected: PASS.

### Task 3: Wire Non-Human Attack Paths

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/barbarian-system.ts`
- Modify: `tests/systems/barbarian-system.test.ts`

- [ ] **Step 1: Write the failing barbarian parity test**

Add this test to `tests/systems/barbarian-system.test.ts` under `describe('processBarbarians', ...)`:

```ts
  it('targets a combat defender before a stacked settler', () => {
    const map = generateMap(30, 30, 'barb-stack-target');
    const barbarian = createUnit('warrior', 'barbarian', { q: 10, r: 10 });
    barbarian.id = 'barb';
    const settler = createUnit('settler', 'player', { q: 11, r: 10 });
    settler.id = 'settler-first';
    const warrior = createUnit('warrior', 'player', { q: 11, r: 10 });
    warrior.id = 'warrior-second';

    const result = processBarbarians([], map, [], 42, [barbarian], [settler, warrior]);

    expect(result.attackOrders).toContainEqual({
      attackerUnitId: 'barb',
      defenderUnitId: 'warrior-second',
    });
  });
```

Also import `createUnit`:

```ts
import { createUnit } from '@/systems/unit-system';
```

- [ ] **Step 2: Run the failing barbarian test**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-system.test.ts
```

Expected: FAIL because the defender id is `settler-first`.

- [ ] **Step 3: Use the selector in AI and barbarian systems**

In `src/systems/barbarian-system.ts`, import `selectDefenderForAttack` and replace attack orders against `nearestTarget` with the selected defender from all player units on that target key.

In `src/ai/basic-ai.ts`, import `selectDefenderForAttack` and replace the single `occupant` defender with the selected attackable unit from all units on that neighbor key.

- [ ] **Step 4: Run non-human tests**

Run:

```bash
scripts/check-src-rule-violations.sh src/ai/basic-ai.ts src/systems/barbarian-system.ts src/systems/combat-system.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-system.test.ts tests/ai/basic-ai.test.ts
```

Expected: PASS.

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run source rule checks**

Run:

```bash
scripts/check-src-rule-violations.sh src/systems/combat-system.ts src/main.ts src/ai/basic-ai.ts src/systems/barbarian-system.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/systems/barbarian-system.test.ts tests/ai/basic-ai.test.ts tests/renderer/movement-highlights.test.ts tests/input/selected-unit-tap-intent.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: PASS.

## Self-Review

- Spec coverage: issue 173 requires defenseless units to attack last; Tasks 1-3 cover player UI, player combat confirmation, AI, and barbarian paths.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation slots remain.
- Type consistency: exported selector name is `selectDefenderForAttack` in tests, `src/main.ts`, AI, and barbarian-system.
