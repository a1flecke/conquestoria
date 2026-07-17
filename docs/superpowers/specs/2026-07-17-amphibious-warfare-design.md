# Amphibious Warfare Design

## Goal

Issue #540 makes existing naval transports useful in combat by allowing their
embarked land cargo to assault an adjacent defended coast. The feature delivers
the intended relationship between landing risk, Marine specialization, and naval
fire support without creating a separate combat ruleset for the player or AI.

## Scope

- An embarked land unit may attack an adjacent visible enemy land unit or coastal
  city from its friendly transport.
- A transport may move next to the coast and its cargo may assault in that same
  turn. The cargo consumes its own action; it cannot unload and attack instead.
- Ordinary embarked attackers receive a 0.5 attacker-strength multiplier,
  displayed as `Landing -50%` in the combat preview.
- A new Marine unit, gated by `amphibious-warfare`, is a gunpowder-class unit
  whose data-driven combat modifier negates that landing multiplier.
- An adjacent friendly naval unit with a ranged or bombard attack profile grants
  one bounded +10% shore-support contribution to a landing combat. Multiple
  ships do not stack this bonus.
- The human UI, combat preview, combat resolution, and AI tactical simulation
  use the same targeting, transport, and combat-context helpers.

## Balance, Accessibility, and Player Experience

The feature introduces tactical depth without changing the baseline power of
ordinary land units: the 50% landing multiplier makes an unsupported landing a
deliberate risk, while a single 10% naval contribution rewards preparation
without making ship stacks decisive. The Marine is an era-5, coastal-only
specialist unlocked with `amphibious-warfare`; it has 36 strength, costs 135
production, requires no strategic resource, and upgrades to `machine_gunner`.
This places it above the 32-strength Grenadier but below the 46-strength
Rifleman, and makes its value situational rather than a replacement line.

The interaction must work for both deliberate strategy players and younger or
newer players: selecting cargo uses the existing tap-and-target flow, legal
landing targets are highlighted, and the preview explains the result in text
as well as through modifier styling. The cargo/transport surface includes a
plain-language affordance: `Assault from transport — landing attacks are -50%`
for non-Marines. No required rule is communicated by colour alone.

Difficulty modes do not change the human landing multiplier or give AI units
hidden combat bonuses. `explorer`, `standard`, and `veteran` continue to use
their existing tactical-risk and force-planning profiles; each can select only
legal assaults, with the same deterministic preview as a human player.

## Non-goals

- Transports do not attack, bombard, or provide shore support themselves.
- Embarked units do not otherwise contribute to tile occupancy, support, or
  visibility.
- Assaults cannot target naval units, non-coastal cities, inland tiles, or
  targets beyond the cargo unit's normal attack profile.
- This change does not add a new naval movement or blockade system.

## Architecture

### Canonical assault eligibility and state transition

`transport-system.ts` gains the canonical embarked-assault helper. It verifies
that cargo is aboard its friendly transport, has not acted, has a combat
strength, and can legally attack the proposed adjacent target from the
transport's position. It also requires a coastal land destination or coastal
city, normal target visibility, hostility, and the cargo's normal attack
profile.

The helper performs the disembark/transport cleanup atomically with the normal
combat launch. Cargo cannot remain referenced by the transport after it enters
combat, regardless of the combat result. Existing combat result handling keeps
ownership, capture, defeat, rewards, events, and final positions consistent
with equivalent land attacks.

All preconditions are validated before changing state. The resulting ordinary
combat must emit exactly one existing `combat:resolved` event with the original
viewer-scoped presentation, so notifications, animation, SFX, quests, rewards,
and combat history remain canonical rather than being reimplemented for
amphibious attacks.

### Combat context and modifiers

The shared combat-context builder determines whether an attack is an embarked
assault and records two context-derived modifier parts:

- `Landing -50%` for ordinary cargo;
- `Shore bombardment +10%` if one or more eligible friendly ranged/bombard
  warships are adjacent to the defending hex.

