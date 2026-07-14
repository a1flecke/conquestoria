# Issue #537: Air Interception Defense Design

## Purpose

Finish the unresolved air-interception portion of #537 without changing the
existing ground-combat retaliation contract. The game must represent the
historically distinct defenses of conventional and stealth bombers, make those
defenses legible before and after the player commits an attack, preserve equal
rules for AI, solo, and hot-seat play, and remain safe when new siege or
bombard units are added.

## Verified Starting Point

`resolveCombat` currently decides retaliation from the defender's attack range.
The existing `bombard` defensive-strength penalty is already correct for
ground combat: an adjacent melee attacker can receive nonzero retaliation from
a catapult or artillery crew, but the crew's halved defensive strength keeps
that retaliation weaker than an equivalent frontline unit.

This design deliberately preserves these behaviors:

- An adjacent ranged, siege, or bombard attack can receive retaliation.
- A melee defender cannot retaliate against an attacker outside melee range.
- Ranged-versus-ranged attacks remain reciprocal when the defender reaches the
  attacker.
- Ground siege and bombard combat retains the generic reduced-defense rule.

The remaining defect is air-specific: a bomber currently returns its full
bombard-derived counter-damage when intercepted by an air fighter. That does
not distinguish historical defensive guns from modern bomber evasion.

## Scope

Included:

- Typed defenses for air-domain bombard units when intercepted by an air
  ranged attacker.
- A shared combat-exchange helper used by both resolution and preview.
- Preview and resolved-combat presentation for defensive guns and stealth
  evasion.
- AI tactical evaluation that uses the same exchange consequences as the
  resolver.
- Existing-save compatibility, hot-seat visibility, and SFX behavior.
- Definition-driven regression coverage for every present and future
  siege/bombard profile and every present and future air bombard unit.

Excluded:

- Air basing, mission selection, carriers, radar, and interception targeting
  rules from #539.
- New units or buildings from #547.
- Changes to ground bombardment, city attacks, terrain, class counters, or
  base combat RNG.

## Data Model

Extend `UnitDefinition` with optional `airInterceptionDefense`, valid only
when the unit has `domain: 'air'` and `attackProfile.kind: 'bombard'`:

```ts
type AirInterceptionDefense =
  | { kind: 'turret-fire'; counterDamageMultiplier: number }
  | { kind: 'evasion'; incomingDamageMultiplier: number };
```

The initial catalog entries are:

| Unit | Defense | Effect |
| --- | --- | --- |
| `bomber` | `turret-fire` | Counter-damage against an interceptor is multiplied by `0.25`. |
| `stealth_bomber` | `evasion` | It returns no counter-damage; interception damage dealt to it is multiplied by `0.65`. |

All new air bombard definitions must choose one of these policies. This is
typed gameplay metadata, not a unit-ID switch.

The catalog must reject invalid metadata at test time:

- Every air-domain `bombard` definition has exactly one valid policy.
- `turret-fire.counterDamageMultiplier` and
  `evasion.incomingDamageMultiplier` are finite values greater than zero and
  no greater than one.
- No definition outside the air-domain `bombard` category declares this field.

The field belongs only to static definitions. It is never stored on `Unit`,
`GameState`, or a save payload, so this change requires no save-schema version
bump or migration.

## Combat Resolution

Add a pure shared helper, conceptually
`getCombatExchangeModifiers(attacker, defender)`. It returns the defender's
counter-damage multiplier, defender incoming-damage multiplier, and the
player-facing labels for the exchange.

The helper applies an air-interception policy only when all of these conditions
are true:

1. The attacker is an air-domain unit with a `ranged` attack profile.
2. The defender is an air-domain unit with a `bombard` attack profile.
3. The defender declares `airInterceptionDefense`.

Otherwise it returns neutral multipliers and no air-defense label. This keeps a
bomber attacking a fighter on the ordinary path: the fighter may retaliate at
full strength. It also keeps all ground and city combat unchanged. The helper
must be pure and owner-independent: it receives only the two unit definitions
and does not read player, AI, challenge, fog, or UI state.

`resolveCombat` continues to calculate strength, random factor, and base damage
with its existing deterministic seed. After that normal calculation:

- Turret fire multiplies only the defender's otherwise-valid counter-damage.
- Evasion multiplies only damage dealt to the defender and sets its
  counter-damage multiplier to zero.

Existing non-combat and zero-strength early exits remain before exchange
modifiers. Neither policy creates a new attack path, changes attack legality,
consumes extra actions, or changes the deterministic combat seed.

The existing `bombard` defensive-strength penalty remains separate. It models
poor close defense for all bombard-profile units; it must not be compounded by
another generic ground counter-damage penalty.

The reduced-defense predicate must be shared and based on attack-profile
semantics: `siege` and `bombard` profiles defend poorly. A `ranged` profile,
including the intentionally agile ballista, does not receive that penalty.
This is intentionally separate from air-interception policy: it keeps an
adjacent catapult crew capable of weak retaliation without applying a second
generic counter-damage reduction.

## AI, Difficulty, and Player Parity

