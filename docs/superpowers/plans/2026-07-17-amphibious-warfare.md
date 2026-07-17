# Amphibious Warfare Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement issue #540: embarked coastal attacks, Marine specialization, bounded shore bombardment, preview/UI, AI, and safe compatibility.

**Architecture:** transport-system.ts owns validation and atomic cargo detach. An explicit amphibiousAssault combat-context flag drives normal combat and city-siege modifiers; player UI and AI invoke the same path. Marine behavior is catalog data, never a unit-ID branch.

**Tech Stack:** TypeScript, Vitest, DOM UI, event bus, unit/AI/SFX/sprite catalogs.

---

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Eligible cargo beside a visible defended coast | Select cargo and tap target | Target highlights; preview shows Landing -50% and, when eligible, one Shore bombardment +10%. |
| Marine cargo in the same position | Select Marine and tap target | Target and preview appear without a landing-penalty label. |
| Transport has moved beside coast | Select cargo and tap target | Cargo attacks in the same turn, spends its action, and the transport/cargo UI refreshes. |
| Invalid, fogged, inland, friendly, or naval target | Tap target | No highlight or attack confirmation is offered. |
| Second hot-seat human is current player | Select cargo | Only that player’s visible targets, preview, event, and SFX can be presented. |

## Misleading UI Risks

- Show “Assault from transport” only when cargo has an action, belongs to a friendly transport, and has at least one valid coastal target.
- Never show Landing -50% for Marine cargo or shore-support text for a melee, transport, distant, or second supporting ship.
- Use text as well as styling for the penalty; no rule is conveyed by colour alone.
- Every viewer lookup uses state.currentPlayer; fogged data is neither highlighted nor previewed.

### Task 1: Test and implement canonical embarked-assault legality

**Files:**
- Modify: src/systems/transport-system.ts
- Modify: src/systems/attack-targeting.ts
- Test: tests/systems/transport-system.test.ts
- Test: tests/systems/attack-targeting.test.ts

- [ ] **Step 1: Add failing target-legality tests.**

~~~ts
it('allows unspent cargo to attack a visible adjacent coastal defender from its transport', () => {
  const { state, cargo, defender } = embarkedCoastalFixture();
  expect(getEmbarkedAssaultTarget(state, cargo.id, defender.position, { viewerId: cargo.owner }))
    .toMatchObject({ ok: true, targetType: 'unit', transportId: 'transport-1' });
});

it.each(['inland', 'non-coastal-city', 'naval', 'fogged', 'friendly', 'acted'] as const)(
  'rejects a %s embarked assault target',
  kind => expect(getEmbarkedAssaultTarget(...embarkedInvalidTargetFixture(kind))).toMatchObject({ ok: false }),
);
~~~

- [ ] **Step 2: Prove RED.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/transport-system.test.ts tests/systems/attack-targeting.test.ts

Expected: FAIL because getEmbarkedAssaultTarget does not exist.

- [ ] **Step 3: Implement the minimal shared API.**

~~~ts
export function getEmbarkedAssaultTarget(
  state: GameState, cargoUnitId: string, coord: HexCoord, options: AttackTargetOptions = {},
): EmbarkedAssaultTarget | AttackTargetResult;

export function detachCargoForEmbarkedAssault(
  state: GameState, cargoUnitId: string,
): { ok: true; state: GameState; attacker: Unit; transportId: string } | { ok: false; state: GameState };
~~~

Validate cargo ownership/action, transport relation, water origin, target coast, visibility,
hostility, and normal attack profile before mutation. Add attackOrigin?: HexCoord to
AttackTargetOptions, used only by this helper to evaluate range from the transport.
Detach removes both cargo references only after legality passes.

- [ ] **Step 4: Prove GREEN and commit.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/transport-system.test.ts tests/systems/attack-targeting.test.ts

Expected: PASS for valid assault and every negative case.

~~~bash
git add src/systems/transport-system.ts src/systems/attack-targeting.ts tests/systems/transport-system.test.ts tests/systems/attack-targeting.test.ts
git commit -m "feat(combat): allow embarked coastal targeting"
~~~

### Task 2: Test and implement shared landing, support, and Marine data

