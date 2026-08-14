# Bunker design (#693)

## Contract

Reinforced Concrete unlocks the 175-production Bunker for cities that already
have Walls. It supersedes Star Fort's +5 city-defense contribution rather than
stacking with it, adds +8 flat city defense, and reduces ranged naval or air
bombardment damage by 15%. Adjacent land assaults do not receive this
mitigation.

The building is a deliberate modern defensive choice: coastal, air-exposed,
and turtle play gain a reliable answer, while mobile, expansionist, and
combined-arms players retain the land-assault counterplay. Explorer, Standard,
and Veteran use the same content and combat rules.

## Architecture

City defense remains typed data owned by `getCityDefenseBreakdown`; it reports
every active and superseded defense part for previews and history. A small
typed city-siege option identifies bombardment, so the existing resolver
applies Bunker's 15% mitigation after the shared defense calculation without
inventing a separate player/AI mutation path. Player attacks, major AI,
pirates, and air operations all consume that system result.

The city build catalog supplies the Walls prerequisite, preserves full catalog
reachability, and names the supersession plainly. AI receives Bunker through
the generic eligible-building catalog; no hidden-state query or building-ID
priority branch is added. The building uses a catalog sprite fallback and no
new sound: its result remains visible in preview and city text, so sound is
not required for accessibility or hot-seat privacy.

## Player truth table

| Before | Action | Immediate result |
| --- | --- | --- |
| Reinforced Concrete, Walls | Open city build catalog | Bunker is visible at 175 production with its plain rule text. |
| Reinforced Concrete, no Walls | Open catalog | Bunker is unavailable and cannot remain queued. |
| Walls, Star Fort, Bunker | Inspect defense preview | Bunker +8 is shown; Star Fort is shown as superseded, not stacked. |
| Bunker city under naval/air bombardment | Resolve attack | Mitigated city damage is 15% lower; preview/history use the same fact. |
| Bunker city under adjacent land assault | Resolve attack | No Bunker bombardment mitigation is applied. |
| Two human hot-seat players | Opponent attack/handoff | Feedback is explicitly recipient-scoped and reveals no hidden action to another player. |

## Verification

- Building gate, cost, full city-catalog reachability, and immediate panel
  refresh after selection.
- Defense breakdown verifies Star Fort supersession, Bunker +8, naval/air
  bombardment mitigation, and adjacent-land negative behavior.
- Player and major-AI actions use the shared result; generic AI production sees
  each eligible building without rival hidden state.
- Current, legacy, malformed, and mid-turn saves remain valid with no new
  persisted state beyond the ordinary building id.
- Deterministic balance cases compare Walls/Star Fort/Bunker against a naval
  bombardment, air strike, adjacent land attacker, and a non-fortified city.
