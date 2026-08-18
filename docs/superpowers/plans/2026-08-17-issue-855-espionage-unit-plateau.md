# Issue #855 Espionage Unit Plateau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Repo policy override: this project's CLAUDE.md prohibits subagents/parallel agents — do NOT use superpowers:subagent-driven-development here regardless of what it recommends elsewhere. Execute every task inline in the current session.**

**Goal:** Close the 8-era `spy_operative` plateau (era 4 → era 12) by inserting two new spy tiers — `spy_intelligence_officer` (era 7) and `spy_station_chief` (era 9) — fully wired end-to-end, shipped as two sequential phase PRs.

**Architecture:** Two new `UnitType` values slot into the existing linear spy upgrade chain (`obsoletedByTech(N) === techRequired(N+1)`, the established convention for every chain in `TRAINABLE_UNITS`). All spy-specific behavior (detection, AI usage, UI action buttons, minor-civ/barbarian exclusion) is catalog-driven off allowlists keyed by `UnitType`, not unit-type-specific code — so most of the wiring is "add to N tables," not new logic.

**Tech Stack:** TypeScript, Vitest, JSDOM. No new dependencies.

## Global Constraints

- No `Math.random()` — this feature adds no new randomness, so N/A, but any test RNG must use the repo's seeded helpers if added.
- `obsoletedByTech(N)` must exactly equal `techRequired(N+1)` — the codebase-wide convention verified across every existing `TRAINABLE_UNITS` chain.
- No `cityYieldBonus`/`civYieldBonus` — these are units, not wonders/national projects; N/A.
- `Tech.unlocks` text may never contain a bare unit/building name (`tests/systems/tech-unlocks-consistency.test.ts` enforces this) — entity names go only in `unlocksUnits`.
- Every claim in a `publicFacts` entry must be mechanically true — verify the underlying stat/formula before writing the string (`.claude/rules/content-description-honesty.md`).
- `yarn test` and `yarn build` must both exit 0 before any push, per repo policy (`require-green-before-push` hook).
- Run commands via `bash scripts/run-with-mise.sh yarn <cmd>` — never bare `yarn` or `eval "$(mise activate bash)"`.

---

## File map

**Phase 1 — `spy_intelligence_officer` (era 7, `covert-operations`)**

- `src/systems/city-system.ts` — `TRAINABLE_UNITS` (new entry + retarget `spy_operative`), `PRODUCTION_ICONS`
- `src/systems/unit-system.ts` — `UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`
- `src/systems/tech-definitions-eras5-7.ts` — `covert-operations.unlocksUnits`
- `src/systems/espionage-system.ts` — `SPY_UNIT_TYPES`
- `src/systems/unit-modifier-definitions.ts` — `UNIT_CLASS_BY_TYPE`
- `src/systems/minor-civ-economy-system.ts` — `UNSAFE_UNIT_TYPES`
- `src/systems/barbarian-roster.ts` — `BARBARIAN_ELIGIBILITY_BY_UNIT`
- `src/systems/combat-role-definitions.ts` — `UNIT_ROLE_DEFINITIONS` (with `publicFacts`)
- `src/renderer/sprites/units.tsx` — new `SpyIntelligenceOfficerSprite`
- `src/renderer/sprites/sprite-catalog.ts` — `UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`
- `src/renderer/unit-renderer.ts`, `src/renderer/unit-visual-resolver.ts` — icons
- `src/audio/sfx-catalog.ts` — `UNIT_SFX` (temporary reuse), locomotion map
- Tests: `tests/systems/unit-chain-integrity.test.ts`, `tests/integration/spy-lifecycle.test.ts`, `tests/systems/barbarian-roster.test.ts`, `tests/systems/minor-civ-economy-system.test.ts`, `tests/ui/city-panel.test.ts`, `tests/audio/sfx-catalog.test.ts`, `tests/systems/espionage-system.test.ts`, `tests/systems/unit-upgrade-system.test.ts`

**Phase 2 — `spy_station_chief` (era 9, `counterintelligence`)**: same file set, plus retargeting `spy_intelligence_officer`'s `obsoletedByTech`/`upgradesTo` (set as terminal in Phase 1).

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Civ has `cryptography` but not `covert-operations`; city production list open | Civ completes `covert-operations` | `Operative` disappears from the build list; `Intelligence Officer` appears with cost 140 and its `publicFacts` line |
| Civ owns an `Operative` unit; city with the unit selected | Civ completes `covert-operations`, unit still in a city | Selected-unit panel shows an "Upgrade" action to `Intelligence Officer` for 70g (50% of 140) |
| Civ owns an `Intelligence Officer` | Spy is stationed in an enemy city, mission menu opened | Mission success % reflects the 0.77 base (higher than an Operative would show) |
| Barbarian camp reaches era 7+ | Roster generation runs | `spy_intelligence_officer` never appears in `getBarbarianRosterForEra` output |
| Minor civ evaluates its defensive unit roster | Minor civ has `covert-operations` | `spy_intelligence_officer` is never selected as a "safe" defensive unit |

## Interaction Replay Checklist