**Files:**
- Modify: src/core/types.ts
- Modify: src/systems/combat-context.ts, src/systems/combat-system.ts, src/systems/city-siege-system.ts
- Modify: src/systems/unit-system.ts, src/systems/city-system.ts, src/systems/unit-modifier-definitions.ts, src/systems/unit-modifier-system.ts, src/systems/tech-definitions-eras5-7.ts
- Modify: src/renderer/sprites/sprite-catalog.ts, src/audio/sfx-catalog.ts
- Test: tests/systems/combat-system.test.ts, tests/systems/city-siege-system.test.ts, tests/systems/unit-modifier-system.test.ts, tests/systems/city-system.test.ts, tests/systems/tech-definitions.test.ts, tests/systems/unit-chain-integrity.test.ts

- [ ] **Step 1: Add failing combat, city, and catalog tests.**

~~~ts
it('labels and applies a 50 percent landing multiplier', () => {
  const { state, attacker, defender } = landingFixture('warrior');
  const context = buildCombatContextForDefender(state, attacker, defender, { amphibiousAssault: true });
  expect(calculateCombatStrengths(attacker, defender, state.map, context).attackerModifierParts)
    .toContainEqual({ label: 'Landing -50%', kind: 'mult' });
});

it('defines the Marine as a coastal era-5 cargo specialist', () => {
  expect(UNIT_DEFINITIONS.marine).toMatchObject({ strength: 36, domain: 'land' });
  expect(TRAINABLE_UNITS.find(unit => unit.type === 'marine'))
    .toMatchObject({ cost: 135, techRequired: 'amphibious-warfare', coastalRequired: true, upgradesTo: 'machine_gunner' });
});
~~~

Also assert a Marine cancels only the generic landing multiplier, shore support is one
+10% bonus, city siege receives the same modifier parts, and all definition-driven
AI/research/sprite/SFX/upgrade catalogs contain Marine.

- [ ] **Step 2: Prove RED.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/systems/city-siege-system.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/unit-chain-integrity.test.ts

Expected: FAIL because neither amphibious context nor Marine exists.

- [ ] **Step 3: Add generic context and catalog data.**

Add amphibiousAssault?: boolean to combat/modifier context. The shared context:
- adds Landing -50% and multiplier 0.5 when true;
- adds one Shore bombardment +10% and multiplier 1.1 only when an adjacent,
  friendly, untransported naval ranged or bombard unit exists;
- feeds those modifier parts to both unit and city calculations.

Add marine to UnitType, definitions, trainables, tech unlocks, class and AI
catalogs, description, sprite, and SFX. Use this modifier row:

~~~ts
{ source: 'unit', unitTypes: ['marine'], effect: 'combatStrength', when: 'attacking',
  condition: 'amphibiousAssault', mode: 'multiplier', value: 2, label: 'Marine landing training' }
~~~

Reuse the established gunpowder infantry sprite and SFX asset identifiers.

- [ ] **Step 4: Prove GREEN and commit.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/systems/city-siege-system.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/city-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/unit-chain-integrity.test.ts

Expected: PASS for landing, Marine exemption, city parity, non-stacking support, and all catalogs.

~~~bash
git add src/core/types.ts src/systems/combat-context.ts src/systems/combat-system.ts src/systems/city-siege-system.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/unit-modifier-definitions.ts src/systems/unit-modifier-system.ts src/systems/tech-definitions-eras5-7.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/systems
git commit -m "feat(combat): add amphibious landing modifiers and marines"
~~~

### Task 3: Test and wire player, hot-seat, event/SFX, and AI parity

**Files:**
- Modify: src/main.ts, src/input/selected-unit-highlights.ts, src/ai/ai-tactics.ts
- Test: tests/input/selected-unit-highlights.test.ts, tests/ui/combat-preview.test.ts, tests/systems/viewer-event-presentation.test.ts, tests/ai/ai-tactics.test.ts, tests/simulation/ai-playability.test.ts

- [ ] **Step 1: Add failing UI, hot-seat, and AI tests.**

~~~ts
it('renders landing and bounded shore-support labels before cargo attacks', async () => {
  const screen = renderEmbarkedAssaultFixture({ shoreSupport: true });
  await screen.tapTarget({ q: 1, r: 0 });
  expect(screen.text()).toContain('Landing -50%');
  expect(screen.text()).toContain('Shore bombardment +10%');
});

