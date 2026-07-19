# Issue 441: Espionage building era rebalance

## Goal

Move the two city-based counter-intelligence buildings into the historical eras
where players and AI opponents can make meaningful use of them, without breaking
existing saves or creating an AI-only advantage.

## Scope

- Move Intelligence Agency from era 2 to era 8, gated by Political Intelligence.
- Move Security Bureau from era 4 to era 10, gated by Cold War Networks.
- Preserve the existing per-turn CI values: Intelligence Agency gives 20 and
  Security Bureau gives 30.
- Preserve their existing fade thresholds: Digital Surveillance halves
  Intelligence Agency and Signals Intelligence halves Security Bureau.
- Make AI production value defensive espionage buildings only when city-local
  espionage pressure makes that defense useful.
- Keep existing built buildings and queues valid after loading an older save.

## Data and gameplay

Building definitions remain the canonical source for their tech gate, CI
behavior, and AI production semantics. Each defensive espionage building will
declare typed metadata sufficient for AI scoring rather than requiring
building-ID branches in AI production.

Political Intelligence receives `intelligence-agency` in its
`unlocksBuildings` list, and Informant Rings no longer lists it. Cold War
Networks receives `security-bureau`, and Counter-Intelligence no longer lists
it. The resulting `unlocksBuildings` backlinks must exactly match the building
definitions.

The buildings retain their current CI contribution and fade behavior. In
particular, Security Bureau must not be gated by Signals Intelligence: doing so
would make it fade as soon as it becomes available. Its Cold War Networks gate
ensures a player can receive its full 30 CI before Signals Intelligence halves
it to 15.

The Security Bureau player-facing description expands the abbreviation on first
use as “counter-intelligence (CI)”; all effect claims remain mechanically true.

## AI behavior

AI production continues to discover eligible buildings through
`getAvailableBuildings`; it receives no special tech, resource, or difficulty
exception. A defensive espionage building gets an additional generic strategic
value only when its city has live defensive need: a detected hostile spy or no
counter-intelligence protection. With neither signal, its defensive value is
zero and it remains naturally deprioritized behind economic infrastructure.

This scoring is definition-driven. Future defensive espionage buildings can opt
in through the same typed metadata; AI production must not branch on
`intelligence-agency` or `security-bureau` IDs. Opponent difficulty does not
change the building effect or eligibility.

## UI, saves, and audio

The city production panel already resolves availability from the selected
city's owner, so each hot-seat player sees only their own research gate. No new
panel, action, notification, or sound is introduced.

No save-schema migration is needed. Built buildings retain their effects, and a
pre-update production queue is deliberately grandfathered so invested
production is not silently discarded. The rebalance applies to new production
choices after the save is loaded.

## Verification

- Assert each building's new gate and the matching old/new tech backlinks.
- Assert the buildings are unavailable before their new gates and available at
  their new gates.
- Assert full and faded CI values, including the negative case that Security
  Bureau is full before Signals Intelligence.
- Assert AI candidates receive defensive value only with a detected threat or
  missing CI, and are not boosted without either condition.
- Assert a legacy queue and completed building survive a load/turn cycle while
  a newly opened production list still enforces the new gate.
- Assert solo and hot-seat city panels use the city owner's tech state.
- Run targeted system, AI, UI, and storage tests; source-rule checks; build;
  and the full test suite.