- Train `Operative` pre-`covert-operations`, confirm it stays in queue and completes normally.
- Research `covert-operations` mid-queue with an `Operative` still queued — confirm silent dequeue (per `processCity`'s tech-gated dequeue), not a stuck/invalid queue entry.
- Complete `covert-operations`, reopen city panel — confirm `Intelligence Officer` is the only spy unit now offered.
- Train an `Intelligence Officer`, end turn — confirm a matching `state.espionage[civId].spies[...]` record exists with the same id.
- Kill the unit — confirm the spy record is cleaned up (no zombie) via the existing generic death-cleanup path in `main.ts`.
- Two-civ hot-seat: civ A researches `covert-operations` and trains the unit; confirm civ B's production list and spy state are untouched.

---

# Phase 1: `spy_intelligence_officer`

### Task 1: Core unit definition and chain restructuring

**Files:**
- Modify: `src/systems/city-system.ts:1212` (`TRAINABLE_UNITS`), `PRODUCTION_ICONS` (~line 1524)
- Modify: `src/systems/unit-system.ts:173-177` (`UNIT_DEFINITIONS`), `:800` (`UNIT_DESCRIPTIONS`)
- Modify: `src/systems/tech-definitions-eras5-7.ts:389-391` (`covert-operations`)
- Modify: `src/systems/combat-role-definitions.ts` (minimal `UNIT_ROLE_DEFINITIONS` entry with
  `terminalReason` only — see the correction note after Step 4; Task 3 later adds `publicFacts`
  to this same entry)
- Test: `tests/systems/unit-chain-integrity.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts` (existing, must pass), `tests/systems/city-system.test.ts` (icon coverage + `'#429 — unit obsolescence completeness'`, existing, must pass)

**Interfaces:**
- Produces: `UnitType` value `'spy_intelligence_officer'`, consumed by every later task in this phase.

- [ ] **Step 1: Add `spy_intelligence_officer` to `UnitType` in `src/core/types.ts`**

Find the line (currently around line 367):
```ts
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
```
Change to:
```ts
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_intelligence_officer' | 'spy_hacker'
```

- [ ] **Step 2: Write the failing chain-integrity test**

Add to `tests/systems/unit-chain-integrity.test.ts`, inside a new `describe` block (place after the existing `'early-modern mounted upgrade chain'` block):

```ts
describe('spy plateau fix — era 7 Intelligence Officer', () => {
  it('redirects Operative through Intelligence Officer before Hacker', () => {
    const operative = TRAINABLE_UNITS.find(unit => unit.type === 'spy_operative');
    const intelOfficer = TRAINABLE_UNITS.find(unit => unit.type === ('spy_intelligence_officer' as UnitType));

    expect(operative).toMatchObject({ obsoletedByTech: 'covert-operations', upgradesTo: 'spy_intelligence_officer' });
    expect(intelOfficer).toMatchObject({
      cost: 140,
      techRequired: 'covert-operations',
    });
    expect(UNIT_DEFINITIONS['spy_intelligence_officer' as UnitType]).toMatchObject({
      strength: 7,
      movementPoints: 3,
      visionRange: 3,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts`
Expected: FAIL — `operative` still has `obsoletedByTech: 'cyber-warfare'`, and `intelOfficer` is `undefined`.

- [ ] **Step 4: Retarget `spy_operative` and add `spy_intelligence_officer` to `TRAINABLE_UNITS`**

In `src/systems/city-system.ts`, change line 1212 from:
```ts
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'cyber-warfare', upgradesTo: 'spy_hacker' },
```
to:
```ts
  { type: 'spy_operative', name: 'Operative', cost: 90, techRequired: 'cryptography', obsoletedByTech: 'covert-operations', upgradesTo: 'spy_intelligence_officer' },
  { type: 'spy_intelligence_officer', name: 'Intelligence Officer', cost: 140, techRequired: 'covert-operations', obsoletedByTech: 'counterintelligence', upgradesTo: 'spy_station_chief' },
```

(`obsoletedByTech: 'counterintelligence'` and `upgradesTo: 'spy_station_chief'` are forward-looking to Phase 2 — `spy_station_chief` does not exist yet, so this is intentionally temporarily "dangling." Step 6 below adds a terminal placeholder so Phase 1 ships correctly on its own; Phase 2 Task 1 replaces it.)

Since `spy_station_chief` won't exist until Phase 2, Phase 1 must ship `spy_intelligence_officer` as terminal instead — use this line for Phase 1 only:
```ts
  { type: 'spy_intelligence_officer', name: 'Intelligence Officer', cost: 140, techRequired: 'covert-operations' },
```
(No `obsoletedByTech`/`upgradesTo` yet — Phase 2 Task 1 adds both when `spy_station_chief` is introduced.)

**Correction found during execution:** a completeness test not identified while writing this plan —
`tests/systems/city-system.test.ts`'s `'#429 — unit obsolescence completeness'` — requires every
non-utility, positive-strength `TRAINABLE_UNITS` entry with no `obsoletedByTech` to have a
`terminalReason` in its `UNIT_ROLE_DEFINITIONS` entry (`TERMINAL_COMBAT_UNITS` is derived
automatically from that field). Since `spy_intelligence_officer` ships temporarily terminal in
Phase 1, this step must also add a minimal `UNIT_ROLE_DEFINITIONS` entry now (pulled forward from
Task 3, which adds `publicFacts` to the same entry later) — insert into
`src/systems/combat-role-definitions.ts` after the `spy_operative: civilian(...)` line:
```ts
  spy_intelligence_officer: role('civilian', 'Senior spy that runs covert operations with better odds than an Operative.', ['espionage'], {
    counters: [], vulnerableTo: [],
    upgradeFamily: 'espionage',
    terminalReason: 'No further upgrade currently available.',
  }),
```
`terminalReason` is player-facing (rendered with a 🏁 icon by `unit-role-presentation.ts`), so
phrase it as presently-true rather than permanent — unlike `spy_hacker`'s genuinely-permanent
"Terminal tier of the espionage chain with no later replacement." Phase 2 Task 1 removes this
field once `spy_intelligence_officer` gets a real `obsoletedByTech` (a sibling completeness test,
`'TERMINAL_COMBAT_UNITS does not list a unit that already has obsoletedByTech'`, fails if it's
left in place after that).

- [ ] **Step 5: Add `PRODUCTION_ICONS` entry**

In `src/systems/city-system.ts`, near line 1524 (`spy_operative: '🎯',`), add:
```ts
  spy_intelligence_officer: '🗂️',
```

- [ ] **Step 6: Add `UNIT_DEFINITIONS` entry**

In `src/systems/unit-system.ts`, after the `spy_operative` block (~line 177), add:
```ts
  spy_intelligence_officer: {
    type: 'spy_intelligence_officer', name: 'Intelligence Officer', movementPoints: 3,
    visionRange: 3, strength: 7, canFoundCity: false,
    canBuildImprovements: false, productionCost: 140,
  },
```

- [ ] **Step 7: Add `UNIT_DESCRIPTIONS` entry**

In `src/systems/unit-system.ts`, after the `spy_operative` line (~line 800), add:
```ts
  spy_intelligence_officer: 'Senior field spy who runs covert operations against rival powers. Trained to sabotage, steal, and disrupt with greater success than an Operative.',
```

- [ ] **Step 8: Add `unlocksUnits` to `covert-operations`**

In `src/systems/tech-definitions-eras5-7.ts`, change:
```ts
  { id: 'covert-operations', name: 'Covert Operations', track: 'espionage', cost: 145,
    prerequisites: ['counter-espionage', 'propaganda'],
    unlocks: ['+2 spy slots empire-wide; covert missions have +15% success rate', "Spy mission: sabotage a rival's crisis relief"], era: 7 },
```
to:
```ts
  { id: 'covert-operations', name: 'Covert Operations', track: 'espionage', cost: 145,
    prerequisites: ['counter-espionage', 'propaganda'],
    unlocks: ['+2 spy slots empire-wide; covert missions have +15% success rate', "Spy mission: sabotage a rival's crisis relief"],
    unlocksUnits: ['spy_intelligence_officer'], era: 7 },
```

- [ ] **Step 9: Run the chain-integrity test again**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts`
Expected: PASS

- [ ] **Step 10: Run tech-unlocks-consistency and city-system icon-coverage tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/tech-unlocks-consistency.test.ts tests/systems/city-system.test.ts`
Expected: PASS (these are generic completeness tests — Steps 5 and 8 are what makes them pass)

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/systems/city-system.ts src/systems/unit-system.ts src/systems/tech-definitions-eras5-7.ts src/systems/combat-role-definitions.ts tests/systems/unit-chain-integrity.test.ts
git commit -m "feat(espionage): add spy_intelligence_officer unit (era 7 plateau fix, part 1)"
```

---

### Task 2: Spy-identity allowlists

**Files:**
- Modify: `src/systems/espionage-system.ts:201-203` (`SPY_UNIT_TYPES`)
- Modify: `src/systems/unit-modifier-definitions.ts:69-73` (`UNIT_CLASS_BY_TYPE`)
- Modify: `src/systems/minor-civ-economy-system.ts:70-80` (`UNSAFE_UNIT_TYPES`)
- Modify: `src/systems/barbarian-roster.ts:52` (`BARBARIAN_ELIGIBILITY_BY_UNIT`)
- Test: `tests/integration/spy-lifecycle.test.ts`, `tests/systems/barbarian-roster.test.ts`, `tests/systems/minor-civ-economy-system.test.ts`

**Interfaces:**
- Consumes: `UnitType` `'spy_intelligence_officer'` from Task 1.
- Produces: `isSpyUnitType('spy_intelligence_officer')` returns `true`; the unit is barbarian-`unsupported` and minor-civ-`unsafe`.

- [ ] **Step 1: Write the failing spy-record-creation test**

Add to `tests/integration/spy-lifecycle.test.ts` (reuse the existing `makeBaseState` helper, just change the queued unit and required tech):

```ts
it('trains spy_intelligence_officer and creates matching Spy record with same id', () => {
  const state = makeBaseState();
  state.cities['city-player'].productionQueue = ['spy_intelligence_officer'];
  state.civilizations.player.techState.completed = ['covert-operations'];
  const bus = new EventBus();
  const newState = processTurn(state, bus);

  const units = Object.values(newState.units).filter(u => u.type === 'spy_intelligence_officer');
  expect(units).toHaveLength(1);

  const spies = Object.values(newState.espionage!['player'].spies);
  expect(spies).toHaveLength(1);
  expect(spies[0].id).toBe(units[0].id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts`
Expected: FAIL — `units` has length 1 (the plain `Unit` is created generically), but `spies` has length 0, because `isSpyUnitType('spy_intelligence_officer')` is currently `false`.

- [ ] **Step 3: Add to `SPY_UNIT_TYPES`**

In `src/systems/espionage-system.ts`, change:
```ts
const SPY_UNIT_TYPES = new Set<UnitType>([
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
]);
```
to:
```ts
const SPY_UNIT_TYPES = new Set<UnitType>([
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_intelligence_officer', 'spy_hacker',
]);
```

- [ ] **Step 4: Add to `UNIT_CLASS_BY_TYPE`**

In `src/systems/unit-modifier-definitions.ts`, after the `spy_operative: ['spy'],` line (~73), add:
```ts
  spy_intelligence_officer: ['spy'],
```

- [ ] **Step 5: Run the spy-lifecycle test again**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 6: Add to `UNSAFE_UNIT_TYPES`**

In `src/systems/minor-civ-economy-system.ts`, inside the `UNSAFE_UNIT_TYPES` set (~line 70-80), after `'spy_operative',`, add:
```ts
  'spy_intelligence_officer',
```

- [ ] **Step 7: Write the failing minor-civ exclusion test**

Add to `tests/systems/minor-civ-economy-system.test.ts`:

```ts
import { SAFE_MINOR_CIV_UNIT_TYPES } from '@/systems/minor-civ-economy-system';
// (add to existing import block if one already exists for this module)

it('never treats the new spy tier as a safe minor-civ defensive unit', () => {
  expect(SAFE_MINOR_CIV_UNIT_TYPES.has('spy_intelligence_officer')).toBe(false);
});
```

If `SAFE_MINOR_CIV_UNIT_TYPES` is not currently exported from `minor-civ-economy-system.ts`, add `export` to its declaration (it is a `const` derived from `TRAINABLE_UNITS` minus `UNSAFE_UNIT_TYPES` — exporting it does not change its value).

- [ ] **Step 8: Run test to verify it passes** (Step 6 already makes this true — this step exists to prove it, not to fix a new failure)

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/minor-civ-economy-system.test.ts`
Expected: PASS

- [ ] **Step 9: Add to `BARBARIAN_ELIGIBILITY_BY_UNIT`**

In `src/systems/barbarian-roster.ts`, change line 52 from:
```ts
  spy_scout: exclude('unsupported'), spy_informant: exclude('unsupported'), spy_agent: exclude('unsupported'), spy_operative: exclude('unsupported'), spy_hacker: exclude('unsupported'),
```
to:
```ts
  spy_scout: exclude('unsupported'), spy_informant: exclude('unsupported'), spy_agent: exclude('unsupported'), spy_operative: exclude('unsupported'), spy_intelligence_officer: exclude('unsupported'), spy_hacker: exclude('unsupported'),
```

(This is also TypeScript-enforced — `BARBARIAN_ELIGIBILITY_BY_UNIT` is declared `satisfies Record<UnitType, BarbarianEligibility>`, so `yarn build` fails without this entry regardless of tests.)

- [ ] **Step 10: Run barbarian-roster test**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-roster.test.ts`
Expected: PASS (the file's own generic test, `'classifies every current unit definition so future units fail closed'`, covers this automatically — no new test needed here, Step 9 alone satisfies it)

- [ ] **Step 11: Commit**

```bash
git add src/systems/espionage-system.ts src/systems/unit-modifier-definitions.ts src/systems/minor-civ-economy-system.ts src/systems/barbarian-roster.ts tests/integration/spy-lifecycle.test.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat(espionage): wire spy_intelligence_officer into spy-identity allowlists"
```

---

### Task 3: Visible upgrade facts (`publicFacts`)

**Files:**
- Modify: `src/systems/combat-role-definitions.ts` (`UNIT_ROLE_DEFINITIONS`)
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `spy_intelligence_officer`'s `UNIT_DEFINITIONS` strength (7) from Task 1, and the `role()` helper (not `civilian()`) already defined in `combat-role-definitions.ts`.
- Produces: `getUnitRolePresentation('spy_intelligence_officer', completedTechs)?.publicFacts` — consumed by `city-panel.ts` and `selected-unit-info.ts`, both already generic (no changes needed there).

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/city-panel.test.ts`, modeled on the existing `'renders War Elephant public tactical facts'` test:

```ts
it('renders Intelligence Officer public tactical facts in the live production catalog', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.civilizations.player.techState.completed = ['covert-operations'];
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
  });

  expect(panel.querySelector('[data-item-id="spy_intelligence_officer"]')).toBeTruthy();
  const facts = panel.querySelector('[data-unit-role-facts="spy_intelligence_officer"]')?.textContent ?? '';
  expect(facts).toContain('Better base infiltration odds than an Operative');
  expect(facts).toContain('+1 combat strength for self-defense');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts`
Expected: FAIL — `facts` is empty because `spy_intelligence_officer`'s `UNIT_ROLE_DEFINITIONS` entry
(added in Task 1 to satisfy the `'#429 — unit obsolescence completeness'` test, with a
`terminalReason` only) has no `publicFacts` yet, so `getUnitRolePresentation(...)?.publicFacts`
is an empty array.

- [ ] **Step 3: Add `publicFacts` to the existing `UNIT_ROLE_DEFINITIONS` entry**

In `src/systems/combat-role-definitions.ts`, the entry already exists from Task 1 — add `publicFacts` to it:
```ts
  spy_intelligence_officer: role('civilian', 'Senior spy that runs covert operations with better odds than an Operative.', ['espionage'], {
    counters: [], vulnerableTo: [],
    upgradeFamily: 'espionage',
    terminalReason: 'No further upgrade currently available.',
    publicFacts: ['Better base infiltration odds than an Operative', '+1 combat strength for self-defense'],
  }),
```

(Uses `role('civilian', ...)` directly, not the `civilian()` shorthand, because `civilian()`'s signature has no `publicFacts` parameter — see the design doc's "Visibility fix" section for why this fact set was chosen over stating the raw infiltration-base delta.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat-role-definitions.ts tests/ui/city-panel.test.ts
git commit -m "feat(espionage): surface Intelligence Officer's upgrade via publicFacts"
```

---

### Task 4: Sprite and icon rendering

**Files:**
- Modify: `src/renderer/sprites/units.tsx` (new `SpyIntelligenceOfficerSprite`)
- Modify: `src/renderer/sprites/sprite-catalog.ts` (`UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`)
- Modify: `src/renderer/unit-visual-resolver.ts` (`FALLBACK_ICONS` — `unit-renderer.ts` itself has no
  icon map of its own, see the correction note at Step 5)
- Test: `tests/renderer/sprites/v2/index.test.ts` (existing, must pass — no new test needed, see rationale below)

**Interfaces:**
- Consumes: `UnitSpriteProps` type, `spyBase()` helper, `P.*` palette constants — all already defined in `units.tsx`.
- Produces: `UNIT_SPRITE_CATALOG.spy_intelligence_officer`, consumed by `getUnitSpriteV2`'s live-DOM-overlay fallback path.

**Note — corrects an assumption in the design doc:** `getUnitSpriteV2` (`v2/index.ts`) has a tested, permanent live-fallback for any unit type with no hand-authored pre-serialized `UNIT_SPRITES` entry (see `.claude/rules/sprites.md`, "DOM-Overlay Live Fallback For Uncovered Unit Sprites" — added after issue #755 specifically to make this safe). It calls `UNIT_SPRITE_CATALOG` live instead of returning `null`. This means Task 4 does **not** need to touch `v2/index.ts` or `tests/renderer/sprites/sprite-v2.test.ts` — those files import a real `.svg.ts` module by filename, and there isn't one for this new unit yet (generating pre-serialized art is a `generate-sprite-prompt` skill follow-up, not required for this MR to ship correctly). The existing generic test in `tests/renderer/sprites/v2/index.test.ts` that loops `UNIT_SPRITE_CATALOG` and asserts `getUnitSpriteV2` is never `null` will cover the new unit automatically once Step 4 below registers it.

- [ ] **Step 1: Add the sprite component**

In `src/renderer/sprites/units.tsx`, after `SpyOperativeSprite` (~line 874), add:
```tsx
export function SpyIntelligenceOfficerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#141419',
    hat: <path d="M-12,-40 Q0,-45 12,-40 L12,-31 L-12,-31 Z M-14,-31 L14,-31 L14,-29 L-14,-29 Z" fill="#0a0a10" />,
    gadget: (
      <g transform="translate(82 58)">
        <rect x="-5" y="-6" width="10" height="8" rx="0.5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
        <line x1="-3" y1="-3" x2="3" y2="-3" stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="-3" y1="0" x2="3" y2="0" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="4" cy="4" r="1.6" fill={palette.bright} stroke={palette.dark} strokeWidth="0.4" />
      </g>
    ),
  });
}
```

(A dossier/folder gadget with a wax-seal-style accent dot, sitting between Operative's dagger-badge and Hacker's tablet — same `spyBase()` factory every other spy sprite uses, cloak darkened one step further than Operative's `#16161c`.)

- [ ] **Step 2: Register in `UNIT_MOTION_STYLES`**

In `src/renderer/sprites/sprite-catalog.ts`, after `spy_operative: 'humanoid',` (~line 133), add:
```ts
  spy_intelligence_officer: 'humanoid',
```

- [ ] **Step 3: Register in `UNIT_SPRITE_CATALOG`**

In `src/renderer/sprites/sprite-catalog.ts`, after `spy_operative: withMotion('spy_operative', SpyOperativeSprite),` (~line 276), add:
```ts
  spy_intelligence_officer: withMotion('spy_intelligence_officer', SpyIntelligenceOfficerSprite),
```
Add `SpyIntelligenceOfficerSprite` to the existing import from `./units` at the top of the file.

- [ ] **Step 4: Run the v2 fallback coverage test**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts`
Expected: PASS — the generic loop over `UNIT_SPRITE_CATALOG` now includes `spy_intelligence_officer` and confirms `getUnitSpriteV2('spy_intelligence_officer', 'imperials')` is non-null via the live-fallback path.

- [ ] **Step 5: Add `FALLBACK_ICONS` entry**

**Correction found during execution:** `unit-renderer.ts` has no icon map of its own — it
delegates entirely to `resolveUnitVisual` in `unit-visual-resolver.ts`. The original design doc
(inherited from the hand-off doc) listed a separate `unit-renderer.ts` edit that doesn't exist;
only `FALLBACK_ICONS` needs an entry.

In `src/renderer/unit-visual-resolver.ts`, after `spy_operative: '🕵️',` (~line 81), add:
```ts
  spy_intelligence_officer: '🕵️',
```
(Matches this map's own local convention — `spy_agent`/`spy_informant`/`spy_operative` all
collapse to the same generic detective emoji here, unlike `PRODUCTION_ICONS`'s per-tier icons.)

(This map is `Record<UnitType, string>` — TypeScript will fail `yarn build` if this is skipped, so it is self-verifying; no dedicated test needed beyond the build step in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/unit-visual-resolver.ts
git commit -m "feat(espionage): add Intelligence Officer sprite and icon wiring"
```

---

### Task 5: SFX

**Files:**
- Modify: `src/audio/sfx-catalog.ts` (`UNIT_SFX`, locomotion map)
- Modify: `tests/audio/sfx-catalog.test.ts` (`SPY_TYPES`)

**Interfaces:**
- Consumes: the existing `real()` helper and `spy_operative`'s death sound path, both already defined in `sfx-catalog.ts`.
- Produces: `UNIT_SFX.spy_intelligence_officer.death`, checked by the file's own `'every spy type has a death entry'` test once `SPY_TYPES` is extended.

- [ ] **Step 1: Write the failing test**

In `tests/audio/sfx-catalog.test.ts`, change:
```ts
const SPY_TYPES: UnitType[] = ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker'];
```
to:
```ts
const SPY_TYPES: UnitType[] = ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_intelligence_officer', 'spy_hacker'];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-catalog.test.ts`
Expected: FAIL on `'every spy type has a death entry'` — `UNIT_SFX['spy_intelligence_officer']` is `undefined`.

- [ ] **Step 3: Add a temporary reused death SFX entry**

**Correction found during execution:** a fresh `real('sfx-spy_operative-death', ...)` call with
the same id/file strings as `spy_operative`'s entry is a *different object* with matching string
values — this passes `allSfxEntries()`'s reference-based dedup (`Set<TrackEntry>`, checked by
identity) but then fails two separate completeness tests that check id/file **string** uniqueness
across all entries (`'no two entries share the same ID'`, `'no two entries share the same file
path'`), plus a hardcoded total-count test (`allSfxEntries()` returns exactly N entries — bump
this by the delta if it doesn't already account for reused entries). The correct pattern, already
used by `chariot: HORSEMAN_SFX` in this same file, is to reuse the *same object reference*: extract
a small named const and point both unit-type keys at it.

In `src/audio/sfx-catalog.ts`, add a new const near `HORSEMAN_SFX` (~line 75):
```ts
const SPY_OPERATIVE_SFX = {
  death: real('sfx-spy_operative-death', 'audio/sfx/spy_operative-death.ogg', 0.530, 'death'),
};
```
Then in the spy-types block (~line 283), change `spy_operative`'s entry to use it and add
`spy_intelligence_officer` pointing at the same reference:
```ts
  spy_operative: SPY_OPERATIVE_SFX,
  // Temporary reuse of the Operative death cue pending bespoke audio — follow-up issue TBD at
  // implementation time (open a new issue and replace this comment with its number). Reuses the
  // same object reference (not a fresh real() call with matching strings) so allSfxEntries()'s
  // duplicate-id/duplicate-file checks see one shared entry, not two colliding ones.
  spy_intelligence_officer: SPY_OPERATIVE_SFX,
```

- [ ] **Step 4: Add the locomotion tag**

In the same file's locomotion map, after `spy_operative: 'humanoid',` (~line 394), add:
```ts
  spy_intelligence_officer: 'humanoid',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-catalog.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/audio/sfx-catalog.ts tests/audio/sfx-catalog.test.ts
git commit -m "feat(espionage): wire Intelligence Officer SFX (temporary reused death cue)"
```

---

### Task 6: Remaining test-roster lists, paid-upgrade test, hot-seat parity test

**Files:**
- Modify: `tests/systems/espionage-system.test.ts:1634` (local `SPY_TYPES`)
- Test: `tests/systems/unit-upgrade-system.test.ts` (new test), `tests/integration/spy-lifecycle.test.ts` (new hot-seat test)

**Interfaces:**
- Consumes: `canUpgradeUnit`/`getUpgradeCost` from `unit-upgrade-system.ts` (unchanged, fully generic), `processTurn` from `turn-manager.ts`.

- [ ] **Step 1: Extend `espionage-system.test.ts`'s local `SPY_TYPES`**

Change:
```ts
const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_hacker'] as const;
```
to:
```ts
const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_intelligence_officer','spy_hacker'] as const;
```

- [ ] **Step 2: Run test to verify it still passes** (this list feeds a parametrized block — confirm nothing in it assumes exactly 5 tiers)

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/espionage-system.test.ts`
Expected: PASS. If any assertion in that parametrized block hard-codes tier count or ordering, fix the assertion to be tier-count-agnostic rather than skip the new entry.

- [ ] **Step 3: Write the failing paid-upgrade test**

Add to `tests/systems/unit-upgrade-system.test.ts` (create the file if it doesn't already cover this unit — check first with `grep -n "spy_operative" tests/systems/unit-upgrade-system.test.ts`; if a similar existing test exists for another chain, follow its exact fixture shape):

```ts
it('allows upgrading an Operative to an Intelligence Officer once covert-operations is researched', () => {
  const city = { /* ...matches an existing fixture city in this file, owner: 'player', buildings: [] */ } as City;
  const unit = createUnit('spy_operative', 'player', city.position, mkC());
  const result = canUpgradeUnit(unit, city.id, { [city.id]: city }, ['covert-operations'], 200);
  expect(result.canUpgrade).toBe(true);
  expect(result.targetType).toBe('spy_intelligence_officer');
  expect(result.cost).toBe(70); // 50% of Intelligence Officer's 140 production cost
});
```

(Match this file's existing fixture-building conventions exactly rather than inventing a new city shape — copy the nearest existing `canUpgradeUnit` test's setup and only change the unit type, tech, and expected cost.)

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade-system.test.ts`
Expected: FAILs before Task 1/2 land, PASSes now (this task assumes Tasks 1-2 are already committed, which they are at this point in the plan) — this step is a regression lock, not new production code.

- [ ] **Step 5: Write the failing hot-seat parity test**

Add to `tests/integration/spy-lifecycle.test.ts`. Build a two-civ variant of `makeBaseState` inline (copy the existing fixture, add a second civ `'ai-1'` with its own city and empty `techState.completed`):

```ts
it('only the researching civ gets Intelligence Officer access — hot-seat parity', () => {
  const state = makeBaseState();
  state.civilizations.player.techState.completed = ['covert-operations'];
  state.civilizations['ai-1'] = {
    ...state.civilizations.player,
    id: 'ai-1', name: 'AI', cities: ['city-ai'],
    techState: { ...state.civilizations.player.techState, completed: [] },
  };
  state.cities['city-ai'] = { ...state.cities['city-player'], id: 'city-ai', owner: 'ai-1', productionQueue: [] };
  state.espionage!['ai-1'] = { ...createEspionageCivState(), maxSpies: 2 };

  const playerTrainable = getTrainableUnitsForCiv(state.civilizations.player.techState.completed);
  const aiTrainable = getTrainableUnitsForCiv(state.civilizations['ai-1'].techState.completed);

  expect(playerTrainable.some(u => u.type === 'spy_intelligence_officer')).toBe(true);
  expect(aiTrainable.some(u => u.type === 'spy_intelligence_officer')).toBe(false);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts`
Expected: PASS (this proves `getTrainableUnitsForCiv` is keyed purely by the passed `completedTechs`, not any hardcoded player assumption — already true generically, this test locks it in)

- [ ] **Step 7: Commit**

```bash
git add tests/systems/espionage-system.test.ts tests/systems/unit-upgrade-system.test.ts tests/integration/spy-lifecycle.test.ts
git commit -m "test(espionage): lock Intelligence Officer paid-upgrade and hot-seat parity"
```

---

### Task 7: Full verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exit 0. Pay particular attention to `tests/systems/pacing-audit.test.ts` — if it flags `spy_intelligence_officer`'s cost (140) as an era-7 outlier, adjust the cost in Task 1 Step 4 and re-run every test in this phase that asserts the cost value (Task 1 Step 2, Task 6 Step 3).

- [ ] **Step 2: Run the production build (type-check)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0. This is the only path that runs `tsc` — confirms every `Record<UnitType, ...>` map (barbarian eligibility, unit classes, fallback icons, motion styles, sprite catalog) compiles with the new `UnitType` value.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(espionage): add Intelligence Officer spy unit (era 7 plateau fix, phase 1 of 2)" --body "$(cat <<'EOF'
## Summary
- Adds `spy_intelligence_officer` (era 7, gated on `covert-operations`) as the first of two new
  intermediate spy tiers closing the 8-era `spy_operative` plateau (#855).
- Full end-to-end wiring: chain restructuring, spy-identity allowlists (detection/AI/minor-civ/
  barbarian), visible upgrade facts via `publicFacts`, sprite, SFX, and regression tests.

## Out of scope (Phase 2, tracked in the same #855 issue)
- `spy_station_chief` (era 9, `counterintelligence`) — the second new tier.
- `spy_intelligence_officer` currently ships as a terminal unit (no `obsoletedByTech`/`upgradesTo`)
  until Phase 2 adds `spy_station_chief` as its real successor.

## Why this is safe to merge partial
`spy_intelligence_officer` is fully playable and correctly wired on its own: trainable once
`covert-operations` completes, creates a real spy record, detectable, usable by AI, excluded from
barbarian/minor-civ rosters, and upgradable from `Operative` for gold. Shipping it as temporarily
terminal (no further upgrade until Phase 2 lands) is not a dead end — it behaves exactly like
`spy_hacker` does today (also currently terminal) and matches the era-4 plateau's own current
end-state, just one tier improved.

## Test plan
- [x] `yarn test` — full suite green
- [x] `yarn build` — type-check green
- [x] Chain integrity, spy-lifecycle, barbarian/minor-civ exclusion, publicFacts render, paid
      upgrade, and hot-seat parity regression tests added
EOF
)"
```

- [ ] **Step 4: Poll CI and merge once green**

Follow the CI-watch pattern from #853/#854 only if the user has confirmed they want it for this issue too (per the design doc's process notes — it was given verbally in a prior session, not a standing repo policy). Otherwise, hand off to the user for manual review/merge.

---

# Phase 2: `spy_station_chief`

Phase 2 begins only after Phase 1's PR has merged to `main`. Re-sync the worktree to `main` before starting (`git fetch && git rebase origin/main`, resolving per repo policy — do not force-push over unmerged Phase 1 work).

### Task 1: Core unit definition and chain restructuring

**Files:**
- Modify: `src/core/types.ts` (`UnitType`)
- Modify: `src/systems/city-system.ts` (`TRAINABLE_UNITS` — retarget `spy_intelligence_officer`, add `spy_station_chief`, `PRODUCTION_ICONS`)
- Modify: `src/systems/unit-system.ts` (`UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`)
- Modify: `src/systems/tech-definitions-eras9.ts` (`counterintelligence.unlocksUnits`)
- Test: `tests/systems/unit-chain-integrity.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`, `tests/systems/city-system.test.ts`

- [ ] **Step 1: Add `spy_station_chief` to `UnitType`**

In `src/core/types.ts`:
```ts
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_intelligence_officer' | 'spy_station_chief' | 'spy_hacker'
```

- [ ] **Step 2: Write the failing chain-integrity test**

Add to `tests/systems/unit-chain-integrity.test.ts`, extending the `describe('spy plateau fix — era 7 Intelligence Officer', ...)` block added in Phase 1 (rename it to cover both, or add a sibling block):

```ts
describe('spy plateau fix — era 9 Station Chief', () => {
  it('redirects Intelligence Officer through Station Chief before Hacker', () => {
    const intelOfficer = TRAINABLE_UNITS.find(unit => unit.type === ('spy_intelligence_officer' as UnitType));
    const stationChief = TRAINABLE_UNITS.find(unit => unit.type === ('spy_station_chief' as UnitType));
    const hacker = TRAINABLE_UNITS.find(unit => unit.type === 'spy_hacker');

    expect(intelOfficer).toMatchObject({ obsoletedByTech: 'counterintelligence', upgradesTo: 'spy_station_chief' });
    expect(stationChief).toMatchObject({
      cost: 185,
      techRequired: 'counterintelligence',
      obsoletedByTech: 'cyber-warfare',
      upgradesTo: 'spy_hacker',
    });
    expect(hacker?.techRequired).toBe('cyber-warfare');
    expect(UNIT_DEFINITIONS['spy_station_chief' as UnitType]).toMatchObject({
      strength: 8,
      movementPoints: 3,
      visionRange: 4,
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts`
Expected: FAIL — `intelOfficer` currently has no `obsoletedByTech`/`upgradesTo` (Phase 1 shipped it terminal), and `stationChief` is `undefined`.

- [ ] **Step 4: Retarget `spy_intelligence_officer` and add `spy_station_chief`**

In `src/systems/city-system.ts`, change:
```ts
  { type: 'spy_intelligence_officer', name: 'Intelligence Officer', cost: 140, techRequired: 'covert-operations' },
```
to:
```ts
  { type: 'spy_intelligence_officer', name: 'Intelligence Officer', cost: 140, techRequired: 'covert-operations', obsoletedByTech: 'counterintelligence', upgradesTo: 'spy_station_chief' },
  { type: 'spy_station_chief', name: 'Station Chief', cost: 185, techRequired: 'counterintelligence', obsoletedByTech: 'cyber-warfare', upgradesTo: 'spy_hacker' },
```

- [ ] **Step 5: Add `PRODUCTION_ICONS` entry**

After `spy_intelligence_officer: '🗂️',`, add:
```ts
  spy_station_chief: '🧭',
```

- [ ] **Step 6: Add `UNIT_DEFINITIONS` entry**

In `src/systems/unit-system.ts`, after the `spy_intelligence_officer` block, add:
```ts
  spy_station_chief: {
    type: 'spy_station_chief', name: 'Station Chief', movementPoints: 3,
    visionRange: 4, strength: 8, canFoundCity: false,
    canBuildImprovements: false, productionCost: 185,
  },
```

- [ ] **Step 7: Add `UNIT_DESCRIPTIONS` entry**

```ts
  spy_station_chief: 'Veteran spy commanding an intelligence network. Runs the most demanding covert operations with better odds than an Intelligence Officer.',
```

- [ ] **Step 8: Add `unlocksUnits` to `counterintelligence`**

In `src/systems/tech-definitions-eras9.ts`, change:
```ts
  { id: 'counterintelligence', name: 'Counterintelligence', track: 'espionage', cost: 190,
    prerequisites: ['political-intelligence', 'disinformation-bureau'],
    unlocks: ['Enemy spy missions in your cities suffer -30% success rate; double-agent networks protect secrets', 'Spy mission: intercept a rival empire\'s troop dispositions, empire-wide'], era: 9 },
```
to:
```ts
  { id: 'counterintelligence', name: 'Counterintelligence', track: 'espionage', cost: 190,
    prerequisites: ['political-intelligence', 'disinformation-bureau'],
    unlocks: ['Enemy spy missions in your cities suffer -30% success rate; double-agent networks protect secrets', 'Spy mission: intercept a rival empire\'s troop dispositions, empire-wide'],
    unlocksUnits: ['spy_station_chief'], era: 9 },
```

- [ ] **Step 9: Remove `spy_intelligence_officer`'s now-stale `terminalReason`**

Phase 1 added a `terminalReason: 'No further upgrade currently available.'` to
`spy_intelligence_officer`'s `UNIT_ROLE_DEFINITIONS` entry in `src/systems/combat-role-definitions.ts`
to satisfy `'#429 — unit obsolescence completeness'` while it had no real successor. Now that
Step 4 above gives it `obsoletedByTech`, that field is both inaccurate (a real upgrade now exists)
and will fail the sibling test `'TERMINAL_COMBAT_UNITS does not list a unit that already has
obsoletedByTech (no contradictory entries)'`. Delete the `terminalReason` line, keeping
`publicFacts` (added in Phase 1 Task 3) intact:
```ts
  spy_intelligence_officer: role('civilian', 'Senior spy that runs covert operations with better odds than an Operative.', ['espionage'], {
    counters: [], vulnerableTo: [],
    upgradeFamily: 'espionage',
    publicFacts: ['Better base infiltration odds than an Operative', '+1 combat strength for self-defense'],
  }),
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/city-system.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/systems/city-system.ts src/systems/unit-system.ts src/systems/tech-definitions-eras9.ts src/systems/combat-role-definitions.ts tests/systems/unit-chain-integrity.test.ts
git commit -m "feat(espionage): add spy_station_chief unit (era 9 plateau fix, part 2)"
```

---

### Task 2: Spy-identity allowlists

**Files:** same four files as Phase 1 Task 2, plus their tests.

- [ ] **Step 1: Write the failing spy-record-creation test**

Add to `tests/integration/spy-lifecycle.test.ts`:

```ts
it('trains spy_station_chief and creates matching Spy record with same id', () => {
  const state = makeBaseState();
  state.cities['city-player'].productionQueue = ['spy_station_chief'];
  state.civilizations.player.techState.completed = ['counterintelligence'];
  const bus = new EventBus();
  const newState = processTurn(state, bus);

  const units = Object.values(newState.units).filter(u => u.type === 'spy_station_chief');
  expect(units).toHaveLength(1);
  const spies = Object.values(newState.espionage!['player'].spies);
  expect(spies).toHaveLength(1);
  expect(spies[0].id).toBe(units[0].id);
});
```

- [ ] **Step 2: Run test to verify it fails, then add to `SPY_UNIT_TYPES`**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts` → FAIL.

In `src/systems/espionage-system.ts`:
```ts
const SPY_UNIT_TYPES = new Set<UnitType>([
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_intelligence_officer', 'spy_station_chief', 'spy_hacker',
]);
```

- [ ] **Step 3: Add to `UNIT_CLASS_BY_TYPE`**

In `src/systems/unit-modifier-definitions.ts`, after `spy_intelligence_officer: ['spy'],`:
```ts
  spy_station_chief: ['spy'],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts` → PASS

- [ ] **Step 5: Add to `UNSAFE_UNIT_TYPES` and extend the minor-civ test**

In `src/systems/minor-civ-economy-system.ts`, after `'spy_intelligence_officer',`:
```ts
  'spy_station_chief',
```

Extend the Phase 1 test in `tests/systems/minor-civ-economy-system.test.ts`:
```ts
it('never treats either new spy tier as a safe minor-civ defensive unit', () => {
  expect(SAFE_MINOR_CIV_UNIT_TYPES.has('spy_intelligence_officer')).toBe(false);
  expect(SAFE_MINOR_CIV_UNIT_TYPES.has('spy_station_chief')).toBe(false);
});
```
(Replace the Phase 1 single-assertion test with this combined one.)

- [ ] **Step 6: Add to `BARBARIAN_ELIGIBILITY_BY_UNIT`**

In `src/systems/barbarian-roster.ts`:
```ts
  spy_scout: exclude('unsupported'), spy_informant: exclude('unsupported'), spy_agent: exclude('unsupported'), spy_operative: exclude('unsupported'), spy_intelligence_officer: exclude('unsupported'), spy_station_chief: exclude('unsupported'), spy_hacker: exclude('unsupported'),
```

- [ ] **Step 7: Run the full set of these tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts tests/systems/minor-civ-economy-system.test.ts tests/systems/barbarian-roster.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/systems/espionage-system.ts src/systems/unit-modifier-definitions.ts src/systems/minor-civ-economy-system.ts src/systems/barbarian-roster.ts tests/integration/spy-lifecycle.test.ts tests/systems/minor-civ-economy-system.test.ts
git commit -m "feat(espionage): wire spy_station_chief into spy-identity allowlists"
```

---

### Task 3: Visible upgrade facts (`publicFacts`)

**Files:** `src/systems/combat-role-definitions.ts`, `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders Station Chief public tactical facts in the live production catalog', () => {
  const { container, city, state } = makeWonderPanelFixture();
  state.civilizations.player.techState.completed = ['counterintelligence'];
  const panel = createCityPanel(container, city, state, {
    onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
  });

  expect(panel.querySelector('[data-item-id="spy_station_chief"]')).toBeTruthy();
  const facts = panel.querySelector('[data-unit-role-facts="spy_station_chief"]')?.textContent ?? '';
  expect(facts).toContain('Better base infiltration odds than an Intelligence Officer');
  expect(facts).toContain('+1 vision range and +1 combat strength');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts` → FAIL

- [ ] **Step 3: Add the `UNIT_ROLE_DEFINITIONS` entry**

In `src/systems/combat-role-definitions.ts`, after the `spy_intelligence_officer` entry:
```ts
  spy_station_chief: role('civilian', 'Veteran spy who runs the most demanding covert operations with better odds than an Intelligence Officer.', ['espionage'], {
    counters: [], vulnerableTo: [],
    upgradeFamily: 'espionage',
    publicFacts: ['Better base infiltration odds than an Intelligence Officer', '+1 vision range and +1 combat strength'],
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat-role-definitions.ts tests/ui/city-panel.test.ts
git commit -m "feat(espionage): surface Station Chief's upgrade via publicFacts"
```

---

### Task 4: Sprite and icon rendering

**Files:** `src/renderer/sprites/units.tsx`, `src/renderer/sprites/sprite-catalog.ts`, `src/renderer/unit-visual-resolver.ts`

- [ ] **Step 1: Add the sprite component**

In `src/renderer/sprites/units.tsx`, after `SpyIntelligenceOfficerSprite`:
```tsx
export function SpyStationChiefSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#101014',
    hat: <path d="M-12,-41 Q0,-47 12,-41 L12,-30 L-12,-30 Z M-15,-30 L15,-30 L15,-28 L-15,-28 Z" fill="#0a0a10" />,
    gadget: (
      <g transform="translate(81 57)">
        <rect x="-6" y="-7" width="12" height="10" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-6" y="-7" width="12" height="3" fill={palette.bright} opacity="0.7" />
        <circle cx="0" cy="1" r="1.4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
    ),
  });
}
```

(A locked attache case with a status-light strip — one step darker cloak than Intelligence Officer, gadget reads as "command post" hardware, bridging toward Hacker's tablet.)

- [ ] **Step 2: Register in `UNIT_MOTION_STYLES` and `UNIT_SPRITE_CATALOG`**

In `sprite-catalog.ts`:
```ts
  spy_station_chief: 'humanoid',
```
and:
```ts
  spy_station_chief: withMotion('spy_station_chief', SpyStationChiefSprite),
```
Add `SpyStationChiefSprite` to the import from `./units`.

- [ ] **Step 3: Run the v2 fallback coverage test**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/v2/index.test.ts`
Expected: PASS (same live-fallback rationale as Phase 1 Task 4 — no `.svg.ts` file or `v2/index.ts` edit needed)

- [ ] **Step 4: Add `FALLBACK_ICONS` entry**

`unit-renderer.ts` has no icon map of its own (see Phase 1 Task 4's correction note) — only
`unit-visual-resolver.ts` needs an entry:
```ts
  spy_station_chief: '🕵️',
```
(Matching `FALLBACK_ICONS`'s own local convention of collapsing spy tiers to one generic icon,
same as Phase 1's `spy_intelligence_officer` entry — not `'🧭'`, which was this plan's original,
uncorrected guess before Phase 1 execution found the actual convention.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/units.tsx src/renderer/sprites/sprite-catalog.ts src/renderer/unit-visual-resolver.ts
git commit -m "feat(espionage): add Station Chief sprite and icon wiring"
```

---

### Task 5: SFX

**Files:** `src/audio/sfx-catalog.ts`, `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1: Extend `SPY_TYPES` in the test**

```ts
const SPY_TYPES: UnitType[] = ['spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_intelligence_officer', 'spy_station_chief', 'spy_hacker'];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-catalog.test.ts` → FAIL

- [ ] **Step 3: Add the SFX and locomotion entries**

Reuse the `SPY_OPERATIVE_SFX` object reference introduced in Phase 1 Task 5 — not a fresh `real()`
call — for the same reason documented there (`allSfxEntries()`'s duplicate-id/duplicate-file
checks are string-based across distinct object references):
```ts
  spy_operative: SPY_OPERATIVE_SFX,
  spy_intelligence_officer: SPY_OPERATIVE_SFX,
  // Temporary reuse of the Operative death cue pending bespoke audio — same follow-up as
  // spy_intelligence_officer's own temporary reuse comment above.
  spy_station_chief: SPY_OPERATIVE_SFX,
```
```ts
  spy_station_chief: 'humanoid',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-catalog.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/sfx-catalog.ts tests/audio/sfx-catalog.test.ts
git commit -m "feat(espionage): wire Station Chief SFX (temporary reused death cue)"
```

---

### Task 6: Remaining test-roster lists, paid-upgrade test, hot-seat parity test

**Files:** `tests/systems/espionage-system.test.ts`, `tests/systems/unit-upgrade-system.test.ts`, `tests/integration/spy-lifecycle.test.ts`

- [ ] **Step 1: Extend `espionage-system.test.ts`'s local `SPY_TYPES`**

```ts
const SPY_TYPES = ['spy_scout','spy_informant','spy_agent','spy_operative','spy_intelligence_officer','spy_station_chief','spy_hacker'] as const;
```

- [ ] **Step 2: Run test, fix any tier-count-specific assertion, confirm pass**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/espionage-system.test.ts` → PASS

- [ ] **Step 3: Write the failing paid-upgrade test for the second leg**

```ts
it('allows upgrading an Intelligence Officer to a Station Chief once counterintelligence is researched', () => {
  const city = { /* same fixture shape as the Phase 1 test */ } as City;
  const unit = createUnit('spy_intelligence_officer', 'player', city.position, mkC());
  const result = canUpgradeUnit(unit, city.id, { [city.id]: city }, ['counterintelligence'], 200);
  expect(result.canUpgrade).toBe(true);
  expect(result.targetType).toBe('spy_station_chief');
  expect(result.cost).toBe(93); // ceil(50% of Station Chief's 185 production cost)
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade-system.test.ts` → PASS

- [ ] **Step 5: Write the failing hot-seat parity test**

```ts
it('only the researching civ gets Station Chief access — hot-seat parity', () => {
  const state = makeBaseState();
  state.civilizations.player.techState.completed = ['counterintelligence'];
  state.civilizations['ai-1'] = {
    ...state.civilizations.player,
    id: 'ai-1', name: 'AI', cities: ['city-ai'],
    techState: { ...state.civilizations.player.techState, completed: [] },
  };
  state.cities['city-ai'] = { ...state.cities['city-player'], id: 'city-ai', owner: 'ai-1', productionQueue: [] };
  state.espionage!['ai-1'] = { ...createEspionageCivState(), maxSpies: 2 };

  const playerTrainable = getTrainableUnitsForCiv(state.civilizations.player.techState.completed);
  const aiTrainable = getTrainableUnitsForCiv(state.civilizations['ai-1'].techState.completed);

  expect(playerTrainable.some(u => u.type === 'spy_station_chief')).toBe(true);
  expect(aiTrainable.some(u => u.type === 'spy_station_chief')).toBe(false);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/integration/spy-lifecycle.test.ts` → PASS

- [ ] **Step 7: Commit**

```bash
git add tests/systems/espionage-system.test.ts tests/systems/unit-upgrade-system.test.ts tests/integration/spy-lifecycle.test.ts
git commit -m "test(espionage): lock Station Chief paid-upgrade and hot-seat parity"
```

---

### Task 7: Full verification and PR

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: exit 0. Check `tests/systems/pacing-audit.test.ts` for the 185 cost the same way Phase 1 checked 140.

- [ ] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(espionage): add Station Chief spy unit (era 9 plateau fix, phase 2 of 2)" --body "$(cat <<'EOF'
## Summary
- Adds `spy_station_chief` (era 9, gated on `counterintelligence`) as the second and final new
  spy tier closing the #855 plateau. Retargets `spy_intelligence_officer`'s upgrade chain to
  point here instead of terminating early.
- Closes #855.

## Test plan
- [x] `yarn test` — full suite green
- [x] `yarn build` — type-check green
- [x] Chain integrity, spy-lifecycle, barbarian/minor-civ exclusion, publicFacts render, paid
      upgrade, and hot-seat parity regression tests added
EOF
)"
```

- [ ] **Step 4: Poll CI and merge once green** (same note as Phase 1 Task 7 Step 4 regarding user confirmation of the CI-watch workflow)

- [ ] **Step 5: Sync the design doc's phase-status annotation**

Per `.claude/rules/spec-fidelity.md`, update `docs/superpowers/specs/2026-08-17-issue-855-espionage-unit-plateau-design.md` in this same PR to note both phases merged (with their PR numbers), so a future agent reading the spec doesn't need to cross-reference GitHub to learn this shipped.

---

## Self-review notes

- **Spec coverage:** every numbered item in the design doc's wiring checklist maps to a task above, except items 21-23 (`main.ts` death cleanup, `processCity` dequeue, AI catalog generation) and 31/33 (chain-integrity era check, tech-unlocks-consistency), which are explicitly *automatic* consequences of Tasks 1-2 and are verified by existing generic tests run in Task 7 rather than requiring their own edits — calling this out explicitly rather than silently omitting a task for them.
- **Placeholder scan:** no TBD/TODO in production code; the one open item ("follow-up issue TBD") is inside an SFX code comment describing a deliberately deferred audio-asset task, not a gap in this plan's own implementation — flagged inline in Task 5 rather than hidden.
- **Type consistency:** `spy_intelligence_officer` and `spy_station_chief` strength/vision/movement/cost values are identical everywhere they appear (Task 1 definitions, chain-integrity test assertions, design doc table) — cross-checked against the design doc's roster table.