it.each(['explorer', 'standard', 'veteran'] as const)('ranks a legal assault on %s', challenge => {
  expect(rankUnitTacticalActions(embarkedAIContext(challenge), 'cargo-1'))
    .toContainEqual(expect.objectContaining({ action: expect.objectContaining({ kind: 'amphibious-assault' }) }));
});
~~~

Add a hot-seat fixture that changes currentPlayer and proves fogged targets, preview,
notification, and SFX presentation are absent. Add execution assertions that cargo is
detached, exactly one combat:resolved event is emitted, and the selected panel rerenders.

- [ ] **Step 2: Prove RED.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/ui/combat-preview.test.ts tests/systems/viewer-event-presentation.test.ts tests/ai/ai-tactics.test.ts tests/simulation/ai-playability.test.ts

Expected: FAIL because cargo does not currently target or execute attacks.

- [ ] **Step 3: Wire every caller to the canonical path.**

For selected cargo, build highlights and preview from getEmbarkedAssaultTarget; for
ordinary units retain getAttackTargets. In player unit and city attack handlers,
validate, detach, then invoke existing resolve/apply/event/reward flows with
amphibiousAssault true. Use buildCombatPresentation and emit exactly one
combat:resolved event; do not add an alternate SFX path. Update HUD, renderer, and
selected unit after mutation with normal refresh calls.

Add amphibious-assault to AITacticalAction. Rank legal targets with the same context
and deterministic preview; execute via the same detach/resolve/apply path, respecting
existing death-risk and retreat logic.

- [ ] **Step 4: Prove GREEN and commit.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/input/selected-unit-highlights.test.ts tests/ui/combat-preview.test.ts tests/systems/viewer-event-presentation.test.ts tests/ai/ai-tactics.test.ts tests/simulation/ai-playability.test.ts

Expected: PASS for UI replay, same-turn transport movement, current-player privacy,
single event/SFX presentation, and legal AI behavior at all difficulties.

~~~bash
git add src/main.ts src/input/selected-unit-highlights.ts src/ai/ai-tactics.ts tests/input/selected-unit-highlights.test.ts tests/ui/combat-preview.test.ts tests/systems/viewer-event-presentation.test.ts tests/ai/ai-tactics.test.ts tests/simulation/ai-playability.test.ts
git commit -m "feat(ai): execute amphibious assaults"
~~~

### Task 4: Verify save compatibility and complete change

**Files:**
- Modify: tests/storage/save-migrations.test.ts
- Modify: tests/audio/sfx-catalog.test.ts and existing sprite catalog coverage test

- [ ] **Step 1: Add failing compatibility test.**