Any AI path that estimates whether to launch an air attack must use the shared
exchange helper, or a projected-result helper that calls it. Raw unit strength
alone is insufficient for an intercepting fighter because it misses turret
fire and evasion. The AI must make the same policy-aware tradeoff that the
human preview communicates.

The policy is deliberately identical for every owner and challenge level.
Explorer, Standard, and Veteran may alter world pressure or force composition,
but they must not secretly alter turret-fire or evasion multipliers. Human and
non-human combat callers continue through `resolveCombat`; a hot-seat player
therefore cannot receive a privileged combat rule.

## Preview Contract

`calculateCombatStrengths` and the combat-preview formatter must consume the
same exchange helper used by `resolveCombat`. For an applicable attack, the
live preview must show exactly one additional defense explanation, with a
plain-language clause before the exact number:

- `Bomber gunners fire back weakly: 25% return fire`
- `Stealth makes it harder to hit: −35% interceptor damage`

No air-defense wording appears for ordinary ground combat, city combat, a
bomber attacking a fighter, or an air fight with no applicable policy. The
preview must never imply full retaliation when the resolver applies a reduced
or zero counterattack. The live resolved-combat presentation and notification
log must reuse the same label so a player who acts quickly can still understand
why the exchange differed.

The preview is visible only after normal target legality and viewer-visibility
checks succeed. In hot seat, changing `currentPlayer` must not reveal an
unseen opponent bomber's policy through a preview or notification before that
player has earned the required visibility.

Turret fire reuses the existing secondary ranged-hit/counterattack SFX path;
it must play once only when nonzero counter-damage is applied. Stealth evasion
plays no invented defensive-shot SFX because it causes no return damage. This
fix adds no asset and does not claim the broader air-audio work reserved for
#539.

## Regression Coverage

### Targeted combat behavior

Use fixed combat seeds to prove all of the following:

1. Adjacent attacks against a melee defender still take retaliation.
2. Long-range attacks against a melee defender take no retaliation.
3. Ordinary ranged-versus-ranged combat remains reciprocal when range permits.
4. A fighter intercepting `bomber` takes nonzero but reduced turret-fire
   counter-damage.
5. A fighter intercepting `stealth_bomber` takes zero counter-damage and deals
   reduced interception damage.
6. A bomber attacking a fighter receives the fighter's normal counterattack.
7. Ground bombard units continue to retaliate at adjacent range while defending
   poorly.
8. Civilian and zero-strength early exits remain unchanged.
9. The same units and seed produce the same result regardless of owner,
   `currentPlayer`, or challenge profile.

In addition to single-seed contract tests, run a deterministic multi-seed
balance sample for the two fighter-versus-bomber pairings. The sampled average
must show that the fighter remains favored against both bomber doctrines; the
turret-fire bomber deals positive but clearly sub-frontline return damage; and
stealth evasion reduces, but does not erase, the fighter's advantage. The
implementation plan will set numeric bounds from the current unit strengths
and retain them as a balance regression rather than treating `0.25` and `0.65`
as untested constants.

### Definition-driven completeness checks

Tests must enumerate `UNIT_DEFINITIONS`; they must not maintain a hardcoded
unit roster.

- Every definition with an attack profile of kind `siege` or `bombard` must
  receive the reduced defensive-strength behavior.
- Every air-domain `bombard` definition must have valid
  `airInterceptionDefense` metadata.
- No non-air or non-bombard definition may declare air-interception metadata.
- For every catalogued air bombard definition, an interception fixture must
  prove the declared policy is reflected in the shared exchange helper.

These checks make an omitted future trebuchet, artillery, bomber, or other
bombard policy a test failure rather than a silent balance regression.

### Player-visible behavior

Unit tests must assert the exact preview text for turret fire and evasion, plus
negative cases. A live attack-preview integration test must open the real
selected-unit preview path and assert it renders the same label that the
resolver uses. It must also prove a fogged hot-seat viewer cannot open that
preview or learn the label.

Resolved-combat presentation tests must prove turret fire uses exactly one
existing secondary-hit SFX when it deals damage, while evasion produces no
defensive-fire SFX. A notification-log regression must prove the post-combat
message uses the same policy explanation as the preview.

AI coverage must exercise an air intercept evaluation rather than only calling
the resolver from an AI turn. It must prove an AI fighter accounts for turret
fire and evasion before selecting its target. Add one human-path and one
non-human-path parity case with identical state and seed.

Save coverage must load a legacy-schema fixture containing existing `bomber`
and `stealth_bomber` units, resolve both interceptions, and assert that the
schema version does not change solely because this catalog behavior changed.

## Verification

After implementation, run:

```sh
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/combat-system.ts src/systems/unit-system.ts src/ui/combat-preview.ts src/main.ts src/ai/ai-tactics.ts src/audio/sfx-director.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/ui/combat-preview.test.ts tests/main.integration.test.ts tests/ai/ai-tactics.test.ts tests/audio/sfx-director.test.ts tests/storage/save-migrations.test.ts
bash scripts/run-with-mise.sh yarn build
```

The narrow test suite establishes combat, balance, AI, audio, save, hot-seat,
and visible-preview contracts; `yarn build` verifies the discriminated metadata
and all callers type-check.
