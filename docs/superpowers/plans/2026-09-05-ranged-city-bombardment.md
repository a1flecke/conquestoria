# Ranged City Bombardment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement
> this plan task-by-task. **Do NOT use subagent-driven-development** — this repo's CLAUDE.md
> forbids subagents ("NEVER use subagents or parallel agents. Execute all tasks inline").
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ranged and siege units a real from-range city attack, make bombardment
matter to capture, and collapse city interaction onto a single resolver.

**Architecture:** One new resolver (`resolveCityInteraction`) becomes the sole source of
truth for what a unit may do to a city, consumed by highlights, the tap preview, the
executor, and the AI. City HP gains a bearing on capture through a surgical, full-HP-neutral
defense scale. The existing but player-unreachable `resolveNavalCityBombardment` is
generalised to all domains.

**Tech Stack:** TypeScript, Vitest, Canvas 2D + DOM UI, seeded RNG.

**Spec:** `docs/superpowers/specs/2026-09-05-ranged-city-bombardment-design.md`

## Status — COMPLETE

All four phases merged: Phase 1 #975, Phase 2 #976 (closed #966), Phase 3 #977, Phase 4 #978.
Tracking issue #974. Follow-ups deliberately not built: Demand Surrender, garrison Sortie,
land+sea combined-arms bonus, wall-breach at low HP, per-unit bombardment coefficients, and
scaling `CITY_HP_MAX` with population.

## Global Constants

Copied verbatim from the spec. Declared in `src/systems/city-siege-system.ts`.

| Constant | Value |
|---|---|
| `CITY_HP_DEFENSE_FLOOR` | `0.4` |
| `CITY_BOMBARDMENT_COEFFICIENT` | `0.4` |
| `CITY_BOMBARDMENT_MAX_HP_LOSS_PER_TURN` | `20` |
| `CITY_BOMBARDMENT_GARRISON_MITIGATION` | `0.5` |
| `CITY_BOMBARDMENT_REGEN_SUPPRESSION_TURNS` | `1` |
| `AI_BOMBARDMENT_FOLLOWUP_RADIUS` | `3` (in `src/ai/ai-tactics.ts`) |

## Global Constraints

- **One PR per phase.** Before each PR: full 18-dimension inline review, fix everything
  found, re-run verification, then open the PR. Watch CI; rebase-merge with admin bypass
  when green.
- `bash scripts/run-with-mise.sh yarn <cmd>` for every command. `yarn build` is the only
  tsc path; `yarn test` does not type-check.
- Immutable turn processing: systems return a new `GameState`; never mutate in place.
- Never key legality off `state.currentPlayer` — always the acting unit's owner.
- No `Math.random()`; seeded RNG only.
- Full-HP invariance is the prime directive: at `hp === 100` every existing tuned number
  must be unchanged.

---

## Phase 1 — Spine (PR 1) ✅ merged (#975)

Makes bombardment meaningful *before* it exists, and kills the divergent-route bug class.

### Task 1.1: Narrow the city-defense helpers to completed techs

Minor civs have no `techState`, so they can never be passed as a `Civilization`. This
refactor unblocks minor-civ support later and is a no-op for major civs.

**Files:**
- Modify: `src/systems/city-siege-system.ts` (`getCityIntrinsicStrength`, `getCityCounterFireDamage`, `calculateCityAssaultStrengths`, `resolveCitySiegeDamage`)
- Modify: `src/systems/city-capture-system.ts`, `src/ui/city-panel.ts`, `src/systems/naval-city-bombardment-system.ts`, `src/core/turn-manager.ts`, `src/systems/pirate-system.ts`, `src/systems/air-operations-system.ts` (call sites)
- Test: `tests/systems/city-siege-system.test.ts`

**Interfaces:**
- Produces: `getCityIntrinsicStrength(city: City, defenderCompletedTechs: string[], attackerDomain: 'land'|'naval'|'air'): number`

- [ ] **Step 1:** Write a failing test asserting `getCityIntrinsicStrength` accepts a
  `string[]` and returns the identical value the `Civilization` form returned:

```ts
it('#966 accepts completed techs directly and matches the previous civ-based result', () => {
  const city = makeCity({ population: 4, buildings: ['walls'] });
  expect(getCityIntrinsicStrength(city, ['professional-army'], 'land'))
    .toBeCloseTo((2 + 4 * 2) * 1.25 * 1.10, 5);
});
```