~~~ts
it('loads an embarked-cargo save idempotently without a schema bump', () => {
  const loaded = migrateSaveToCurrent(structuredClone(embarkedCargoSaveFixture(CURRENT_SAVE_SCHEMA_VERSION)));
  expect(loaded.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  expect(loaded.units.cargo!.transportId).toBe('transport-1');
  expect(migrateSaveToCurrent(structuredClone(loaded))).toEqual(loaded);
  expect(UNIT_DEFINITIONS.marine.name).toBe('Marine');
});
~~~

- [ ] **Step 2: Prove RED, then preserve schema stability.**

Run: bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/audio/sfx-catalog.test.ts

Expected: FAIL until Marine catalog data exists. Do not increment
CURRENT_SAVE_SCHEMA_VERSION: the feature adds no serialized state field.

- [ ] **Step 3: Run required checks and inspect both diffs.**

~~~bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/transport-system.ts src/systems/attack-targeting.ts src/systems/combat-context.ts src/systems/combat-system.ts src/systems/city-siege-system.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/unit-modifier-definitions.ts src/systems/unit-modifier-system.ts src/ai/ai-tactics.ts src/main.ts
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn build
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
~~~

Expected: all checks exit 0. Inspect committed and uncommitted source diffs before completion.

- [ ] **Step 4: Commit final regression coverage.**

~~~bash
git add tests/storage/save-migrations.test.ts tests/audio/sfx-catalog.test.ts
git commit -m "test(combat): cover amphibious warfare compatibility"
~~~

## Plan self-review

- Tasks 1 through 4 cover every approved requirement: legality and integrity; combat and content data; player, AI, hot-seat, event and SFX behavior; then save compatibility and full regression checks.
- No requirements are deferred. amphibiousAssault, getEmbarkedAssaultTarget, and detachCargoForEmbarkedAssault use the same names throughout.

## Implementation Review Corrections (required for Sonnet 4.5)

### Caller and state-transition contract

Before editing, read these full call paths: `src/input/selected-unit-highlights.ts`,
`src/main.ts` (`selectUnit`, `executeAttack`, and `beginPlayerCityAssault`),
`src/systems/city-capture-system.ts` (`beginMajorCityAssault` and
`beginPlayerCityAssaultChoice`), and `src/ai/ai-tactics.ts`. Do not create a
second attack resolver or copy combat formulas into any caller.

An embarked **unit** assault must follow this precise order:

1. Validate the cargo/transport/target without mutation.
2. Detach cargo in a new immutable state, placing its effective attacker at the
   transport origin and removing both cargo references.
3. Build `buildCombatContextForDefender(..., { amphibiousAssault: true })`,
   resolve combat once, emit one `combat:resolved` event using the pre-outcome
   viewer presentation, and apply the existing combat outcome once.
4. Refresh selection, renderer, HUD, notifications, rewards, and quest updates
   through their current paths. If validation fails, leave every cargo reference
   and selection untouched.

An embarked **city** assault must detach through the same transport helper, then
pass an explicit `amphibiousAssault` option through `beginPlayerCityAssault`,
`beginPlayerCityAssaultChoice`, and `beginMajorCityAssault` to
`calculateCityAssaultStrengths`. It must retain the existing city-capture and
counter-fire lifecycle; do not emit a synthetic `combat:resolved` event for a
city siege that does not normally emit one.

### Correct file and test scope

Update Task 3's file list to include:

- `src/systems/city-capture-system.ts`
- `tests/systems/city-capture-system.test.ts`
- `tests/integration/hot-seat-unit-persistence.test.ts`

Modify `buildSelectedUnitHighlights` to obtain cargo targets from the canonical
embarked helper. `main.ts` must consume those returned target details for both
unit and city preview/confirmation; it must not recompute a different target
list. A cargo city target needs a dedicated assault-target branch because city
attacks currently originate from movement/tap intent, while the cargo's stored
position is water.

### Balance, game feel, and difficulty gates

- Preserve the fixed 0.5 landing multiplier for every difficulty and player.
  Do not add hidden combat bonuses or randomness beyond the existing seeded
  resolution.
- A support fleet is preparation, not a stack exploit: assert zero support from
  transports/melee/distant/embarked ships and exactly one 1.1 multiplier from
  any number of eligible adjacent ships.
- Preserve both play styles: an ordinary land unit can still unload and wait;
  direct assault trades safety for tempo; a Marine pays a production premium for
  its specialized tempo advantage.
- Run tactical ranking/execution assertions on explorer, standard, and veteran.
  The assertion is legal deterministic behavior, not that every difficulty must
  choose the same priority score.

### UX, privacy, sound, and data gates

- Use `createGameButton()` for any newly introduced control and `textContent`
  for every dynamic label; do not add `innerHTML` for this feature.
- Keep the target, preview, notification, and SFX audience derived from
  `state.currentPlayer` and `buildCombatPresentation`. Test a human-vs-human
  handoff with a target visible only to the outgoing player.
- Register Marine explicitly in the sprite and SFX catalogs, reusing established
  infantry assets. Verify the generic event drives sound only for its allowed
  viewer; do not add a global landing sound.
- Marine and the amphibious context are definition/runtime data, not persisted
  state. Keep the save schema unchanged; assert an existing embarked-cargo save
  loads twice identically and retains valid cargo links.

### Drift-check and completion gates

Before every slice commit, compare the canonical player and AI calculation:

```bash
rg -n "getEmbarkedAssaultTarget|detachCargoForEmbarkedAssault|amphibiousAssault" src tests
git diff --check
```

The search must show one eligibility helper, one detach helper, and shared
combat-context construction at every player/AI caller. Before reporting done,
inspect both `git diff origin/main...HEAD` and `git diff`; run the source-rule
check, targeted tests, full test suite, and production build.
