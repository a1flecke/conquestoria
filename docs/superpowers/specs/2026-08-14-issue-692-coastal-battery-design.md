# Coastal Battery design (#692)

## Purpose

Add a Naval Armor-era Coastal Battery that gives a city a narrow, intelligible answer to naval siege pressure without changing land or air combat.

## Gameplay contract

- **Gate:** Naval Armor and a coastal city. The shared city-aware eligibility helper rejects inland cities so players and AI never spend production on an inert naval defense.
- **Cost:** 170 production.
- **Defense:** +8 flat city defense only when the attacker is naval.
- **Counterfire:** The first naval attack that deals damage to each Battery city during a turn consumes its reaction and takes `min(12, round(actual city damage × 0.20))` retaliation. A 1–2 HP hit rounds to zero damage but still consumes that turn's reaction. “Actual city damage” is `CitySiegeResult.hpLost`, captured before a sack or destruction removes the city.
- **Exclusions:** No land or air defense, no land or air counterfire, and no recursive counterfire.
- **Parity:** The same rule applies to human, major-AI, barbarian, and pirate naval attackers. Explorer, Standard, and Veteran have the same rule values and legality.

The building is a defensive coastal specialization, not a universal city-defense upgrade. It remains useful to island, trade, naval, and defensive play styles while neither taxing nor invalidating land-first expansion.

## Architecture

`getCityDefenseBreakdown` remains the sole source of truth for the +8 naval-only defense fact, so live resolution and combat preview agree. It will read the ordinary city building list and add one named flat defense part only for the naval domain.

A new `coastal-defense-system` owns Battery counterfire. Its input is the current state, city id, attacking unit id, attacker domain, actual city HP damage, and source actor. It checks the building, naval domain, positive damage, and an optional city-scoped turn marker. When eligible it applies deterministic capped damage to the attacker, records the current turn on that city, and emits a mutation-owned event containing `recipientCivId: city.owner` plus the actor source. It does not call a combat resolver, so retaliation cannot trigger itself. Presentation delivers only to `recipientCivId`; it never reads `currentPlayer` to infer the recipient.

This deliberately stays separate from `getCityCounterFireDamage`. The older walls counterfire is random, requires an ungarrisoned city, and is not once-per-turn; combining the two would hide different rules behind one misleading name and make future tuning unsafe.

## State and saves

Each city may carry `coastalBatteryCounterfireTurn?: number`. It is a serializable, optional marker:

- absent in legacy saves means the Battery has not fired this turn;
- a malformed, non-finite, or non-integer marker normalizes to absent;
- current saves preserve the marker so a mid-turn reload cannot fire twice;
- no save-schema reservation is made until the current save format is re-audited during implementation.

The marker is city-local. A Battery on another city is still eligible in the same turn.

## Player truth and privacy

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Naval Armor complete; coastal city lacks Battery | Open Build catalog | Coastal Battery is reachable with its cost and plain naval-only explanation. |
| Battery city is hit by a naval attacker | First damaging naval hit this turn | The naval attacker loses the displayed 20%-capped retaliation; the city owner receives the event. |
| Same Battery city is hit again this turn | Second damaging naval hit | No second Battery retaliation. |
| Battery city is attacked by land or air | Any hit | No Battery +8 or retaliation is applied. |
| Two human players share a device | Turn handoff | Only the owning human receives the Battery event; no preview, notification, animation, or audio reveals it to another viewer. |

The city panel shows icon plus text, never color or sound alone: “Naval defense +8. First naval hit each turn returns 20% damage (max 12).” This keeps the mechanic understandable for younger/casual players while giving optimizing players the exact values.

## AI and presentation

Coastal Battery enters the existing generic building eligibility and AI production candidate paths through the same coastal-city eligibility helper used by city production completion. AI may only score its own eligible coastal cities and observed pressure; it cannot inspect hidden enemy units or routes. No new difficulty exception is introduced.

This mechanics delivery adds no audio. The event and visible combat result are the required accessible feedback, while #718 owns fortification audio polish. The existing notification delivery system must target the city owner explicitly.

## Verification matrix

- Naval Armor plus coastal-city gate, exact cost, city-panel description, and full catalog reachability, with an inland-city negative test;
- +8 only for naval attackers, with land/air negative tests;
- first damaging naval hit, same-turn second hit, next-turn reset, and independent city markers;
- 20% calculation uses actual mitigated city damage, capped at 12, and cannot recurse;
- player/AI/barbarian/pirate paths share the resolver, preserve unit/civilization cleanup, and emit the explicit city-owner recipient;
- Explorer/Standard/Veteran rule parity;
- legacy, malformed, current, and mid-turn save/load normalization;
- solo recipient feedback and two-human hot-seat isolation;
- deterministic balance fixtures for an intended naval attacker, comparable land attacker, and a non-Battery city.
