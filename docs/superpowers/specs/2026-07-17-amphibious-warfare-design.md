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

### UI and AI

When a player selects embarked cargo, the existing target/highlight and combat
preview paths expose legal assault targets. The preview includes `Landing -50%`
when it applies and shore bombardment when present before the player commits.

The tactical AI adds an `amphibious-assault` action. Its scoring uses the same
preview calculation and its execution uses the transport helper, so it may sail
into position and land cargo in one turn but still obeys normal action,
visibility, hostility, and retreat constraints.

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
  modifier table, non-stacking shore support, and city-siege parity.
- Transport integrity: prove cargo/transport references are cleaned up and that
  transport movement plus same-turn cargo assault consumes the cargo action.
- UI: perform the live player interaction and assert the rendered preview text
  before assault; ensure non-eligible cargo exposes no attack target.
- AI: prove a viable embarked assault is ranked and execution follows the shared
  transport action path.

## Verification

Run the changed-source rule checker, all mirrored targeted Vitest files, then
the full test suite and production TypeScript build before publishing.