- [ ] **Step 2:** Run `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-siege-system.test.ts -t "#966"` — expect FAIL (type error / wrong arity).
- [ ] **Step 3:** Change the signature to take `defenderCompletedTechs: string[]`; inside,
  pass it straight to `getCityDefenseBreakdown`. Update `getCityCounterFireDamage` and
  `calculateCityAssaultStrengths` to take `defenderCompletedTechs` too. Update every call
  site to pass `civ.techState.completed ?? []`.
- [ ] **Step 4:** `yarn vitest run tests/systems/ tests/ui/city-panel.test.ts` — expect PASS.
- [ ] **Step 5:** `yarn build` — expect exit 0 (this is the only tsc gate).
- [ ] **Step 6:** Commit `refactor(combat): take completed techs instead of a Civilization for city defense`.

### Task 1.2: HP-scaled effective assault defense

**Files:**
- Modify: `src/systems/city-siege-system.ts`
- Test: `tests/systems/city-siege-system.test.ts`

**Interfaces:**
- Consumes: `getCityIntrinsicStrength(city, defenderCompletedTechs, domain)` (Task 1.1)
- Produces: `CITY_HP_DEFENSE_FLOOR`, `cityHpDefenseScale(city: City): number`,
  `getEffectiveCityAssaultDefense(city: City, defenderCompletedTechs: string[]): number`

- [ ] **Step 1:** Write failing tests — the first is the prime directive:

```ts
it('#966 is a no-op at full HP (prime directive)', () => {
  const city = makeCity({ population: 4, buildings: ['walls'], hp: 100 });
  expect(getEffectiveCityAssaultDefense(city, []))
    .toBe(getCityIntrinsicStrength(city, [], 'land'));
});

it('#966 treats a missing hp as full HP (legacy saves)', () => {
  const city = makeCity({ population: 4, buildings: ['walls'] }); // hp undefined
  expect(cityHpDefenseScale(city)).toBe(1);
});

it('#966 scales defense down to the floor as HP falls', () => {
  expect(cityHpDefenseScale(makeCity({ hp: 1 }))).toBeCloseTo(0.406, 3);
  expect(cityHpDefenseScale(makeCity({ hp: 50 }))).toBeCloseTo(0.7, 5);
});
```

- [ ] **Step 2:** Run the file with `-t "#966"` — expect FAIL (not exported).
- [ ] **Step 3:** Implement:

```ts
export const CITY_HP_DEFENSE_FLOOR = 0.4;

export function cityHpDefenseScale(city: City): number {
  const hp = city.hp ?? CITY_HP_MAX;
  return CITY_HP_DEFENSE_FLOOR + (1 - CITY_HP_DEFENSE_FLOOR) * (hp / CITY_HP_MAX);
}

export function getEffectiveCityAssaultDefense(city: City, defenderCompletedTechs: string[]): number {
  return getCityIntrinsicStrength(city, defenderCompletedTechs, 'land') * cityHpDefenseScale(city);
}
```

- [ ] **Step 4:** Point `calculateCityAssaultStrengths` at `getEffectiveCityAssaultDefense`.
  **Do not touch `getCityCounterFireDamage` or `city-panel.ts`** — the surgical scope is
  the whole point.
- [ ] **Step 5:** Add regression tests proving counter-fire and the panel's displayed
  defense are unchanged for a damaged city.
- [ ] **Step 6:** `yarn vitest run tests/systems/ tests/ui/` then `yarn build` — expect PASS / exit 0.
- [ ] **Step 7:** Commit `feat(combat): make remaining city HP scale assault defense`.

### Task 1.3: Ranged units target cities; any offensive land unit can capture

Folds in the already-staged worktree changes.

**Files:**
- Modify: `src/systems/unit-system.ts` (`archer`, `crossbowman`, `ballista`, `anti_tank_gun`, `mobile_aa`, `beast_dragon` → `targets: ['unit','city']`)
- Modify: `src/systems/city-capture-system.ts` (`canUnitOccupyCity` drops the siege/bombard exclusion)
- Test: `tests/systems/attack-targeting.test.ts`, `tests/systems/city-capture-system.test.ts`

- [ ] **Step 1:** These edits and their inverted tests are already staged uncommitted.
  Verify with `git diff --stat`; expect the four files from the spec's "Worktree changes".
- [ ] **Step 2:** Add a test that a Catapult can now capture an undefended city and a
  Settler still cannot:

```ts
it('#966 lets a siege unit capture an undefended city', () => {
  const state = makeMajorAssaultState();
  state.units.attacker.type = 'catapult';
  expect(beginMajorCityAssault(state, 'attacker', 'athens', { actor: 'ai', civId: 'player' }).ok).toBe(true);
});
```

- [ ] **Step 3:** `yarn vitest run tests/systems/attack-targeting.test.ts tests/systems/city-capture-system.test.ts` — expect PASS.
- [ ] **Step 4:** Commit `feat(combat): let ranged units target cities and any offensive land unit capture`.

### Task 1.4: `resolveCityInteraction` — the single resolver

**Files:**
- Create: `src/systems/city-interaction.ts`
- Test: `tests/systems/city-interaction.test.ts`

**Interfaces:**
- Consumes: `canUnitAttackTarget`, `canUnitOccupyCity`, `calculateCityAssaultStrengths`, `getEffectiveCityAssaultDefense`
- Produces:

```ts
export type CityAction =
  | { kind: 'attack-defender'; defenderId: string; label: string }
  | { kind: 'bombard'; hpLoss: number; counterFire: number; label: string }
  | { kind: 'capture'; winProbability: number; defenseBefore: number; defenseAfter: number; label: string };

export interface CityInteraction {
  available: CityAction[];
  denied: { kind: CityAction['kind']; reason: string }[];
}

export function resolveCityInteraction(state: GameState, unit: Unit, city: City): CityInteraction;
```

- [ ] **Step 1:** Write failing tests: a Warrior adjacent to an ungarrisoned enemy city
  gets exactly `['capture']`; a Warrior adjacent to a garrisoned one gets
  `['attack-defender']` and a `denied` `capture` entry reading
  `'Defeat the defenders first.'`; a Settler gets neither. Phase 1 never returns `bombard`.
- [ ] **Step 2:** Run — expect FAIL (module missing).
- [ ] **Step 3:** Implement. `capture` carries `defenseBefore = getCityIntrinsicStrength(...)`
  and `defenseAfter = getEffectiveCityAssaultDefense(...)` so the UI can show the payoff.
  Label format: `` `Capture the city — ${Math.round(winProbability * 100)}%` ``.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit `feat(combat): add resolveCityInteraction as the single city-action source`.

### Task 1.5: Wire highlights and the tap preview to the resolver