The attack context is consumed by both normal unit combat and city siege
calculation so a coastal city receives the same landing risk and support
behavior as a defended coastal unit.

The Marine is declared in the normal unit definitions, production roster, unit
class catalog, sprite catalog, and AI catalogs. Its amphibious exemption is a
modifier-definition row conditioned on the generic amphibious-assault context;
combat code does not branch on `marine`.

The Marine reuses the established gunpowder infantry combat SFX through an
explicit SFX-catalog entry; it does not need a new audio asset. Its assault
still emits the ordinary combat event, whose presentation is visibility-scoped.

### UI and AI

When a player selects embarked cargo, the existing target/highlight and combat
preview paths expose legal assault targets. The preview includes `Landing -50%`
when it applies and shore bombardment when present before the player commits.

All player-facing ownership, target visibility, preview, notification, and SFX
decisions use `state.currentPlayer`. In hot-seat games, an incoming player sees
only targets and combat presentation visible to that player; no hidden cargo,
defenders, modifier, or sound presentation leaks from the outgoing player.

The tactical AI adds an `amphibious-assault` action. Its scoring uses the same
preview calculation and its execution uses the transport helper, so it may sail
into position and land cargo in one turn but still obeys normal action,
visibility, hostility, and retreat constraints.

## Data, Saves, and Extensibility

The assault state is derived from existing `transportId`, `cargoUnitIds`, map,
and unit-definition data. It introduces no serialized GameState field, so the
save schema version does not change and no migration is added. A compatibility
test will load an existing save containing embarked cargo, verify the cargo
relationship remains valid, and prove the newly registered Marine definition
is available without mutating the save on repeated load.

The action API is actor-scoped rather than tied to `main.ts`: it accepts the
attacking cargo, transport, target, and acting civilization explicitly. This
keeps player, AI, turn-manager, and future scripted callers on one canonical
path. Future landing-specialist units can use the generic
`amphibiousAssault` modifier condition instead of an ID-specific branch.

## Player Truth Table

| Before | Player action | Immediate result |
|---|---|---|
| Embarked eligible land unit beside a defended coast | Select cargo and choose target | Legal target is highlighted and preview shows landing/support modifiers |
| Transport has moved next to eligible coast; cargo has an action | Choose assault target | Cargo attacks immediately, spends its action, and is no longer transport cargo |
| Embarked ordinary land unit attacks | Open preview | `Landing -50%` is visible |
| Embarked Marine attacks | Open preview | No landing-penalty part is shown |
| Eligible friendly bombard ship is adjacent to defender | Open preview | `Shore bombardment +10%` is visible once |

## Test Strategy

- Targeting: prove valid coastal unit/city assaults and reject inland,
  non-coastal-city, naval, invisible, non-hostile, out-of-range, and already
  acted cases.
- Combat: prove the normal landing multiplier, Marine exemption through the
  modifier table, non-stacking shore support, and city-siege parity; assert
  exactly one normal combat event and its ordinary viewer-scoped SFX path.
- Transport integrity: prove cargo/transport references are cleaned up and that
  transport movement plus same-turn cargo assault consumes the cargo action.
- UI: perform the live player interaction and assert the rendered preview text
  before assault; ensure non-eligible cargo exposes no attack target and that
  the clear landing-risk explanation remains visible after reselecting cargo.
- AI: prove a viable embarked assault is ranked and execution follows the shared
  transport action path; run the same legality and deterministic-preview
  assertions across explorer, standard, and veteran challenge profiles.
- Hot seat: prove a second human civilization receives only its own visible
  targets, preview, event presentation, notification, and SFX after handoff.
- Save compatibility: prove an existing embarked-cargo save loads idempotently
  without a schema bump and recognizes Marine definition data.
- Catalog integrity: prove the Marine has unit class, production, AI role and
  research, description, sprite, and SFX registrations, plus an explicit
  upgrade chain.

## Verification

Run the changed-source rule checker, all mirrored targeted Vitest files, then
the full test suite and production TypeScript build before publishing.