**Files:**
- Modify: `src/input/selected-unit-highlights.ts` (drop the `domain === 'naval'` city filter; derive city targets from the resolver)
- Modify: `src/input/map-tap-intent.ts`, `src/input/selected-unit-tap-intent.ts`
- Create: `src/ui/city-action-preview.ts` (extracted from `map-interaction-controller.ts`'s inline DOM)
- Modify: `src/app/controllers/map-interaction-controller.ts`
- Test: `tests/input/selected-unit-highlights.test.ts`, `tests/input/map-tap-intent.test.ts`, `tests/ui/city-action-preview.test.ts`

- [ ] **Step 1:** Write a failing preview↔execution parity test — for a matrix of unit
  types and distances, every `available` action from the resolver must be reachable from
  the tap intent, and no unreachable action may be offered.
- [ ] **Step 2:** Write a failing test that the assault preview renders
  `City defenses 54 → 32 (damaged)` for a bombarded city and omits the arrow at full HP.
- [ ] **Step 3:** Run both — expect FAIL.
- [ ] **Step 4:** Extract `city-action-preview.ts`, render buttons from
  `CityInteraction.available` plus `denied` reasons, and route highlights through the
  resolver.
- [ ] **Step 5:** Run `yarn vitest run tests/input/ tests/ui/` — expect PASS.
- [ ] **Step 6:** Confirm **#965 is not regressed**:
  `yarn vitest run tests/systems/unit-system.test.ts -t "#965"` — expect PASS.
- [ ] **Step 7:** Commit `feat(ui): render city actions from the single resolver`.

### Task 1.6: Phase 1 gate

- [ ] **Step 1:** `yarn build` — exit 0.
- [ ] **Step 2:** `yarn test:durable` then `yarn test:durable:status` — passed, matching HEAD.
- [ ] **Step 3:** Run `.claude/hooks/check-src-edit.sh` against every changed `src/` file.
- [ ] **Step 4:** **Full 18-dimension inline review.** Fix every finding, re-run Steps 1–3.
- [ ] **Step 5:** Push, open PR 1 (**does not** close #966), watch CI, rebase-merge with admin bypass.

---

## Phase 2 — Bombard (PR 2) — closes #966 ✅ merged (#976)

### Task 2.1: Siege-input options

**Files:** Modify `src/systems/city-siege-system.ts`; Test `tests/systems/city-siege-system.test.ts`

**Interfaces:** `CitySiegeInput` gains `ignoreGarrison?: boolean`,
`garrisonMitigation?: number`, `maxHpLoss?: number`. **Every default preserves existing
caller behaviour exactly.**

- [ ] **Step 1:** Failing tests — default still returns `blocked` when garrisoned;
  `ignoreGarrison: true` with `garrisonMitigation: 0.5` halves damage;
  `maxHpLoss: 5` clamps a 19-damage shot to 5.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement in this exact order: garrison block → mitigate → garrison
  mitigation → `maxHpLoss` clamp → `preventDestruction` floor.
- [ ] **Step 4:** Run; also run barbarian/pirate/air siege tests to prove no default drift.
- [ ] **Step 5:** Commit `feat(combat): add garrison and cap options to city siege damage`.

### Task 2.2: `City.bombardment` — per-turn cap + regen suppression

**Files:** Modify `src/core/types.ts`, `src/systems/city-siege-system.ts`,
`src/storage/save-migrations.ts`; Test `tests/systems/city-siege-system.test.ts`,
`tests/storage/save-migrations.test.ts`

**Interfaces:** `City.bombardment?: { turn: number; hpLostThisTurn: number }`

- [ ] **Step 1:** Failing tests for the regen boundary — bombard on turn `N` ⇒
  `isCityHpRegenerating` false on `N` and `N+1`, true on `N+2`; and an undefined
  `bombardment` regenerates normally.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Add the field, the suppression clause
  (`state.turn - bombardment.turn <= CITY_BOMBARDMENT_REGEN_SUPPRESSION_TURNS`), and one
  numbered migration defaulting it to `undefined`.
- [ ] **Step 4:** Run; `yarn build`.
- [ ] **Step 5:** Commit `feat(combat): suppress city HP regen after bombardment`.

### Task 2.3: `resolveUnitCityBombardment`

**Files:** Rename `src/systems/naval-city-bombardment-system.ts` →
`src/systems/city-bombardment-system.ts`; modify `src/core/types.ts` (`city:bombarded`),
`src/presentation/register-raider-presentation.ts`, `src/ai/ai-major-turn.ts`,
`src/ai/ai-tactics.ts`, `src/app/controllers/player-action-controller.ts`;
Test `tests/systems/city-bombardment-system.test.ts`

- [ ] **Step 1:** Failing tests — naval damage is **bit-identical** to today; a land
  Catapult produces the documented damage; the per-turn cap holds across 1, 4 and 10
  bombardiers; counter-fire applies at distance 1 and not at 2; **no XP is awarded**.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Generalise the resolver to land/naval/air, apply cap + `City.bombardment`
  update + counter-fire, rename the event to `city:bombarded` with a `domain` field.
- [ ] **Step 4:** Run — expect PASS. `yarn build`.
- [ ] **Step 5:** Commit `feat(combat): generalise city bombardment to all domains`.

### Task 2.4: The bombard action, end to end

**Files:** Modify `src/systems/city-interaction.ts`, `src/ui/city-action-preview.ts`,
`src/app/controllers/player-action-controller.ts`, `src/input/selected-unit-highlights.ts`;
Test `tests/systems/city-interaction.test.ts`, `tests/input/`, `tests/app/`

- [ ] **Step 1:** Failing tests — an Archer at distance 2 from a garrisoned enemy city gets
  a `bombard` action labelled `Attack the city — −N HP`; a zero-damage bombard appears in
  `denied` with cause-specific copy (fortifications / garrison / cap spent); bombarding a
  not-at-war civ routes to `confirm-war-city`; a minor-civ city is supported.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement; add the distinct bombard highlight type.
- [ ] **Step 4:** Run `yarn vitest run tests/` for the touched areas — expect PASS.
- [ ] **Step 5:** Commit `feat(combat): let ranged and siege units bombard cities (#966)`.

### Task 2.5: Hold Siege

**Files:** Modify `src/core/types.ts` (`automation` union), `src/core/turn-manager.ts`,
`src/app/controllers/selection-controller.ts`, `src/ui/context-menu.ts`,
`src/ui/selected-unit-info.ts`, `src/ui/unit-stack-panel.ts`;
Test `tests/core/turn-manager.test.ts`

**Interfaces:** `automation?: … | { mode: 'hold-siege'; cityId: string; startedTurn: number }`

- [ ] **Step 1:** Failing tests — a hold-siege unit auto-fires each turn; it cancels on
  each documented trigger (unit damaged, city captured/destroyed, peace, manual order,
  explicit cancel, bombard illegal) and notifies with the reason.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement beside the `auto-explore` branch in `turn-manager.ts`; add the
  order to the context menu and the label to the unit panels.
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit `feat(combat): add Hold Siege automation`.

### Task 2.6: Phase 2 gate

- [ ] Same as Task 1.6, plus: PR 2 body includes `Closes #966`.

---

## Phase 3 — AI parity (PR 3) ✅ merged (#977)

### Task 3.1: Land bombardment candidates and odds-delta scoring

**Files:** Modify `src/ai/ai-tactics.ts`, `src/ai/ai-major-turn.ts`;
Test `tests/ai/ai-tactics.test.ts`

- [ ] **Step 1:** Failing tests — the AI generates `bombard-city` for a land siege unit;
  it does **not** bombard when no capture-capable friendly unit is within
  `AI_BOMBARDMENT_FOLLOWUP_RADIUS`; it prefers bombard over a low-odds assault; it uses the
  same `resolveCityInteraction` legality as the player; it never bombards a fogged city.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `AI_BOMBARDMENT_FOLLOWUP_RADIUS = 3` and score by the Δ
  `winProbability` the bombard buys the best nearby capture-capable unit.
- [ ] **Step 4:** Run `yarn vitest run tests/ai/` — expect PASS.
- [ ] **Step 5:** Commit, then Task 1.6's gate as PR 3.

---

## Phase 4 — Delight (PR 4) ✅ merged (#978)

### Task 4.1: Damage art, SFX, notification, advisor tip

**Files:** Modify `src/renderer/` city rendering, `src/assets/sprite-animations-v2.css`,
the SFX registry, `src/presentation/register-raider-presentation.ts`, the advisor registrar;
Test `tests/renderer/`, `tests/presentation/`

- [ ] **Step 1:** Failing tests — a damaged city renders a damage tier; `city:bombarded`
  routes an era-appropriate SFX; the notification reads `Athens is burning — 32/100`; the
  first-siege advisor tip fires once per viewer with a cooldown.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement, reusing the v2 sprite damage tiers already used for pirate
  enclaves (`.cq-v2[data-kind=...] .cq-tier-*`).
- [ ] **Step 4:** Run — expect PASS.
- [ ] **Step 5:** Commit, then Task 1.6's gate as PR 4.

---

## Documentation (in the phase that introduces each rule)

- [ ] `.claude/rules/game-balance.md` — new "City Attack & Capture" section: the five
  constants with derivations, the action matrix, the ambient-siege vs aimed-shot garrison
  split, and the difficulty-invariance rule. (Phase 2.)
- [ ] Mark the superseded lines in
  `docs/superpowers/specs/2026-05-15-combat-visibility-unit-motion-bug-bundle-design.md`
  and its plan as replaced by this design. (Phase 2.)
- [ ] Tick this plan's phase checkboxes and annotate each `## Phase N` header with
  `✅ merged (#PR)` in the same PR that completes it, per `.claude/rules/spec-fidelity.md`.

## Self-review

- **Spec coverage:** every spec section maps to a task — HP coupling 1.2; resolver 1.4;
  units/capture 1.3; UI 1.5; siege options 2.1; field+regen+migration 2.2; resolver
  generalisation + events 2.3; action + denial + war-confirm + minor-civ 2.4; Hold Siege
  2.5; AI 3.1; delight 4.1; docs in the Documentation section. The minor-civ narrowing
  needed by 2.4 is delivered early in 1.1, which is why that refactor leads.
- **Placeholders:** none — every code step carries real code or an exact command.
- **Type consistency:** `getCityIntrinsicStrength(city, defenderCompletedTechs, domain)`,
  `getEffectiveCityAssaultDefense(city, defenderCompletedTechs)`, `cityHpDefenseScale(city)`,
  `resolveCityInteraction(state, unit, city)`, `CityAction`, `CityInteraction`, and
  `City.bombardment` are used with identical names and shapes in every task that
  references them.
